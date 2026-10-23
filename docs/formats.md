# Format support

All built-in readers use the same Uint8Array/DataView/TextDecoder implementation
on Node, Bun and Deno. They copy the effective input view, including a non-zero
byteOffset. They do not download data or depend on vendor runtime packages.

## Legacy ip2region .db

`createIP2Region(bytes, options?)` reads the legacy IPv4 ip2region database,
including the existing bundled snapshot. It validates the header, sorted,
non-overlapping index ranges, packed record lengths and pointers. Sparse ranges
return null; a query after the final index never reads beyond the index.

The format explicitly separates country, region, subdivision, city and ISP with
`|`; mapping those defined columns does not infer administrative boundaries from
a free-form place name. City ID and the original delimited value are retained
as `{ extensions: { cityId, region } }`. Country codes are not invented. The old
ZX IPv6wry binary and heuristic geographic parsing are not supported.

To create a compatible custom IPv4 file, use the Java maker from upstream
[v1.9.0](https://github.com/lionsoul2014/ip2region/tree/v1.9.0/maker/java).
Start with that version's `data/ip.merge.txt` and maintain the format
`startIPv4|endIPv4|country|region|subdivision|city|ISP`. Ranges must be sorted and
non-overlapping; split existing ranges before inserting replacements. Unknown
fields use `0`. Run from the upstream checkout with an existing output directory:

```sh
mkdir -p custom-data
java -jar maker/java/dbMaker-1.2.2.jar \
  -src ./my-ip.merge.txt \
  -region ./data/global_region.csv \
  -dst ./custom-data
```

Load the resulting file with
`openDatabase("/absolute/path/custom-data/ip2region.db", createIP2Region)`.
This replaces the selected source without fallback. Keep files in the
application's own data directory so reinstalling the package cannot overwrite
them. XDB, CSV, JSON and text files cannot be made compatible by changing their
extension.

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

IPv4 traverses the defined mapped /96 subtree. IPv6 traverses the entire 128-bit
address. Standard field mappings include `country_name`, `country_code`,
`region_name`, `city_name`, `isp_domain`/`isp_name`, `asn`, and explicitly named
organization fields (`asn_organization`, `as_name`, `organization`). An ASN
organization is never used as ISP.

## IP2Location BIN

`createBIN(bytes, options?)` supports product types DB1–DB26, IPv4-only,
IPv6-only and dual-table headers, with or without optional prefix indexes.
It validates file size, date/product header, table bounds, sorted ranges,
optional index bounds, and queried string pointers/UTF-8. The shared memory
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
of online-service accuracy. Supply a file you have rights to use. No commercial
or other newly acquired database is distributed here.

## Independent verification and limits

Synthetic fixtures are checked against `ip2location-nodejs@9.8.0` and the
official `ipip-ipdb@0.6.0` reader as development-only dependencies. Reference
comparisons cover fields/languages, all product types DB1–DB26 and full
IPv6 values with differing low 64 bits. Corrupt-file tests use the shared suite
across all three runtimes. No claim is made that every real vendor edition
or release has been exercised. New data files should be verified against their
own format metadata and reference reader before deployment.

Reader tests verify decoding, not geographic accuracy. MMDB, XDB, CZDB and other
formats are future work; add an external adapter without waiting for a release.
