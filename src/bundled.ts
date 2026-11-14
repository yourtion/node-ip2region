/** Generated from data/manifest.json; importing performs no file I/O. */
export const bundledRevision = "200f4cc7a6452843ef515a889c72d295281e8da3";
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
    sha256: "a12ad5aca1277d67e525efcda531a20cc0d654ff4f087150d45bc17fca4bc260",
  },
  {
    family: 6,
    url: new URL("../../data/ip2region_v6.xdb", import.meta.url),
    sha256: "1f0be1ffbbc3e4eeef10f354e01355f22f57ec649a496a17fd602539f3d384c1",
  },
] as const;
