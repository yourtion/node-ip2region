import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { format } from "oxfmt";
import { xdbFixture } from "../tests/fixtures.mjs";
import { applyStage, inspectDatabase, renderBundled, renderReadme, stageData, validateStage } from "./update-data.mjs";
import { prepareDataUpdate } from "./check-data-update.mjs";

const revision = "a".repeat(40);
const fields = ["country_name", "region_name", "city_name", "isp", "country_code"];
const license = readFileSync(new URL("../data/LICENSE.ip2region.md", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => JSON.stringify(value, null, 2) + "\n";
const names = [
  "data/ip2region_v4.xdb",
  "data/ip2region_v6.xdb",
  "data/LICENSE.ip2region.md",
  "data/manifest.json",
  "src/bundled.ts",
  "data/README.md",
];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "ip2region-data-update-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, "repo");
  const from = join(directory, "candidate");
  const stage = join(directory, "staged");
  mkdirSync(join(root, "data"), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(from);
  const manifest = {
    version: 1,
    upstream: {
      repository: "lionsoul2014/ip2region",
      revision,
      retrievedAt: "2026-10-23",
      source: "upstream-download",
    },
    fields,
    license: { file: "LICENSE.ip2region.md", sha256: hash(license) },
    files: [4, 6].map((family) => {
      const file = `ip2region_v${family}.xdb`;
      const bytes = Buffer.from(xdbFixture({ family, exclusive: false }));
      writeFileSync(join(root, "data", file), bytes);
      writeFileSync(join(from, file), bytes);
      return { family, file, bytes: bytes.length, builtAt: "2024-01-01T00:00:00.000Z", sha256: hash(bytes) };
    }),
  };
  writeFileSync(join(root, "data/LICENSE.ip2region.md"), license);
  writeFileSync(join(from, "LICENSE.ip2region.md"), license);
  writeFileSync(join(root, "data/manifest.json"), serialize(manifest));
  writeFileSync(join(root, "src/bundled.ts"), renderBundled(manifest));
  writeFileSync(
    join(root, "data/README.md"),
    renderReadme(manifest, "# Data\n\n<!-- bundled-data:start -->\n<!-- bundled-data:end -->\n\nKeep instructions.\n")
  );
  return { directory, root, from, stage, revision };
}

const snapshot = (root) => Object.fromEntries(names.map((name) => [name, hash(readFileSync(join(root, name)))]));

function automatic(options) {
  return {
    ...options,
    revision: "b".repeat(40),
    fetchFile: async (url) =>
      readFileSync(join(options.from, url.endsWith("LICENSE.md") ? "LICENSE.ip2region.md" : url.split("/").at(-1))),
  };
}

test("automatic checks ignore upstream code-only commits and retrieval dates", async (t) => {
  const options = fixture(t);
  const before = snapshot(options.root);
  const result = await prepareDataUpdate(automatic(options));
  assert.equal(result.status, "unchanged");
  assert.deepEqual(snapshot(options.root), before);
  assert.equal(result.report.manifest.upstream.revision, "b".repeat(40));
  assert.ok(existsSync(join(options.stage, "report.json")));
});

test("automatic changes update both snapshot metadata and the review report, then become a no-op", async (t) => {
  const options = fixture(t);
  writeFileSync(
    join(options.from, "ip2region_v6.xdb"),
    xdbFixture({ family: 6, exclusive: false, region: "New|Area|City|ISP|NX" })
  );
  const result = await prepareDataUpdate(automatic(options));
  assert.equal(result.status, "updated");
  assert.deepEqual(JSON.parse(readFileSync(join(options.root, "data/manifest.json"))), result.report.manifest);
  assert.ok(result.report.checks[1].changes.changedRecords > 0);
  assert.match(result.body, /IPv4.*\n.*IPv6/);
  assert.match(result.body, /License content changed: \*\*no\*\*/);
  assert.ok(result.body.includes(result.report.manifest.files[1].sha256));
  const before = snapshot(options.root);
  const repeated = await prepareDataUpdate({ ...automatic(options), stage: options.stage + "-repeat" });
  assert.equal(repeated.status, "unchanged");
  assert.deepEqual(snapshot(options.root), before);
});

test("an identical pending snapshot preserves its existing PR even when the upstream SHA advances", async (t) => {
  const options = fixture(t);
  writeFileSync(
    join(options.from, "ip2region_v4.xdb"),
    xdbFixture({ exclusive: false, region: "New|Area|City|ISP|NX" })
  );
  const pending = (await stageData({ ...automatic(options), from: undefined, stage: options.stage + "-pending" }))
    .manifest;
  const before = snapshot(options.root);
  const result = await prepareDataUpdate({ ...automatic(options), revision: "c".repeat(40), pending });
  assert.equal(result.status, "pending");
  assert.deepEqual(snapshot(options.root), before);
});

test("a newer snapshot replaces an older pending candidate", async (t) => {
  const options = fixture(t);
  const pending = JSON.parse(readFileSync(join(options.root, "data/manifest.json")));
  writeFileSync(
    join(options.from, "ip2region_v4.xdb"),
    xdbFixture({ exclusive: false, region: "New|Area|City|ISP|NX" })
  );
  const result = await prepareDataUpdate({ ...automatic(options), pending });
  assert.equal(result.status, "updated");
  assert.notEqual(result.report.manifest.files[0].sha256, pending.files[0].sha256);
});

test("license-only updates produce a PR and unsupported licenses fail without changing the checkout", async (t) => {
  const options = fixture(t);
  writeFileSync(
    join(options.from, "LICENSE.ip2region.md"),
    Buffer.concat([license, Buffer.from("\nCopyright update\n")])
  );
  const result = await prepareDataUpdate(automatic(options));
  assert.equal(result.status, "updated");
  assert.match(result.body, /yes — review the license diff/);
  const before = snapshot(options.root);
  writeFileSync(join(options.from, "LICENSE.ip2region.md"), "An unsupported license");
  await assert.rejects(
    () => prepareDataUpdate({ ...automatic(options), stage: options.stage + "-invalid" }),
    /Upstream license changed/
  );
  assert.deepEqual(snapshot(options.root), before);
});

test("automatic checks reject invalid candidates, download failures and unverified pending manifests", async (t) => {
  const options = fixture(t);
  const before = snapshot(options.root);
  await assert.rejects(
    () =>
      prepareDataUpdate({
        ...automatic(options),
        fetchFile: async () => {
          throw new Error("download failed");
        },
      }),
    /download failed/
  );
  const pending = JSON.parse(readFileSync(join(options.root, "data/manifest.json")));
  pending.upstream.source = "local-files";
  await assert.rejects(() => prepareDataUpdate({ ...automatic(options), pending }), /upstream-download/);
  writeFileSync(join(options.from, "ip2region_v6.xdb"), xdbFixture({ family: 6, region: "bad|schema" }));
  await assert.rejects(() => prepareDataUpdate(automatic(options)), /five columns/);
  assert.deepEqual(snapshot(options.root), before);
});

test("local staging validates both families, records honest provenance and preserves installed files", async (t) => {
  const options = fixture(t);
  const before = snapshot(options.root);
  const report = await stageData(options);
  assert.deepEqual(snapshot(options.root), before);
  assert.equal(report.manifest.upstream.source, "local-files");
  assert.match(report.provenance, /has not been authenticated/);
  assert.equal(report.checks.length, 2);
  for (const check of report.checks) {
    assert.equal(check.changes.changedRecords, 0);
    assert.equal(check.changes.unchangedRecords, check.records);
    assert.equal(check.referenceChecks, check.records * 2);
  }
  const verified = await validateStage(options);
  assert.deepEqual(verified.report, report);
  await assert.rejects(() => stageData(options), /already exists/);
  assert.deepEqual((await validateStage(options)).report, report);
});

test("apply updates paired files, manifest, source and only marked documentation", async (t) => {
  const options = fixture(t);
  for (const family of [4, 6]) {
    writeFileSync(
      join(options.from, `ip2region_v${family}.xdb`),
      xdbFixture({ family, exclusive: false, region: "New|Area|First|New ISP|NX" })
    );
  }
  const report = await stageData(options);
  assert.ok(report.checks.every((check) => check.changes.changedRecords > 0));
  await applyStage(options);
  assert.deepEqual(JSON.parse(readFileSync(join(options.root, "data/manifest.json"))), report.manifest);
  for (const file of report.manifest.files)
    assert.equal(hash(readFileSync(join(options.root, "data", file.file))), file.sha256);
  const source = readFileSync(join(options.root, "src/bundled.ts"), "utf8");
  assert.match(source, /local:/);
  assert.match(source, /unverified/);
  const readme = readFileSync(join(options.root, "data/README.md"), "utf8");
  assert.match(readme, /Keep instructions/);
  assert.match(readme, /has not been authenticated/);
  for (const target of ["data/README.md", "src/bundled.ts", "data/manifest.json"]) {
    const actual = readFileSync(join(options.root, target), "utf8");
    const formatted = await format(target, actual, { printWidth: 120, trailingComma: "es5" });
    assert.deepEqual(formatted.errors, []);
    assert.equal(actual, formatted.code, `Applied ${target} must pass repository formatting`);
  }
  assert.equal(existsSync(join(options.root, ".data-update.lock")), false);
  assert.equal(
    readdirSync(options.root).some((name) => name.startsWith(".data-update-")),
    false
  );
  await assert.rejects(() => applyStage(options), /Installed files changed/);
});

test("range difference report distinguishes removed/added boundaries and changed values", async (t) => {
  const options = fixture(t);
  const region = "Example|Region|First|Example ISP|EX";
  const rows = [
    [0n, 0n, region],
    [0xc0000200n, 0xc0000201n, region],
    [0xc0000202n, 0xc0000202n, region],
    [0xffffffffn, 0xffffffffn, region],
  ];
  writeFileSync(join(options.from, "ip2region_v4.xdb"), xdbFixture({ rows, edges: false, exclusive: false }));
  const report = await stageData(options);
  assert.deepEqual(report.checks[0].changes, {
    addedRanges: 2,
    removedRanges: 1,
    changedRecords: 0,
    unchangedRecords: 2,
  });
});

test("a zero build timestamp remains unknown in the report, manifest and generated documentation", async (t) => {
  const options = fixture(t);
  const path = join(options.from, "ip2region_v4.xdb");
  const bytes = readFileSync(path);
  bytes.writeUInt32LE(0, 4);
  writeFileSync(path, bytes);
  const report = await stageData(options);
  assert.equal(report.checks[0].builtAt, null);
  assert.equal(report.manifest.files[0].builtAt, null);
  await applyStage(options);
  const installed = JSON.parse(readFileSync(join(options.root, "data/manifest.json")));
  assert.equal(installed.files[0].builtAt, null);
  assert.match(readFileSync(join(options.root, "data/README.md"), "utf8"), /ip2region_v4\.xdb.*unknown/);
});

test("reject invalid candidate family, structure, truncation, UTF-8 and field count without replacing data", async (t) => {
  const options = fixture(t);
  const before = snapshot(options.root);
  const candidates = [
    xdbFixture({ family: 4 }),
    xdbFixture({ family: 6, structure: 7 }),
    xdbFixture({ family: 6 }).subarray(0, 30),
    xdbFixture({ family: 6, region: "short|record" }),
    xdbFixture({ family: 6, region: "too|many|columns|in|this|record" }),
  ];
  const badUtf8 = xdbFixture({ family: 6 });
  badUtf8[256 + 65536 * 8] = 255;
  candidates.push(badUtf8);
  for (const candidate of candidates) {
    writeFileSync(join(options.from, "ip2region_v6.xdb"), candidate);
    await assert.rejects(() => stageData(options));
    assert.deepEqual(snapshot(options.root), before);
    assert.equal(existsSync(options.stage), false);
  }
});

test("validation checks every record, including a record outside the sampled boundary set", async () => {
  const rows = Array.from({ length: 300 }, (_, i) => [
    0xc0000000n + BigInt(i),
    0xc0000000n + BigInt(i),
    i === 1 ? "bad" : "Example|Region|First|ISP|EX",
  ]);
  const bytes = Buffer.from(xdbFixture({ rows, edges: false, exclusive: false }));
  await assert.rejects(() => inspectDatabase(bytes, 4), /five columns/);
});

test("stage rejects edited report, edited bytes, changed baseline and invalid license", async (t) => {
  const options = fixture(t);
  const before = snapshot(options.root);
  await stageData(options);
  const reportPath = join(options.stage, "report.json");
  const original = readFileSync(reportPath);
  writeFileSync(reportPath, original + " ");
  await assert.rejects(() => applyStage(options), /digest mismatch/);
  writeFileSync(reportPath, original);
  const bytesPath = join(options.stage, "ip2region_v4.xdb");
  const bytes = readFileSync(bytesPath);
  writeFileSync(bytesPath, xdbFixture({ exclusive: false, region: "Other|Area|City|ISP|OO" }));
  await assert.rejects(() => applyStage(options), /Staged files or validation report changed/);
  writeFileSync(bytesPath, bytes);
  const report = JSON.parse(original);
  report.checks[0].records++;
  const edited = serialize(report);
  writeFileSync(reportPath, edited);
  writeFileSync(join(options.stage, "report.sha256"), hash(edited));
  await assert.rejects(() => applyStage(options), /Staged files or validation report changed/);
  assert.deepEqual(snapshot(options.root), before);
  writeFileSync(reportPath, original);
  writeFileSync(join(options.stage, "report.sha256"), hash(original));
  writeFileSync(join(options.root, "src/bundled.ts"), "// unrelated edit\n");
  await assert.rejects(() => applyStage(options), /Installed files changed/);
  rmSync(options.stage, { recursive: true });
  writeFileSync(join(options.from, "LICENSE.ip2region.md"), "unknown license");
  await assert.rejects(() => stageData(options), /Upstream license changed/);
});

test("replacement failure restores every already-replaced file and releases its lock", async (t) => {
  const options = fixture(t);
  const before = snapshot(options.root);
  await stageData(options);
  let calls = 0;
  await assert.rejects(
    () =>
      applyStage({
        ...options,
        rename(from, to) {
          if (++calls === 4) throw new Error("injected replacement failure");
          renameSync(from, to);
        },
      }),
    /injected replacement failure/
  );
  assert.equal(calls, 4);
  assert.deepEqual(snapshot(options.root), before);
  assert.equal(existsSync(join(options.root, ".data-update.lock")), false);
  assert.equal(
    readdirSync(options.root).some((name) => name.startsWith(".data-update-")),
    false
  );
});

test("invalid revision, staging overlap, symlink files and a concurrent lock are rejected", async (t) => {
  const options = fixture(t);
  await assert.rejects(() => applyStage({ root: options.root }), /--stage is required/);
  await assert.rejects(() => validateStage({ root: options.root }), /--stage is required/);
  for (const revision of ["main", "../main", "A".repeat(40), "a".repeat(39)])
    await assert.rejects(() => stageData({ ...options, revision }), /complete lowercase/);
  await assert.rejects(() => stageData({ ...options, stage: join(options.root, "new-stage") }), /outside and separate/);
  await stageData(options);
  mkdirSync(join(options.root, ".data-update.lock"));
  await assert.rejects(() => applyStage(options), /EEXIST/);
  assert.equal(existsSync(join(options.root, ".data-update.lock")), true);
  rmSync(join(options.root, ".data-update.lock"), { recursive: true });
  // Windows junction/file-symlink creation may require privileges; use actual
  // symlinks where the host supports them, without weakening normal file checks.
  if (process.platform !== "win32") {
    const target = join(options.stage, "ip2region_v4.xdb");
    rmSync(target);
    symlinkSync(join(options.from, "ip2region_v4.xdb"), target);
    await assert.rejects(() => applyStage(options), /regular file/);
  }
});

test("download staging uses pinned HTTPS paths and cleans a partially downloaded stage", async (t) => {
  const options = fixture(t);
  const requests = [];
  const report = await stageData({
    ...options,
    from: undefined,
    fetchFile: async (url, destination, limit) => {
      requests.push({ url, destination, limit });
      return readFileSync(
        join(options.from, url.endsWith("/LICENSE.md") ? "LICENSE.ip2region.md" : url.split("/").at(-1))
      );
    },
  });
  assert.equal(report.manifest.upstream.source, "upstream-download");
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      `https://raw.githubusercontent.com/lionsoul2014/ip2region/${revision}/data/ip2region_v4.xdb`,
      `https://raw.githubusercontent.com/lionsoul2014/ip2region/${revision}/data/ip2region_v6.xdb`,
      `https://raw.githubusercontent.com/lionsoul2014/ip2region/${revision}/LICENSE.md`,
    ]
  );
  assert.deepEqual(
    requests.map((request) => request.limit),
    [256 * 1024 * 1024, 256 * 1024 * 1024, 1024 * 1024]
  );
  rmSync(options.stage, { recursive: true });
  const before = snapshot(options.root);
  let count = 0;
  await assert.rejects(
    () =>
      stageData({
        ...options,
        from: undefined,
        fetchFile: async () => {
          if (++count === 2) throw new Error("HTTP 503");
          return readFileSync(join(options.from, "ip2region_v4.xdb"));
        },
      }),
    /HTTP 503/
  );
  assert.equal(existsSync(options.stage), false);
  assert.deepEqual(snapshot(options.root), before);
});
