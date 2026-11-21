/** Generated from data/manifest.json; importing performs no file I/O. */
export const bundledRevision = "cba49ef11b4051bc25334a3c5712715d636de90d";
export const bundledMetadata = {
  id: "bundled-ip2region",
  dataVersion: `upstream:${bundledRevision}`,
  attribution: "lionsoul2014/ip2region contributors; upstream XDB snapshots (Apache-2.0 OR MIT)",
  url: `https://github.com/lionsoul2014/ip2region/tree/${bundledRevision}/data`,
} as const;

export const bundledFiles = [
  {
    family: 4,
    url: new URL("../../data/ip2region_v4.xdb", import.meta.url),
    sha256: "4ed5d3398f0a72346a6cec780c57601bb6977fa4f29e9682cd60a66e3478c542",
  },
  {
    family: 6,
    url: new URL("../../data/ip2region_v6.xdb", import.meta.url),
    sha256: "1f0be1ffbbc3e4eeef10f354e01355f22f57ec649a496a17fd602539f3d384c1",
  },
] as const;
