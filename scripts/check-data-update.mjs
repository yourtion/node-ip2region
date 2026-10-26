import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { applyStage, stageData } from "./update-data.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = "lionsoul2014/ip2region";

function snapshot(manifest) {
  assert.equal(manifest.version, 1, "Unsupported data manifest");
  assert.equal(manifest.upstream.repository, repository);
  assert.match(manifest.upstream.revision, /^[0-9a-f]{40}$/);
  assert.equal(manifest.upstream.source, "upstream-download");
  assert.equal(manifest.files.length, 2);
  for (const [i, family] of [4, 6].entries()) {
    const file = manifest.files[i];
    assert.equal(file.family, family);
    assert.equal(file.file, `ip2region_v${family}.xdb`);
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
  }
  assert.equal(manifest.license.file, "LICENSE.ip2region.md");
  assert.match(manifest.license.sha256, /^[0-9a-f]{64}$/);
  return {
    fields: manifest.fields,
    license: manifest.license,
    files: manifest.files.map(({ family, file, bytes, sha256 }) => ({ family, file, bytes, sha256 })),
  };
}

// A new repository commit or retrieval date is not a new data snapshot.
export function sameSnapshot(left, right) {
  return isDeepStrictEqual(snapshot(left), snapshot(right));
}

export function renderUpdateBody(before, report) {
  const after = report.manifest;
  return `Update the bundled IPv4/IPv6 snapshots from a pinned upstream commit.

Upstream: [${before.upstream.revision} → ${after.upstream.revision}](https://github.com/${repository}/compare/${before.upstream.revision}...${after.upstream.revision}).

| Family | Bytes | Header build time (UTC) | Added ranges | Removed ranges | Changed records | Reference checks |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
${report.checks.map((check) => `| IPv${check.family} | ${check.bytes} | ${check.builtAt ?? "unknown"} | ${check.changes.addedRanges} | ${check.changes.removedRanges} | ${check.changes.changedRecords} | ${check.referenceChecks} |`).join("\n")}

| File | SHA-256 |
| --- | --- |
${after.files.map((file) => `| ${file.file} | \`${file.sha256}\` |`).join("\n")}
| ${after.license.file} | \`${after.license.sha256}\` |

License content changed: **${report.licenseChanged ? "yes — review the license diff" : "no"}**.

The updater checked both complete indexes, all referenced UTF-8/five-column records,
and boundary queries against the independent upstream reader. Apply repeated the
checks against the current checkout. Quality and real-package tests pass before
this PR is created; Native runtime CI is dispatched on its branch after creation.
The Data updates run retains the full report as an artifact.

Review the data/schema and license changes before merging. Range splits count as
added/removed ranges; header build times and passing checks do not establish
geographic accuracy. This PR does not publish an npm version.
`;
}

export async function prepareDataUpdate({ root = rootDirectory, stage, revision, pending, fetchFile }) {
  const before = JSON.parse(readFileSync(join(root, "data/manifest.json"), "utf8"));
  // Automatic updates operate only on the repository's authenticated upstream snapshots.
  snapshot(before);
  if (pending) snapshot(pending);
  const report = await stageData({ root, stage, revision, fetchFile });
  if (sameSnapshot(before, report.manifest)) {
    return { status: "unchanged", report, body: "The bundled data and license already match upstream.\n" };
  }
  if (pending && sameSnapshot(pending, report.manifest)) {
    // Preserve the first retrieval date and avoid repeated commits to the same pending PR.
    return { status: "pending", report, body: "The existing data PR already contains this snapshot.\n" };
  }
  await applyStage({ root, stage });
  return { status: "updated", report, body: renderUpdateBody(before, report) };
}

async function main() {
  const { values } = parseArgs({
    options: {
      revision: { type: "string" },
      stage: { type: "string" },
      body: { type: "string" },
      pending: { type: "string" },
    },
  });
  if (!values.body) throw new Error("--body is required");
  const pending = values.pending ? JSON.parse(readFileSync(values.pending, "utf8")) : undefined;
  const result = await prepareDataUpdate({ ...values, pending });
  writeFileSync(values.body, result.body);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Data check: **${result.status}**\n\n${result.body}`);
  console.log(`Data check: ${result.status}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
