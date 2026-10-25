import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { newWithBuffer, IPv4, IPv6 } from "ip2region.js";
import { format } from "oxfmt";
import { createXDB, IP2REGION_FIELDS } from "../dist/esm/formats/ip2region-xdb.js";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = "lionsoul2014/ip2region";
const maxDatabaseBytes = 256 * 1024 * 1024;
const maxTextBytes = 1024 * 1024;
const files = ["ip2region_v4.xdb", "ip2region_v6.xdb", "LICENSE.ip2region.md"];
const targets = [...files.map((file) => `data/${file}`), "data/manifest.json", "src/bundled.ts", "data/README.md"];
const begin = "<!-- bundled-data:start -->";
const end = "<!-- bundled-data:end -->";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";

function revisionOf(revision) {
  if (typeof revision !== "string" || !/^[0-9a-f]{40}$/.test(revision))
    throw new Error("revision must be a complete lowercase 40-character Git commit SHA");
  return revision;
}

function readFile(path, limit = maxTextBytes) {
  const info = lstatSync(path);
  if (!info.isFile() || info.size > limit) throw new Error(`Expected a regular file no larger than ${limit}: ${path}`);
  const bytes = readFileSync(path);
  if (bytes.length > limit) throw new Error(`File grew beyond its size limit: ${path}`);
  return bytes;
}

