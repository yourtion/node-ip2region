# Bundled ip2region XDB snapshots

Both unmodified files come from [lionsoul2014/ip2region](https://github.com/lionsoul2014/ip2region/tree/f8b0792b0cd729f5b2593f690aeed225e49c1967/data),
pinned upstream revision `f8b0792b0cd729f5b2593f690aeed225e49c1967`, retrieved
2026-10-23. `openDefault()` explicitly loads both and routes by address family.
The `families: [4]` or `[6]` option reads only the selected file.
The old `ip2region.db` and ZX IPv6wry files are removed.

| File             |      Bytes | Header build time (UTC) | SHA-256                                                            |
| ---------------- | ---------: | ----------------------- | ------------------------------------------------------------------ |
| ip2region_v4.xdb | 11,122,642 | 2026-10-14T02:11:07Z    | `27ecba8c9a6d5e3b280aedbe7ee15c65372b179fbd0dad3845d8c608f2fcace1` |
| ip2region_v6.xdb | 37,277,813 | 2026-08-14T05:38:41Z    | `939f6b46bd2b8bec3cf7c5ceb8ba782266ae9b1f35b5ba7916700dec0b7506ed` |

Both use XDB structure 3, vector indexes and 4-byte pointers. The documented
upstream schema at this revision is `国家|省份|城市|ISP|iso-alpha2-code`, mapped
as `country_name|region_name|city_name|isp|country_code`. This is unrelated to the
old five-field `.db` schema. The bundled loader explicitly selects this layout;
the generic XDB reader defaults to uninterpreted raw text. Custom XDB records
require their own field layout for standard geographic fields.

Upstream copyright and license text is retained verbatim in
[LICENSE.ip2region.md](LICENSE.ip2region.md): **Apache-2.0 OR MIT**. These are the
public files distributed in that upstream repository; no commercial database or
service data is included. Licenses for independently supplied data remain the
user's responsibility and are separate from reader code licensing.

A header build timestamp describes the binary's build, not the freshness of every
underlying range. File hashes identify the exact snapshots. Runtime `loadedAt`
is separate; loading/downloading the same file does not create a new data version.
No automatic downloading or updating occurs at import, installation or lookup.
No geographic-accuracy guarantee is implied by upstream attribution or passing
reader tests. Updating these files requires checking upstream provenance/license,
recording new digests and rerunning reference and native-runtime validation.
