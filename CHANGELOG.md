# Changelog

## 3.0.0 (Unreleased)

- Add a runtime-independent lookup core, external function/instance protocols,
  explicit native Node/Bun/Deno loading, and separate sync/async lifecycles.
- Replace legacy `.db` data and contracts with pinned upstream IPv4/IPv6 XDB
  snapshots, an explicit field schema, provenance, licenses and per-file metadata.
  Add shared-memory IP2Location BIN and IPIP IPDB readers with complete IPv6 handling.
- Replace the old constructor/search/searchRaw API and remove ZX IPv6wry
  heuristics, install/update scripts and automatic Git publish hooks.
- Add real-tarball, multi-runtime and independent-reference validation, migration
  documentation and a fixed-snapshot performance baseline.

- Register asynchronous work before adapter callbacks, reject BIN strings that
  overlap structural regions, and handle large IPDB language maps without
  argument-spread limits. Add regression coverage across all native runtimes.
- Default generic XDB input to raw records with explicit geographic column
  mapping, and add selective IPv4/IPv6 bundled loading via `families`.

## 2.3.1

- Fix native ESM default imports while preserving CommonJS and the previous ESM `.default` workaround (#38).
- Return `null` for addresses outside sparse custom IPv4 databases and document compatible custom database formats (#37).