function within(path, parent) {
  const rel = relative(parent, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function safeStage(root, stage, existing = true) {
  const resolvedRoot = realpathSync(root);
  const resolvedStage = existing
    ? realpathSync(stage)
    : join(realpathSync(dirname(resolve(stage))), resolve(stage).split(sep).at(-1));
  // Keep candidate/report trees out of the checkout, including through symlinks.
  if (within(resolvedStage, resolvedRoot) || within(resolvedRoot, resolvedStage))
    throw new Error("The staging directory must be outside and separate from the repository");
  if (existing && lstatSync(stage).isSymbolicLink()) throw new Error("The staging directory cannot be a symlink");
  return { root: resolvedRoot, stage: resolvedStage };
}

function installed(root) {
  const content = new Map();
  for (const target of targets) {
    const path = join(root, target);
    if (realpathSync(dirname(path)) !== resolve(dirname(path)))
      throw new Error(`Target parent cannot be a symlink: ${target}`);
    content.set(target, readFile(path, target.endsWith(".xdb") ? maxDatabaseBytes : maxTextBytes));
  }
  const manifest = JSON.parse(content.get("data/manifest.json"));
  if (manifest.version !== 1 || manifest.upstream?.repository !== repository)
    throw new Error("Unsupported installed data manifest");
  revisionOf(manifest.upstream.revision);
  assert.deepEqual(manifest.fields, [...IP2REGION_FIELDS], "Installed field schema differs from the adapter preset");
  for (const [i, family] of [4, 6].entries()) {
    const file = manifest.files?.[i];
    const bytes = content.get(`data/ip2region_v${family}.xdb`);
    if (file?.family !== family || file.file !== files[i] || file.sha256 !== hash(bytes) || file.bytes !== bytes.length)
      throw new Error(`Installed manifest does not match IPv${family} bytes`);
  }
  if (manifest.license?.file !== files[2] || manifest.license.sha256 !== hash(content.get(`data/${files[2]}`)))
    throw new Error("Installed license does not match the manifest");
  return { manifest, content, hashes: Object.fromEntries([...content].map(([path, bytes]) => [path, hash(bytes)])) };
}

function address(bytes, at, family) {
  if (family === 4) return Array.from({ length: 4 }, (_, i) => bytes[at + 3 - i]).join(".");
  return Array.from({ length: 8 }, (_, i) => bytes.readUInt16BE(at + i * 2).toString(16)).join(":");
}

function index(bytes, family) {
  const width = family === 4 ? 4 : 16;
  const stride = width * 2 + 6;
  const first = bytes.readUInt32LE(8);
  const last = bytes.readUInt32LE(12);
  return { width, stride, first, last, count: (last - first) / stride + 1 };
}

function payload(bytes, at, width) {
  const size = bytes.readUInt16LE(at + width * 2);
  const pointer = bytes.readUInt32LE(at + width * 2 + 2);
  return bytes.subarray(pointer, pointer + size);
}

/** Structural checks use the shipped reader; every referenced payload is checked. */
export async function inspectDatabase(bytes, family) {
  const query = createXDB(bytes, { fields: IP2REGION_FIELDS });
  let reference;
  try {
    assert.deepEqual(query.capabilities.families, [family], `Expected an IPv${family} database`);
    const layout = index(bytes, family);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const checked = new Set();
    let emptyRecords = 0;
    for (let at = layout.first; at <= layout.last; at += layout.stride) {
      const size = bytes.readUInt16LE(at + layout.width * 2);
      if (size === 0) {
        emptyRecords++;
        continue;
      }
      const pointer = bytes.readUInt32LE(at + layout.width * 2 + 2);
      const key = `${pointer}:${size}`;
      if (!checked.has(key)) {
        const text = decoder.decode(payload(bytes, at, layout.width));
        if (text.split("|").length !== IP2REGION_FIELDS.length)
          throw new Error(`IPv${family} record at ${pointer} does not have the configured five columns`);
        checked.add(key);
      }
    }
    reference = newWithBuffer(family === 4 ? IPv4 : IPv6, bytes);
    let referenceChecks = 0;
    const samples = Math.min(128, layout.count);
    for (let i = 0; i < samples; i++) {
      const at = layout.first + Math.floor((i * (layout.count - 1)) / Math.max(1, samples - 1)) * layout.stride;
      for (const offset of [at, at + layout.width]) {
        const ip = address(bytes, offset, family);
        assert.equal(
          query.lookup(ip)?.extensions.region ?? "",
          await reference.search(ip),
          `Reference mismatch: ${ip}`
        );
        referenceChecks++;
      }
    }
    return {
      family,
      file: `ip2region_v${family}.xdb`,
      bytes: bytes.length,
      builtAt: query.metadata.builtAt ?? null,
      sha256: hash(bytes),
      records: layout.count,
      distinctPayloads: checked.size,
      emptyRecords,
      referenceChecks,
    };
  } finally {
    query.close();
    reference?.close();
  }
}

function compareRange(left, a, right, b, family, width) {
  for (const half of [0, width]) {
    for (let i = 0; i < width; i++) {
      const offset = half + (family === 4 ? width - i - 1 : i);
      if (left[a + offset] !== right[b + offset]) return left[a + offset] < right[b + offset] ? -1 : 1;
    }
  }
  return 0;
}

function changes(before, after, family) {
  const a = index(before, family);
  const b = index(after, family);
  const result = { addedRanges: 0, removedRanges: 0, changedRecords: 0, unchangedRecords: 0 };
  let left = a.first;
  let right = b.first;
  while (left <= a.last || right <= b.last) {
    const order = left > a.last ? 1 : right > b.last ? -1 : compareRange(before, left, after, right, family, a.width);
    if (order < 0) {
      result.removedRanges++;
      left += a.stride;
    } else if (order > 0) {
      result.addedRanges++;
      right += b.stride;
    } else {
      result[
        payload(before, left, a.width).equals(payload(after, right, b.width)) ? "unchangedRecords" : "changedRecords"
      ]++;
      left += a.stride;
      right += b.stride;
    }
  }
  return result;
}

function licenseOf(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.includes("SPDX-License-Identifier: Apache-2.0 OR MIT"))
    throw new Error("Upstream license changed: this tool only supports the reviewed Apache-2.0 OR MIT license");
  return { file: files[2], sha256: hash(bytes) };
}

async function analyze(input, base, revision, retrievedAt, source) {
  const checks = [];
  for (const family of [4, 6]) {
    const name = `ip2region_v${family}.xdb`;
    const before = base.content.get(`data/${name}`);
    // Validate installed bytes before comparing arbitrary candidate ranges with them.
    await inspectDatabase(before, family);
    checks.push({
      ...(await inspectDatabase(input.get(name), family)),
      changes: changes(before, input.get(name), family),
    });
  }
  const manifest = {
    version: 1,
    upstream: { repository, revision, retrievedAt, source },
    fields: [...IP2REGION_FIELDS],
    license: licenseOf(input.get(files[2])),
    files: checks.map(({ family, file, bytes, builtAt, sha256 }) => ({ family, file, bytes, builtAt, sha256 })),
  };
  return {
    version: 1,
    manifest,
    base: base.hashes,
    checks,
    licenseChanged: manifest.license.sha256 !== base.manifest.license.sha256,
    provenance:
      source === "upstream-download"
        ? "Downloaded from the pinned upstream HTTPS paths"
        : "Local files; the supplied revision has not been authenticated against upstream",
    limits:
      "Column counts do not establish field meanings or geographic accuracy. Range splits count as removed/added ranges. Build time is not record freshness. Review upstream schema and license before applying.",
  };
}

async function download(url, destination, maximum) {
  // No shell: fixed HTTPS upstream paths, explicit size/time caps, inherited proxy/CA.
  await promisify(execFile)(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--proto",
      "=https",
      "--max-redirs",
      "0",
      "--max-time",
      "120",
      "--max-filesize",
      String(maximum),
      "--output",
      destination,
      url,
    ],
    { timeout: 125000, maxBuffer: maxTextBytes }
  );
  return readFile(destination, maximum);
}

