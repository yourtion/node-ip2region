import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { IP2Region } from "../dist/esm/index.js";
import { createBIN } from "../dist/esm/formats/ip2location-bin.js";
import { createIPIP } from "../dist/esm/formats/ipip-ipdb.js";
import { createXDB } from "../dist/esm/formats/ip2region-xdb.js";
import { newWithBuffer, IPv4, IPv6 } from "ip2region.js";
import { binFixture, ipipFixture, xdbFixture } from "./fixtures.mjs";
import { equal } from "./assert.mjs";
const require = createRequire(import.meta.url);
const VendorBIN = require("ip2location-nodejs").IP2Location;
const VendorIPIP = require("ipip-ipdb/lib/reader.js");
test("XDB agrees with upstream 3.1.8 on synthetic IPv4/IPv6 and pinned real snapshots", async () => {
  for (const family of [4, 6]) {
    const addresses =
      family === 4
        ? ["0.0.0.0", "192.0.2.0", "192.0.2.1", "192.0.2.2", "255.255.255.255"]
        : ["::", "::1", "::2", "2001:db8::1", "2001:db8::2", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"];
    const synthetic = Buffer.from(xdbFixture({ family }));
    const real = readFileSync(new URL(`../data/ip2region_v${family}.xdb`, import.meta.url));
    for (const bytes of [synthetic, real]) {
      const boundaries = [];
      if (bytes === real) {
        // Sample real index boundaries independently of the production parser.
        const first = bytes.readUInt32LE(8),
          last = bytes.readUInt32LE(12);
        const width = family === 4 ? 4 : 16,
          stride = width * 2 + 6;
        const count = (last - first) / stride + 1;
        for (let i = 0; i < 128; i++) {
          const at = first + Math.floor((i * (count - 1)) / 127) * stride;
          for (const offset of [at, at + width]) {
            boundaries.push(
              family === 4
                ? Array.from({ length: 4 }, (_, n) => (bytes.readUInt32LE(offset) >>> (24 - n * 8)) & 255).join(".")
                : Array.from({ length: 8 }, (_, n) => bytes.readUInt16BE(offset + n * 2).toString(16)).join(":")
            );
          }
        }
      }
      const query = new IP2Region({
        source: createXDB(bytes),
        ownership: "owned",
      });
      const reference = newWithBuffer(family === 4 ? IPv4 : IPv6, bytes);
      try {
        for (const ip of [
          ...addresses,
          ...boundaries,
          ...(bytes === real
            ? family === 4
              ? ["120.24.78.68", "8.8.8.8", "1.1.1.1", "192.0.2.255"]
              : ["2001:4860:4860::8888", "2606:4700:4700::1111", "2001:db8::ffff"]
            : []),
        ]) {
          const expected = await reference.search(ip);
          equal(query.lookup(ip)?.extensions.region ?? "", expected);
        }
      } finally {
        query.close();
        reference.close();
      }
    }
  }
});
test("BIN agrees with the independent vendor reader on synthetic IPv4/IPv6 product records", () => {
  const directory = mkdtempSync(join(tmpdir(), "ip2region-bin-reference-"));
  try {
    for (let type = 1; type <= 26; type++) {
      const bytes = binFixture({ type, indexed: true });
      const path = join(directory, "test.bin");
      writeFileSync(path, bytes);
      const reference = new VendorBIN();
      reference.open(path);
      try {
        const query = new IP2Region({
          source: createBIN(bytes),
        });
        for (const ip of ["192.0.2.0", "192.0.2.1", "192.0.2.255", "2001:db8::1", "2001:db8::2"]) {
          const actual = query.lookup(ip);
          const expected = reference.getAll(ip);
          equal(actual.country, { code: expected.countryShort, name: expected.countryLong });
          if (type >= 3) {
            equal(actual.subdivisions[0].name, expected.region);
            equal(actual.city.name, expected.city);
          }
          if ([2, 4, 6, 7, 8, 10, 12, 14, 16, 18, 19, 20, 22, 23, 24, 25, 26].includes(type))
            equal(actual.isp, expected.isp);
          if (type === 26) {
            equal(actual.asn, Number(expected.asn));
            equal(actual.organization, expected.as);
          }
        }
        query.close();
      } finally {
        reference.close();
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("IPIP agrees with the independent official reader on fields, languages and full IPv6", () => {
  const directory = mkdtempSync(join(tmpdir(), "ip2region-ipip-reference-"));
  try {
    const bytes = ipipFixture();
    const path = join(directory, "test.ipdb");
    writeFileSync(path, bytes);
    const reference = new VendorIPIP(path);
    for (const language of ["CN", "EN"]) {
      const query = new IP2Region({
        source: createIPIP(bytes, { language }),
      });
      for (const ip of [
        "192.0.2.0",
        "192.0.2.255",
        "0.0.0.0",
        "255.255.255.255",
        "2001:db8::1",
        "2001:db8::2",
        "::1",
        "::2",
        "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      ]) {
        const expected = reference.find(ip, language);
        equal(Object.values(query.lookup(ip).extensions.raw), expected);
      }
      query.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
