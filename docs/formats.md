# Format support

All built-in readers use the same Uint8Array/DataView/TextDecoder implementation
on Node, Bun and Deno. They copy the effective input view, including a non-zero
byteOffset. They do not download data or depend on vendor runtime packages.

## ip2region XDB

`createXDB(bytes, options?)` supports structure 2 (IPv4) and structure 3
(IPv4 or IPv6), vector indexes and 4-byte pointers. Unsupported structure,
index policy or pointer width raises INVALID_DATABASE. Files declare a single
address family; the default loader owns the selected readers and routes by family.
`openDefault()` loads both; `openDefault({ families: [4] })` or `[6]` loads only
the requested file. Families must be nonempty and distinct; capabilities and
per-file metadata contain only the loaded families.
IPv4 range endpoints use little endian; IPv6 endpoints retain all 128 bits in
network order. The reader validates sorted non-overlapping ranges, segment/data
bounds and every vector entry. Inclusive and exclusive vector end pointers from
upstream makers are normalized; queries never read past the final segment.
Missing vectors, sparse gaps and zero-length records return null.

XDB contains a UTF-8 region string, **not a field schema**. `createXDB(bytes)`
defaults to uninterpreted raw records and advertises no geographic fields.
`openDefault()` explicitly passes the frozen `IP2REGION_FIELDS` preset for the
pinned current upstream snapshots:
`country_name|region_name|city_name|isp|country_code`, documented upstream as
`国家|省份|城市|ISP|iso-alpha2-code`. It is distinct from the old
`country|region|province|city|ISP` layout. The adapter maps actual named columns,
retains `{ extensions: { region, raw } }`, and advertises configured capabilities.
Unknown markers are omitted from standard fields; `Reserved` place markers
remain only in raw data. It never translates names or infers a country code.
When fields are configured, an unexpected column count raises INVALID_DATABASE when queried;
UTF-8 and column validation happen on record access.

For self-supplied data, explicitly match the documented schema of that file:

```js
import { createXDB } from "ip2region/formats/ip2region-xdb";
const source = createXDB(bytes, {
  fields: ["country_name", "region_name", "city_name", "isp", "country_code", "custom"],
});
// Uninterpreted/custom records need no geographic columns:
const rawSource = createXDB(bytes); // fields: null has the same behavior
```

Column names must be distinct nonempty strings (prototype-reserved names are
rejected). Extra names are preserved in `extensions.raw`; omitted fields or `fields: null`
preserves the entire region string and advertises no standard geographic fields.
There is no heuristic detection of legacy field layouts. Container structure
version does not identify a data schema, language or geographic-data quality.

The header timestamp supplies `builtAt`, not a promise that records were updated
at that time. `loadedAt` is recorded separately. The bundled composite metadata
uses the pinned upstream revision; `metadata.datasets` retains each file digest,
build time and load time. See [data provenance](../data/README.md).

To make custom files, use the upstream
[XDB maker](https://github.com/lionsoul2014/ip2region/tree/f8b0792b0cd729f5b2593f690aeed225e49c1967/maker)
for the actual address family and chosen region schema. Load with
`openDatabase("/absolute/path/custom.xdb", createXDB)` or an explicitly configured
factory to map standard fields. Passing `createXDB` directly returns raw records.
The old `.db` reader, city ID, ZX IPv6wry and Java v1.9 maker instructions
are removed. Changing a file extension does not convert its format.

## IPIP IPDB

`createIPIP(bytes, { language: "CN", metadata? })` supports the IPIP metadata and
binary trie format, including the IPv4/IPv6 conversion project
[nmgliangwei/qqwry.ipdb](https://github.com/nmgliangwei/qqwry.ipdb).
It is unrelated to native QQWry DAT, CZDB and ZX IPv6wry's identically named IPDB.

Metadata declares address families, language offsets and field names. The
default selected language is CN; unavailable languages raise
UNSUPPORTED_LANGUAGE, with no implicit fallback or translation. Country name
and code, region, city, ISP, ASN and organization are mapped only when the named
fields exist. Every selected-language field is retained in `extensions.raw`;
the selected language is retained in `extensions.language`. Metadata build time
is distinct from load time. A missing trie leaf is null; a short record, invalid
pointer, invalid UTF-8 or a cyclic/excessively deep trie is INVALID_DATABASE.
Language maps are processed iteratively; offsets exceeding the uint16 record
length capacity are rejected with INVALID_DATABASE.

IPv4 traverses the defined mapped /96 subtree. IPv6 traverses the entire 128-bit
address. Standard field mappings include `country_name`, `country_code`,
`region_name`, `city_name`, `isp_domain`/`isp_name`, `asn`, and explicitly named
organization fields (`asn_organization`, `as_name`, `organization`). An ASN
organization is never used as ISP.

## IP2Location BIN

`createBIN(bytes, options?)` supports product types DB1–DB26, IPv4-only,
IPv6-only and dual-table headers, with or without optional prefix indexes.
It validates file size, date/product header, table bounds, sorted ranges,
optional index bounds, and queried string pointers/UTF-8. Strings cannot begin
in or span the header, address tables or prefix indexes; such corrupt pointers
raise INVALID_DATABASE rather than becoming missing geographic fields. The shared memory
engine searches the range tables directly; optional indexes are validated but
not required. The all-ones terminal sentinel includes the final address.

Exposed standard fields are country code/name, region, city, ISP and the DB26
ASN/AS organization columns. Other commercial fields (coordinates, weather,
mobile codes, etc.) are not currently mapped or advertised as capabilities.
`extensions` includes the database product type and the raw values of the
mapped fields. Missing/unpurchased values are omitted from standard fields;
upgrade messages are not returned as locations. Reader error sentinels in a
record raise INVALID_DATABASE rather than becoming geographic values.

Unlike the Node vendor library, this reader does not automatically convert
6to4/Teredo/mapped IPv6 to IPv4. The core offers an explicit mapped-address
option; other transition addresses remain IPv6. This is a deliberate lookup
policy, not an assumption about data accuracy.

LITE and commercial BIN packages share a format but have different licenses,
coverage and fields. DB26 is a data product, not a separate format or a promise
of online-service accuracy. Supply a file you have rights to use. Only the attributed upstream XDB snapshots are bundled; commercial BIN/IPDB
data must be supplied separately.

## Independent verification and limits

XDB synthetic fixtures and pinned real snapshots are checked against official
`ip2region.js@3.1.8`. BIN/IPIP synthetic fixtures are checked against
`ip2location-nodejs@9.8.0` and the official `ipip-ipdb@0.6.0` reader as development-only dependencies. Reference
comparisons cover fields/languages, all product types DB1–DB26 and full
IPv6 values with differing low 64 bits. Corrupt-file tests use the shared suite
across all three runtimes. No claim is made that every real vendor edition
or release has been exercised. New data files should be verified against their
own format metadata and reference reader before deployment.

Reader tests verify decoding, not geographic accuracy. MMDB, CZDB and other
formats are future work; add an external adapter without waiting for a release.
