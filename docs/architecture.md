# Native query architecture

The package separates the runtime-independent query core, binary format readers,
and native runtime file loaders.

## Decisions

- Bundle pinned upstream ip2region IPv4/IPv6 XDB files for explicit, zero-configuration
  `new IP2Region()` or `await IP2Region.open()`. Include upstream
  revision, original license, file digests and separate per-file build/load times;
  the code license does not relicense unrelated third-party databases. Select
  `families: [4]` or `[6]` to load only one file; the default remains dual-stack.
- Generic XDB reading defaults to raw records. Geography mapping requires an
  explicit column layout; the bundled loader supplies its known upstream preset.
- The root entry is a runtime-independent core. Importing any entry does not
  read files, access the network, or install anything.
- Use `new IP2Region({ source })` and `new AsyncIP2Region({ source })` with separate
  synchronous and explicitly Async-suffixed query/lifecycle methods. Functions, objects and class instances are supported.
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
- Native constructors synchronously load configured databases; static `open`
  asynchronously reads the same configuration and returns a synchronous client.
  Node uses native fs APIs; Bun uses node:fs for synchronous construction and
  Bun.file for asynchronous reads; Deno uses its native readFile/readFileSync.
- Built-in byte readers use Uint8Array, DataView and TextDecoder. Loaders use
  native file APIs and share the same query engines. User-supplied readers do
  not require a registry or a library release.

## Delivery and validation

1. Pure core and extension contract: strict IP parsing, synchronous/asynchronous
   functions and instances, errors, batches, ownership and close behavior.
2. Native loading and ip2region XDB dual-stack data, IPIP IPDB and IP2Location BIN.
   Validate each format with synthetic fixtures and an independent reader.
3. Document data provenance and actual format/field/runtime capabilities.
4. Test real tarballs, declarations, ESM/CJS, runtime permission failures and
   memory-only operation. Record loading/memory/query performance separately
   from location accuracy.

Batch calls retain input order. `lookupMany` fails on the first error;
`lookupManySettled` records per-item errors and continues. Async batches default
to sequential execution; an explicit positive `concurrency` bounds the number
of pending queries per batch. Iterables are consumed lazily. A failing ordinary
async batch stops dispatching when it observes the failure and drains started
work before rejecting. Null is a successful miss, not an invalid-IP or corruption sentinel.
Built-in database factories copy the supplied byte view to isolate later caller
mutation; no implicit caching, downloading, fallback or hot reload is performed.
Native `databases` configuration composes explicitly assigned IPv4/IPv6 readers,
checks each reader's family support and owns their cleanup. Results retain the
selected reader's interpretation and source; composite metadata retains the
individual datasets. Maintainer data staging and application are explicit tools,
outside runtime loading and queries.
