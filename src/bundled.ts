/** Generated from data/manifest.json; importing performs no file I/O. */
export const bundledRevision = "f8b0792b0cd729f5b2593f690aeed225e49c1967";
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
    sha256: "27ecba8c9a6d5e3b280aedbe7ee15c65372b179fbd0dad3845d8c608f2fcace1",
  },
  {
    family: 6,
    url: new URL("../../data/ip2region_v6.xdb", import.meta.url),
    sha256: "939f6b46bd2b8bec3cf7c5ceb8ba782266ae9b1f35b5ba7916700dec0b7506ed",
  },
] as const;