export async function stageData({ root = rootDirectory, stage, revision, from, fetchFile = download }) {
  revisionOf(revision);
  if (!stage) throw new Error("--stage is required");
  const paths = safeStage(root, stage, false);
  if (existsSync(paths.stage)) throw new Error("Staging destination already exists; use a new directory");
  const base = installed(paths.root);
  mkdirSync(paths.stage);
  try {
    const input = new Map();
    for (const name of files) {
      const limit = name.endsWith(".xdb") ? maxDatabaseBytes : maxTextBytes;
      const remote = name.endsWith(".xdb") ? `data/${name}` : "LICENSE.md";
      const bytes = from
        ? readFile(join(from, name), limit)
        : await fetchFile(
            `https://raw.githubusercontent.com/${repository}/${revision}/${remote}`,
            join(paths.stage, name),
            limit
          );
      input.set(name, bytes);
      writeFileSync(join(paths.stage, name), bytes);
    }
    const report = await analyze(
      input,
      base,
      revision,
      new Date().toISOString().slice(0, 10),
      from ? "local-files" : "upstream-download"
    );
    const text = json(report);
    writeFileSync(join(paths.stage, "report.json"), text);
    writeFileSync(join(paths.stage, "report.sha256"), hash(text) + "\n");
    return report;
  } catch (error) {
    rmSync(paths.stage, { recursive: true, force: true });
    throw error;
  }
}

export async function validateStage({ root = rootDirectory, stage }) {
  if (!stage) throw new Error("--stage is required");
  const paths = safeStage(root, stage);
  const text = readFile(join(paths.stage, "report.json"));
  if (readFile(join(paths.stage, "report.sha256")).toString().trim() !== hash(text))
    throw new Error("Stage report digest mismatch");
  const report = JSON.parse(text);
  if (report.version !== 1) throw new Error("Unsupported stage report version");
  const upstream = report.manifest?.upstream;
  revisionOf(upstream?.revision);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(upstream.retrievedAt) ||
    !["local-files", "upstream-download"].includes(upstream.source)
  )
    throw new Error("Invalid staged provenance");
  const base = installed(paths.root);
  assert.deepEqual(
    report.base,
    base.hashes,
    "Installed files changed since staging; stage again against the current checkout"
  );
  const input = new Map(
    files.map((name) => [
      name,
      readFile(join(paths.stage, name), name.endsWith(".xdb") ? maxDatabaseBytes : maxTextBytes),
    ])
  );
  const expected = await analyze(input, base, upstream.revision, upstream.retrievedAt, upstream.source);
  assert.deepEqual(report, expected, "Staged files or validation report changed; create a new stage");
  return { report, input, base, paths };
}

export function renderBundled(manifest) {
  const local = manifest.upstream.source === "local-files";
  return `/** Generated from data/manifest.json; importing performs no file I/O. */
export const bundledRevision = ${JSON.stringify(manifest.upstream.revision)};
export const bundledMetadata = {
  id: "bundled-ip2region",
  dataVersion: \`${local ? "local" : "upstream"}:\${bundledRevision}\`,
  attribution: ${JSON.stringify(local ? "Operator-supplied XDB files; declared upstream revision is unverified (Apache-2.0 OR MIT license supplied)" : "lionsoul2014/ip2region contributors; upstream XDB snapshots (Apache-2.0 OR MIT)")},
  url: \`https://github.com/lionsoul2014/ip2region/tree/\${bundledRevision}/data\`,
} as const;

export const bundledFiles = [
${manifest.files
  .map(
    (file) => `  {
    family: ${file.family},
    url: new URL("../../data/${file.file}", import.meta.url),
    sha256: "${file.sha256}",
  },`
  )
  .join("\n")}
] as const;
`;
}

