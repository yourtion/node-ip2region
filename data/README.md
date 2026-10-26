# Bundled ip2region XDB snapshots

<!-- bundled-data:start -->

Both unmodified files were downloaded from the pinned upstream revision below.

Source: [lionsoul2014/ip2region](https://github.com/lionsoul2014/ip2region/tree/f8b0792b0cd729f5b2593f690aeed225e49c1967/data),
revision `f8b0792b0cd729f5b2593f690aeed225e49c1967`, retrieved 2026-10-23.

| File             |      Bytes | Header build time (UTC)  | SHA-256                                                            |
| ---------------- | ---------: | ------------------------ | ------------------------------------------------------------------ |
| ip2region_v4.xdb | 11,122,642 | 2026-10-14T02:11:07.000Z | `27ecba8c9a6d5e3b280aedbe7ee15c65372b179fbd0dad3845d8c608f2fcace1` |
| ip2region_v6.xdb | 37,277,813 | 2026-08-14T05:38:41.000Z | `939f6b46bd2b8bec3cf7c5ceb8ba782266ae9b1f35b5ba7916700dec0b7506ed` |

License file SHA-256: `fe01f2f8fcaafac539154e6aa80b0b7f8af54e01dc4d52322f72971991c6280e`.
<!-- bundled-data:end -->

Both use XDB structure 3, vector indexes and 4-byte pointers. The documented
upstream schema at this revision is `国家|省份|城市|ISP|iso-alpha2-code`, mapped
as `country_name|region_name|city_name|isp|country_code`. The bundled loader explicitly selects this layout;
the generic XDB reader defaults to uninterpreted raw text. Custom XDB records
require their own field layout for standard geographic fields.

Upstream copyright and license text is retained verbatim in
[LICENSE.ip2region.md](LICENSE.ip2region.md): **Apache-2.0 OR MIT**. These are the
public files distributed in that upstream repository; no commercial database or
service data is included. Licenses for independently supplied data remain the
user's responsibility and are separate from reader code licensing.

A header build timestamp describes the binary's build, not the freshness of every
underlying range. File hashes identify the exact snapshots. Runtime `loadedAt`
is separate; loading/downloading the same file does not create a new data version.
Git attributes preserve the upstream bytes of both XDB files and the license,
including on Windows checkouts with automatic line-ending conversion enabled.
No automatic downloading or updating occurs at import, installation or lookup.
No geographic-accuracy guarantee is implied by upstream attribution or passing
reader tests. Updating these files requires checking upstream provenance/license,
recording new digests and rerunning reference and native-runtime validation.

## Stage, validate and apply updates

### Scheduled pull requests

[Data updates](../.github/workflows/data-update.yml) checks the upstream default
branch weekly at **Sunday 00:00 Asia/Shanghai** (Saturday 16:00 UTC).
GitHub may delay scheduled runs.
It can also be run from Actions → Data updates → Run workflow on `main`.
The schedule runs from the repository's default branch, `main`.

Each run resolves a full upstream commit SHA, then uses the same staging and
validation pipeline described below. Only changes to XDB bytes or the license
create an update: upstream code-only commits and retrieval dates do not create PRs.
The fixed `automation/update-ip-data` branch keeps a single open PR. An identical
pending snapshot is left intact, including its first retrieval date, even if the
upstream commit advances. A newer snapshot updates that PR; if upstream matches
`main` again, the obsolete PR is closed by the PR action. This branch is reserved
for the automation; make manual changes on a separate branch.
Closing an unmerged data PR does not blacklist that snapshot: the next run can
recreate it. To pause proposals, disable Data updates from the Actions menu.

Before creating/updating a PR, the job reruns validation during apply, runs
`npm run check` and `npm run test:package`, and limits the commit to both XDBs,
license, manifest, generated module and this file's metadata. The PR describes
range changes and license changes. Each successful check retains `report.json`
and `report.sha256` as a 30-day Actions artifact. Download, schema, license or test
failures fail the run without publishing a new candidate PR.

The workflow uses only `GITHUB_TOKEN`; no PAT or npm credential is needed. Enable
**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to
create and approve pull requests**. Repository/organization policies must permit
the declared `contents: write`, `pull-requests: write` and `actions: write`
permissions. No approval or auto-merge is performed by this workflow.

PRs created with `GITHUB_TOKEN` do not trigger ordinary `pull_request`/`push`
workflows. The updater explicitly dispatches **Native runtime CI** (`test.yml`)
on the PR branch to run the full Node/Bun/Deno and OS matrix, including on a
subsequent run with the same pending candidate so interrupted dispatches recover.
Check that CI run on the PR's head commit before merging. After merging data,
publish a version through the normal [release process](../docs/releasing.md);
the scheduled job does not merge PRs, tag commits or publish packages.

### Manual maintenance

`data/manifest.json` is the maintainer source of truth for the paired snapshots,
license digest, declared upstream revision and retrieval date. The explicit
updater regenerates `src/bundled.ts` and the marked metadata section above.
Package validation checks the same manifest. These commands are repository
maintenance tools, not runtime APIs; normal imports, installation and lookups
never download data. Network staging additionally requires `curl` on PATH and
uses its inherited proxy and CA configuration.

Stage a complete, pinned upstream revision into a **new directory outside the
checkout** (the npm commands build the tools before running them):

```sh
npm run data:stage -- --revision f8b0792b0cd729f5b2593f690aeed225e49c1967 --stage /tmp/ip2region-candidate
npm run data:validate -- --stage /tmp/ip2region-candidate
```

The updater downloads both `data/ip2region_v4.xdb` and `data/ip2region_v6.xdb`
plus the upstream root `LICENSE.md`, using fixed HTTPS paths, a two-minute timeout
per file and a 256 MiB limit per database (1 MiB for text). A changed license
without the reviewed `Apache-2.0 OR MIT` SPDX expression is rejected for manual
review. For offline validation, add `--from /path/to/candidate-files`; that directory
must contain both XDB filenames and `LICENSE.ip2region.md`. Local files are clearly
reported as operator-supplied; their association with the requested revision is
not authenticated against upstream.

Read `report.json` in the staging directory before applying. It records file
hashes, sizes, build times, range counts, changed records for identical range
boundaries, added/removed ranges, and license changes against the installed data.
Every referenced nonempty record is checked for UTF-8 and the configured five
columns. The shipped reader validates the complete index; up to 128 segment
pairs per family are compared with the independent official development reader.
Column counts cannot verify field meanings; review the upstream schema and
license. These checks do not establish geographic accuracy. `report.sha256`
helps detect an accidentally edited report; it is not an authenticity signature.

Applying is a separate explicit command:

```sh
npm run data:apply -- --stage /tmp/ip2region-candidate
npm run check
npm run test:package
```

Apply repeats validation, rejects stale staged bases and altered data/report
content, then replaces both databases, the license, manifest, generated module
and metadata documentation together. A repository lock excludes cooperating
updaters. Invalid candidates do not change installed files; handled replacement
failures restore already-replaced files from backups. This multi-file operation
is **not crash-atomic**: do not run it concurrently with application readers or
unrelated edits. A killed process or failed rollback can retain `.data-update-*`
backups and `.data-update.lock`; use the transaction's `recovery.json` and
`*.before` backups to restore the listed paths before removing the lock. Commit
and publish the resulting snapshot only after reviewing the report and passing
the reference/native-runtime and real-tarball checks.
