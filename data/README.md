# Bundled database provenance

`ip2region.db` is the existing legacy IPv4 database already distributed by
yourtion/node-ip2region. The original update script identifies its source as
[lionsoul2014/ip2region](https://github.com/lionsoul2014/ip2region), formerly at
`data/ip2region.db` on that project's master branch.

- Format: legacy ip2region `.db`, IPv4 only; **not** XDB or IPIP IPDB.
- Size: 8,733,094 bytes.
- SHA-256: `3a8baab4f2e536a1c4a9be683cc81d563b0d4f942b304202be6f0d4aecc7f5d4`.
- Repository baseline: `41d91ef8996fe3e8d3aa3c1a0a62601c2af5b8ab`.
- Upstream data revision and build time: unknown; neither package version nor
  loading/downloading time is presented as its data build time.

The upstream project publishes its own license and data notices. The MIT
license at this package's root covers this project's reader code; it is not a
new license grant for third-party database content. See the upstream
[license](https://github.com/lionsoul2014/ip2region/blob/master/LICENSE.md) and
data documentation for the relevant terms. No new vendor database was added,
downloaded or updated for this implementation.

`openDefault()` loads this snapshot only when called. It does not download,
refresh, merge, or fall back to other sources. Replace it with an explicitly
provided, appropriately licensed database when different coverage is needed.
