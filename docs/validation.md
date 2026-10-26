# Implementation validation

## Current evidence, 2026-10-26

The [12-job CI for PR #46](https://github.com/yourtion/node-ip2region/actions/runs/40258583180)
passed quality/workflow checks and real-package tests on Node 22.12.0/24 across
Linux, macOS and Windows, plus minimum/current Bun and Deno on Linux.
The Node test command contains 105 core, reference-reader, release-helper and
data-update tests; the packaged shared suites contain 75 Node and 73 Bun/Deno
cases, plus 17 standalone custom-adapter examples per runtime.
Test counts describe this revision.

The [4.0.0 release run](https://github.com/yourtion/node-ip2region/actions/runs/40164617294)
validated one exact tarball on Node, Bun and Deno, published it through npm OIDC,
and created the GitHub Release. The downloaded npm archive matched the validated
SHA-256: `373d7c7a0adda1d690ec38e9241d46e816a00b75f2a46aac80975528f6d991b9`.

The first [manual Data updates run](https://github.com/yourtion/node-ip2region/actions/runs/40258072703)
succeeded on `main`. The weekly schedule and permission requirements are described
in [data maintenance](../data/README.md#scheduled-pull-requests).

## Coverage and limits

| Area              | Coverage                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| IP parsing        | Strict literals, every IPv4 octet value, full unsigned 128-bit IPv6, mapped-address policy and malformed input                                |
| Native loading    | Selected-family I/O, sync constructors/async opening, configuration rejection before I/O, mixed-format composition and partial-load cleanup   |
| Source lifecycle  | Functions/instances, `this`, ownership, stable errors, reentrant close, idempotence and attempting every child cleanup                        |
| Async batches     | Bounded/lazy dispatch, ordered results, slow tasks, first-error draining, iterator cleanup, settled errors and closing during work            |
| Binary readers    | Sparse XDB/vector bounds, custom columns/raw records, UTF-8, BIN DB1–DB26, structural string overlaps and IPDB language/trie bounds           |
| Package consumers | Public examples/options, ESM/CJS, NodeNext declarations, pure core types without Node/DOM types, file permissions and manifest/license hashes |
| Data updates      | All-record checks, altered stages/baselines, partial downloads, locks, rollback, unchanged/pending candidates and license-only changes        |
| Release helpers   | Registry/auth failures, exact-version checks and resuming after npm succeeds but GitHub Release fails, using mocked APIs                      |

Independent Node comparisons use `ip2region.js@3.1.8`,
`ip2location-nodejs@9.8.0` and `ipip-ipdb@0.6.0` as development-only dependencies.
XDB uses synthetic fixtures and both pinned real snapshots, including first/last
addresses of 128 segments per file. BIN/IPDB use synthetic data; no commercial
database is required, and not every vendor edition has been exercised.

Data staging additionally checks all referenced nonempty XDB payloads for UTF-8
and the configured five columns. Pinned revision
`f8b0792b0cd729f5b2593f690aeed225e49c1967` contains 553,967 IPv4 and 734,953 IPv6
ranges; staging verified 256 independent-reader boundary queries per family.
An isolated checkout exercised both upstream and local application, retaining
explicit unverified provenance for local files. Handled write failures roll back;
multi-file application is not crash-atomic. See [recovery limits](../data/README.md).

Real-tarball tests use isolated consumers with no workspace dependency fallback.
Test fixtures/helpers are injected separately; public custom examples are shipped
and tested against the package's actual exports and declarations.

These checks establish interface and decoding behavior, not geographic accuracy.
Performance evidence and its measurement limits are in [performance.md](performance.md).
Reproduction commands are in [development.md](development.md); publication setup
and retry rules are in [releasing.md](releasing.md).
