/** This existing snapshot is intentionally not described as current upstream data. */
export const bundledMetadata = {
  id: "bundled-ip2region",
  dataVersion: "sha256:3a8baab4f2e536a1c4a9be683cc81d563b0d4f942b304202be6f0d4aecc7f5d4",
  attribution: "lionsoul2014/ip2region; existing yourtion/node-ip2region legacy IPv4 database snapshot",
  url: "https://github.com/lionsoul2014/ip2region",
} as const;

export const bundledURL = new URL("../../data/ip2region.db", import.meta.url);