export function renderReadme(manifest, original) {
  const start = original.indexOf(begin);
  const finish = original.indexOf(end);
  if (start < 0 || finish < start || original.indexOf(begin, start + 1) >= 0 || original.indexOf(end, finish + 1) >= 0)
    throw new Error("Expected exactly one bundled-data marker pair in data/README.md");
  const origin =
    manifest.upstream.source === "local-files"
      ? "Local candidate files are associated with the operator-supplied revision below; this association has not been authenticated against upstream."
      : "Both unmodified files were downloaded from the pinned upstream revision below.";
  const section = `${begin}
${origin}

Source: [${repository}](https://github.com/${repository}/tree/${manifest.upstream.revision}/data),
revision \`${manifest.upstream.revision}\`, retrieved ${manifest.upstream.retrievedAt}.

| File | Bytes | Header build time (UTC) | SHA-256 |
| --- | ---: | --- | --- |
${manifest.files.map((file) => `| ${file.file} | ${file.bytes.toLocaleString("en-US")} | ${file.builtAt ?? "unknown"} | \`${file.sha256}\` |`).join("\n")}

License file SHA-256: \`${manifest.license.sha256}\`.
${end}`;
  return original.slice(0, start) + section + original.slice(finish + end.length);
}

export async function applyStage(options) {
  const { root = rootDirectory, stage, rename = renameSync } = options;
  if (!stage) throw new Error("--stage is required");
  const paths = safeStage(root, stage);
  const lock = join(paths.root, ".data-update.lock");
  mkdirSync(lock); // Fail rather than race another updater or a retained recovery lock.
  let transaction;
  let retain = false;
  try {
    const { report, input, base } = await validateStage(paths);
    const output = new Map([...input].map(([name, bytes]) => [`data/${name}`, bytes]));
    output.set("data/manifest.json", json(report.manifest));
    output.set("src/bundled.ts", renderBundled(report.manifest));
    output.set("data/README.md", renderReadme(report.manifest, base.content.get("data/README.md").toString()));
    for (const target of ["src/bundled.ts", "data/README.md", "data/manifest.json"]) {
      const formatted = await format(target, output.get(target), { printWidth: 120, trailingComma: "es5" });
      if (formatted.errors.length) throw new Error(`Cannot format generated ${target}`);
      output.set(target, formatted.code);
    }
    transaction = mkdtempSync(join(paths.root, ".data-update-"));
    for (const [i, target] of targets.entries()) {
      writeFileSync(join(transaction, `${i}.before`), base.content.get(target));
      writeFileSync(join(transaction, `${i}.after`), output.get(target));
    }
    writeFileSync(join(transaction, "recovery.json"), json({ targets, root: paths.root }));
    assert.deepEqual(installed(paths.root).hashes, base.hashes, "Installed files changed during validation");
    const replaced = [];
    try {
      for (const [i, target] of targets.entries()) {
        rename(join(transaction, `${i}.after`), join(paths.root, target));
        replaced.push(i);
      }
    } catch (cause) {
      const errors = [cause];
      for (const i of replaced.reverse()) {
        try {
          renameSync(join(transaction, `${i}.before`), join(paths.root, targets[i]));
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 1) {
        retain = true;
        throw new AggregateError(errors, `Rollback incomplete; retain ${transaction} and ${lock} for manual recovery`);
      }
      throw cause;
    }
    return report;
  } finally {
    if (!retain) {
      if (transaction) rmSync(transaction, { recursive: true, force: true });
      rmSync(lock, { recursive: true, force: true });
    }
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { revision: { type: "string" }, stage: { type: "string" }, from: { type: "string" } },
    allowPositionals: true,
  });
  const [command = "stage"] = positionals;
  if (positionals.length > 1 || !["stage", "validate", "apply"].includes(command))
    throw new Error("Use stage --revision SHA --stage DIR [--from DIR], validate --stage DIR, or apply --stage DIR");
  if (command !== "stage" && (values.revision || values.from)) throw new Error("revision/from are stage options only");
  const report =
    command === "stage"
      ? await stageData(values)
      : command === "apply"
        ? await applyStage(values)
        : (await validateStage(values)).report;
  process.stdout.write(json(report));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
