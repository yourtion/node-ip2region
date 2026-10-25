# Changelog

## Unreleased

- Compose custom IPv4/IPv6 databases with explicit native `databases` routing,
  per-source metadata and cleanup on failed initialization.
- Add optional bounded concurrency to asynchronous batches while preserving
  sequential defaults, input order and close semantics.
- Add explicit maintainer data staging, validation and application with paired
  snapshot metadata, reference-reader checks and rollback on handled write failure.

- Reduce XDB result-mapping temporary objects while preserving raw/custom fields,
  omitted values and independently mutable query results.

- Reduce IP parsing allocations and BigInt operations while preserving strict
  literal validation, canonical addresses and complete unsigned 128-bit values.

- Add a reproducible XDB benchmark for this repository, with optional built
  revisions as a baseline, complete corpus checks and raw measurement reports.

- Unify native initialization as `new IP2Region(options)` / `IP2Region.open(options)`,
  with explicit database configuration and custom source ownership.
- Separate `AsyncIP2Region` with Async-suffixed query and close methods.
- Publish typed, runnable custom adapter examples and reusable contracts tested
  through the public package API on Node, Bun and Deno.

- Replace Prettier with oxlint and oxfmt, enforced alongside type checks in CI and releases.
- Remove obsolete migration material and rewrite the README around installation and integration.
- Benchmark native Node, Bun and Deno loading, single-family memory, latency and throughput.

## 3.0.0 — 2026-10-23

- Add tag-triggered npm Trusted Publishing, validated-tarball consumer checks,
  stable/prerelease channels and resumable GitHub Release completion.
- Add a runtime-independent lookup core, external function/instance protocols,
  explicit native Node/Bun/Deno loading, and separate sync/async lifecycles.
- Bundle pinned upstream IPv4/IPv6 XDB
  snapshots, an explicit field schema, provenance, licenses and per-file metadata.
  Add shared-memory IP2Location BIN and IPIP IPDB readers with complete IPv6 handling.
- Add real-tarball, multi-runtime and independent-reference validation, format
  documentation and a fixed-snapshot performance baseline.

- Register asynchronous work before adapter callbacks, reject BIN strings that
  overlap structural regions, and handle large IPDB language maps without
  argument-spread limits. Add regression coverage across all native runtimes.
- Default generic XDB input to raw records with explicit geographic column
  mapping, and add selective IPv4/IPv6 bundled loading via `families`.
