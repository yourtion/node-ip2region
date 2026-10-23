# Migrating to the native query architecture

This is a breaking development branch, distinct from the existing 2.3.x API.
The release number will be chosen separately before publishing.

## Bundled data

Replace synchronous construction and `search` with explicit asynchronous
loading followed by synchronous lookup:

```js
// Before: const query = new IP2Region(); query.search(ip);
import { openDefault } from "ip2region/node";
const query = await openDefault();
try {
  const result = query.lookup("120.24.78.68");
  console.log(result?.country?.name, result?.subdivisions?.[0]?.name);
} finally {
  query.close();
}
```

Bun uses `ip2region/bun`; Deno uses `npm:ip2region/deno`. The bundled snapshot
supports IPv4 only. The previous ZX IPv6wry snapshot and its location-string
heuristics are removed. Use a supported dual-stack BIN/IPIP IPDB or an external
source for IPv6; unsupported families throw UNSUPPORTED_FAMILY.

## Custom data and results

Replace `ipv4db` with a format factory and a native loader:

```js
import { openDatabase } from "ip2region/node";
import { createIP2Region } from "ip2region/formats/ip2region";
const query = await openDatabase("/data/custom.db", createIP2Region);
```

There is no implicit merge or fallback. IPv6 data must identify its actual
format: the former `ipv6db` option does not imply IPIP IPDB, BIN or another
reader. Replace `disableIpv6` with an appropriate data source or reject IPv6 in
the application before querying.

Relative local paths now follow the native file API and resolve against the
application's working directory, instead of the old implementation-file
directory. Prefer an absolute path or file URL when migrating existing options.

Old flat `country`, `province` and `city` strings become optional place objects
and a `subdivisions` array. Empty/unknown values are omitted, not guessed.
Code/name, ISP, ASN and organization remain distinct. The raw `searchRaw` union
is removed; each reader exposes typed `extensions` for its own record shape.

Invalid input now throws INVALID_IP instead of being conflated with a miss.
Null means no record. Reserved addresses remain valid input; their records
depend on the source. No transition-address guessing, string translation,
confidence scores or geographic string splitting is performed.

IPv4-mapped IPv6 remains IPv6 by default. For applications receiving mapped
socket addresses and using an IPv4 source, opt into `openDefault({ mappedIPv6:
"ipv4" })` or `createLookup(source, { mappedIPv6: "ipv4" })`.

## Removed infrastructure

The old default constructor, `search`, `searchRaw`, parser/deep-file exports,
debug environment hooks, Node 14/16/18 baseline, install script and network data
update script are removed. CJS now uses named exports, e.g.
`require("ip2region/node").openDefault`; the old `.default` workaround is gone.

No publish hook pushes Git refs or tags. The legacy sparse-database and ESM
fixes are part of the 2.3.1 baseline. Their useful boundary and packaging behavior
is covered by the new tests; obsolete constructor aliases and deep imports are
intentionally removed from the new API.
