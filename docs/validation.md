# Implementation validation

Local validation on the Linux x64 cloud worker, 2026-10-23:

| Consumer / check                                                                   | Result          |
| ---------------------------------------------------------------------------------- | --------------- |
| Node 24.19.0 unit and independent-reader checks                                    | 40 tests passed |
| Node 22.12.0 real-tarball shared suite                                             | 37 tests passed |
| Bun 1.2.0 real-tarball shared suite, native loader                                 | 35 tests passed |
| Deno 2.0.0 real-tarball shared suite, native loader                                | 35 tests passed |
| ESM, CJS, mixed-module error propagation                                           | Passed          |
| NodeNext `.mts` / `.cts` consumer declarations                                     | Passed          |
| Pure core/format declarations without Node or DOM types                            | Passed          |
| Native file permission failures: Node, Bun and Deno                                | Passed          |
| Memory-only operation without database read permission: Node and Deno              | Passed          |
| Frozen pnpm 9.15.9 lockfile, installation scripts disabled                         | Passed          |
| Pinned XDB hashes and upstream license checked, obsolete files absent from tarball | Passed          |

The same byte fixtures and expected results are used across the runtimes.
Checks cover complete 128-bit IPv6 values, mapped-address policy, first/last
addresses, malformed literals, sparse XDB ranges and vector indexes, metadata language/family
restrictions, truncated/corrupt files, fields/capabilities for DB1–DB26,
ownership, this binding, error propagation and close lifecycle. Regression cases
include close triggered synchronously inside an active async lookup (success and
failure), BIN strings inside or crossing structural regions, 150,001 IPDB language
entries and impossible offsets, raw XDB records with misleading five-column
layouts, and native single-family loading. An instrumented loader verifies that
unselected bundled files are never read and invalid family lists fail before I/O.

The independent Node reference tests use official ip2region.js 3.1.8,
ip2location-nodejs 9.8.0 and official ipip-ipdb 0.6.0. XDB comparisons include
both synthetic fixtures and pinned real IPv4/IPv6 snapshots, sampling first/last
addresses of 128 real segments per file. BIN/IPIP use synthetic records and
require no commercial data. Real tarball checks run from an isolated consumer
directory, exercising exports and copied library files without a source-tree or
workspace dependency fallback. Test helpers are injected separately into the
temporary installed package; they are not shipped in the tarball.

The CI workflow additionally runs Node on Windows/macOS/Linux, and minimum plus
current Bun/Deno releases on Linux. Those remote runs are separate evidence from
the local results above. Release version, merging and publishing remain separate
decisions. Performance observations are recorded in [performance.md](performance.md),
not used as geographic-accuracy results.
