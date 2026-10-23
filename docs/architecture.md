# Native query architecture

This branch implements the new architecture in stages. The release version is
deliberately undecided; `2.3.1` in package.json is the existing base version, not a
release designation for these breaking changes.

## Decisions

- Keep the existing ip2region IPv4 database for an explicit, zero-configuration
  `openDefault()` entry. Include provenance and a digest; do not invent a data
  build date or apply the code's MIT license to third-party data.
- The root entry is a runtime-independent core. Importing any entry does not
  read files, access the network, or install anything.
- Use `createLookup(source)` and `createAsyncLookup(source)` with separate return
  and lifecycle contracts. Functions, objects and class instances are supported.
  A source with only a lookup function needs no metadata or capability methods.
- Standard results use optional country, subdivisions, city, ISP, ASN and
  organization fields. Missing data is omitted. Raw fields live in typed,
  JSON-compatible extensions; ASN organizations are never substituted for ISP.
- The source owns record interpretation. The core parses and canonicalizes the
  full IP and passes both the canonical string and parsed context to the source.
  IPv4-mapped IPv6 is preserved by default; `mappedIPv6: "ipv4"` explicitly maps
  only the exact mapped prefix. Scope identifiers, host/port syntax, whitespace,
  leading-zero IPv4 octets and other legacy IPv4 notations are rejected.
- Sources are borrowed by default. Runtime factories own the sources they
  create. Close is idempotent; a failed close does not reopen the wrapper.
  Asynchronous close rejects new work immediately and waits for active work.
- Use a single package with explicit format and native Node/Bun/Deno entries.
  Publish ESM and CJS for core, formats and Node; Bun/Deno entries use ESM.
- Initial runtime floors: Node 22.12.0, Bun 1.2.0, Deno 2.0.0. Actual support is
  recorded only after testing the emitted package on those versions.
- Remove the old constructor, `search`, `searchRaw`, high-64-bit IPv6 dispatch,
  transition-address guesses, and Chinese location-string splitting. Migration
  uses the new API instead of carrying an obsolete compatibility layer.
- Built-in byte readers use Uint8Array, DataView and TextDecoder. Loaders use
  native file APIs and share the same query engines. User-supplied readers do
  not require a registry or a library release.

## Delivery and validation

1. Pure core and extension contract: strict IP parsing, synchronous/asynchronous
   functions and instances, errors, batches, ownership and close behavior.
2. Native loading and existing ip2region data, then IPIP IPDB and IP2Location BIN.
   Validate each format with synthetic fixtures and an independent reader.
3. Remove obsolete interfaces; document migration, data provenance and actual
   format/field/runtime capabilities.
4. Test real tarballs, declarations, ESM/CJS, runtime permission failures and
   memory-only operation. Record loading/memory/query performance separately
   from location accuracy. Do not merge or publish as part of implementation.

Batch calls retain input order. `lookupMany` fails on the first error;
`lookupManySettled` records per-item errors and continues. Async batches are
sequential. Null is a successful miss, not an invalid-IP or corruption sentinel.
Built-in database factories copy the supplied byte view to isolate later caller
mutation; no implicit caching, downloading, fallback or hot reload is performed.
