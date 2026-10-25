# Implementation validation

## XDB result mapping, 2026-10-25

On the Linux x64 cloud worker, Node 24.19.0 passed all 75 core,
independent-reader and release-helper tests. Real-tarball validation passed on
Node 24.19.0, Bun 1.4.4 and Deno 2.9.6, including the public custom adapter
examples, ESM/CJS consumers, declarations, permission checks and pinned data
hashes. The shared consumer suites contain 61 Node tests and 59 Bun/Deno tests;
the standalone Node custom example suite contains 17 tests.

XDB regressions cover omitted fields and raw placeholders, name-only/code-only
countries, the existing `Reserved` rules, reordered custom columns, independent
nested results, and both too few and too many record columns. Query results
remain independently mutable, including `extensions.raw` in unmapped mode.

The repository-only XDB comparison against main `4e5c346` verified 120 fresh
workers across Node/Bun/Deno. See [performance.md](performance.md) for throughput,
latency tradeoffs and reproduction details. The earlier runtime-floor checks
below remain historical; this local run uses the three versions listed above.

## Previous validation, 2026-10-24

Local validation on the Linux x64 cloud worker, 2026-10-24:

| Consumer / check                                                      | Result                  |
| --------------------------------------------------------------------- | ----------------------- |
| Node 24.19.0 core, independent-reader and release-helper tests        | 73 tests passed         |
| Node 22.12.0 / 24.19.0 real-tarball shared suite                      | 59 tests passed on each |
| Bun 1.2.0 / 1.4.4 real-tarball shared suite, native loader            | 57 tests passed on each |
| Deno 2.0.0 / 2.9.6 real-tarball shared suite, native loader           | 57 tests passed on each |
| Public custom adapter examples, shipped in the tarball                | 17 tests per runtime    |
| Packaged examples checked against actual public declarations          | Passed                  |
| ESM, CJS, mixed-module error propagation                              | Passed                  |
| NodeNext `.mts` / `.cts` consumer declarations                        | Passed                  |
| Pure core/format declarations without Node or DOM types               | Passed                  |
| Native file permission failures: Node, Bun and Deno                   | Passed                  |
| Memory-only operation without database read permission: Node and Deno | Passed                  |
| oxlint, oxfmt and TypeScript on Node 22.12.0 / 24.19.0                | Passed                  |
| Frozen pnpm 9.15.9 lockfile, installation scripts disabled            | Passed                  |
| Pinned XDB hashes, upstream license and distribution allowlist        | Passed                  |
| CI and release workflows checked with actionlint 1.7.7                | Passed                  |
| Recorded 2026-10-23 benchmark matrix, before the constructor API      | 54 runs passed          |
| Repository-only XDB matrix, Node/Bun/Deno, 2026-10-24                 | 60 runs verified        |
| Parsing optimization versus main, Node/Bun/Deno, 2026-10-24           | 120 runs verified       |

The same byte fixtures and expected results are used across the runtimes.
Parser regressions additionally exercise all 256 values in every IPv4 octet,
reject leading-zero variants, and check every set/cleared bit across IPv4 and
IPv6 unsigned word boundaries using independently constructed hexadecimal values.
Checks cover complete 128-bit IPv6 values, mapped-address policy, first/last
addresses, malformed literals, sparse XDB ranges and vector indexes, metadata language/family
restrictions, truncated/corrupt files, fields/capabilities for DB1–DB26,
ownership, this binding, error propagation and close lifecycle. Regression cases
include close triggered synchronously inside an active async lookup (success and
failure), BIN strings inside or crossing structural regions, 150,001 IPDB language
entries and impossible offsets, raw XDB records with misleading five-column
layouts, and native single-family loading. Constructors and asynchronous `open` share
configuration and both return synchronous queries; async source clients expose
only Async-suffixed methods. Runtime and type tests reject mixed sources, file
configuration conflicts, malformed capabilities and invalid metadata. An instrumented loader verifies that
unselected bundled files are never read and invalid family lists fail before I/O.

The independent Node reference tests use official ip2region.js 3.1.8,
ip2location-nodejs 9.8.0 and official ipip-ipdb 0.6.0. XDB comparisons include
both synthetic fixtures and pinned real IPv4/IPv6 snapshots, sampling first/last
addresses of 128 real segments per file. BIN/IPIP use synthetic records and
require no commercial data. Real tarball checks run from an isolated consumer
directory, exercising exports and copied library files without a source-tree or
workspace dependency fallback. Test helpers are injected separately into the
temporary installed package; they are not shipped in the tarball. The public
custom examples are shipped separately, imported through package exports, and
executed in the shared suites plus their standalone Node entry. JSDoc interfaces
are checked both against source types and against the packed declarations.

The CI workflow additionally runs Node on Windows/macOS/Linux, and minimum plus
current Bun/Deno releases on Linux. Those remote runs are separate evidence from
the local results above. npm publication requires a separate release decision.
Performance observations are recorded in [performance.md](performance.md),
not used as geographic-accuracy results. Reproduction commands and toolchain
configuration are described in [development.md](development.md).

Release automation additionally has network-free helper tests in `npm run test:release`
and workflow validation with actionlint. `npm run test:packed -- /path/to/package.tgz`
runs the same consumers against an existing archive, without repacking or modifying it.
The tag workflow uses this mode before publishing that exact archive. Mocked release
tests and local archive validation do not establish successful npm OIDC authentication;
see [release setup](releasing.md).
