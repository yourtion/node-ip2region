import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createLookup } from "../dist/esm/index.js";
import { createBIN } from "../dist/esm/formats/ip2location-bin.js";
import { createIPIP } from "../dist/esm/formats/ipip-ipdb.js";
import { binFixture, ipipFixture } from "./fixtures.mjs";
import { equal } from "./assert.mjs";

const require = createRequire(import.meta.url);
const VendorBIN = require("ip2location-nodejs").IP2Location;
const VendorIPIP = require("ipip-ipdb/lib/reader.js");

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
        const query = createLookup(createBIN(bytes));
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
      const query = createLookup(createIPIP(bytes, { language }));
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
