import { createLookup } from "../dist/esm/index.js";
import { createXDB as createRawXDB, IP2REGION_FIELDS } from "../dist/esm/formats/ip2region-xdb.js";
import { createIPIP } from "../dist/esm/formats/ipip-ipdb.js";
import { createBIN } from "../dist/esm/formats/ip2location-bin.js";
import { xdbFixture, ipipFixture, rewriteIPIP, binFixture } from "./fixtures.mjs";
import { assert, equal, throws } from "./assert.mjs";

const createXDB = (bytes, options = {}) => createRawXDB(bytes, { fields: IP2REGION_FIELDS, ...options });

function view(input) {
  const bytes = new Uint8Array(input.length + 13);
  bytes.set(input, 7);
  return bytes.subarray(7, input.length + 7);
}

export function formatSuite(test) {
  test("unconfigured XDB preserves arbitrary and legacy five-column records without geographic guesses", () => {
    for (const region of ["中国|0|广东省|深圳市|电信", "arbitrary text", "a|b"]) {
      const query = createLookup(createRawXDB(xdbFixture({ region })), { ownership: "owned" });
      equal(query.lookup("192.0.2.1"), { source: "ip2region-xdb", extensions: { region, raw: {} } });
      equal(query.capabilities.fields, []);
      query.close();
    }
  });

  test("BIN rejects strings inside or crossing structural regions", () => {
    for (const location of ["header", "v4", "v6", "index", "crossing"]) {
      const bytes = binFixture({ indexed: true });
      const view = new DataView(bytes.buffer);
      const base = view.getUint32(9, true) - 1;
      const index = view.getUint32(21, true) - 1;
      const pointer =
        location === "header"
          ? 10
          : location === "v4"
            ? base
            : location === "v6"
              ? view.getUint32(17, true) - 1
              : location === "index"
                ? index
                : index - 2;
      // The unused trailing sentinel columns are outside the address table's
      // required bytes; a string beginning there must still not span an index.
      if (location === "crossing") bytes[pointer] = 4;
      view.setUint32(base + bytes[1] * 4 + 8, pointer, true);
      const query = createLookup(createBIN(bytes), { ownership: "owned" });
      throws(() => query.lookup("192.0.2.1"), "INVALID_DATABASE");
      query.close();
    }
  });

  test("IPIP handles large language maps and rejects impossible record layouts with stable errors", () => {
    const input = rewriteIPIP(ipipFixture(), (header) => {
      header.languages = { CN: 0 };
      for (let i = 0; i < 150000; i++) header.languages[`L${i}`] = 0;
    });
    const query = createLookup(createIPIP(input), { ownership: "owned" });
    equal(query.lookup("192.0.2.1").city.name, "First");
    equal(query.capabilities.languages.length, 150001);
    query.close();
    for (const offset of [65536, Number.MAX_SAFE_INTEGER]) {
      const bytes = rewriteIPIP(ipipFixture(), (header) => {
        header.languages.EN = offset;
      });
      throws(() => createIPIP(bytes), "INVALID_DATABASE");
    }
  });
  test("all BIN product types expose only their declared standard fields", () => {
    for (let type = 1; type <= 26; type++) {
      const query = createLookup(createBIN(binFixture({ type })), { ownership: "owned" });
      for (const ip of ["192.0.2.1", "2001:db8::1"]) {
        const result = query.lookup(ip);
        equal(result.country, { code: "EX", name: "Example" });
        equal(result.city?.name, type >= 3 ? "First" : undefined);
        const hasISP = [2, 4, 6, 7, 8, 10, 12, 14, 16, 18, 19, 20, 22, 23, 24, 25, 26].includes(type);
        equal(query.capabilities.fields.includes("isp"), hasISP);
        equal(result.isp, hasISP ? "Example ISP" : undefined);
        equal(result.asn, type === 26 ? 64500 : undefined);
      }
      query.close();
    }
  });
  test("XDB supports sparse IPv4 ranges, structure 2/3, endpoints, misses and close", () => {
    for (const structure of [2, 3]) {
      const query = createLookup(createXDB(xdbFixture({ structure, edges: false, exclusive: structure === 3 })), {
        ownership: "owned",
      });
      for (const ip of ["192.0.2.0", "192.0.2.1", "192.0.2.2"]) {
        equal(query.lookup(ip).country, { name: "Example", code: "EX" });
        equal(query.lookup(ip).city, { name: "First" });
      }
      for (const ip of ["0.0.0.0", "192.0.1.255", "192.0.2.3", "192.1.0.0", "255.255.255.255"])
        equal(query.lookup(ip), null);
      throws(() => query.lookup("::1"), "UNSUPPORTED_FAMILY");
      query.close();
      throws(() => query.lookup("192.0.2.1"), "CLOSED");
      const edges = createLookup(createXDB(xdbFixture({ structure })));
      equal(edges.lookup("0.0.0.0").city.name, "First");
      equal(edges.lookup("255.255.255.255").city.name, "First");
      equal(edges.metadata.builtAt, "2024-01-01T00:00:00.000Z");
      edges.close();
    }
  });
  test("XDB IPv6 retains all 128 bits, including low-bit neighbors and the last address", () => {
    const query = createLookup(createXDB(xdbFixture({ family: 6 })), { ownership: "owned" });
    for (const ip of ["::", "::1", "2001:db8::1", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"])
      equal(query.lookup(ip).city.name, "First");
    for (const ip of ["::2", "2001:db8::2"]) equal(query.lookup(ip).city.name, "Second");
    for (const ip of ["::3", "2001:db8::3", "::ffff:192.0.2.1"]) equal(query.lookup(ip), null);
    throws(() => query.lookup("192.0.2.1"), "UNSUPPORTED_FAMILY");
    query.close();
    const spanning = createLookup(
      createXDB(xdbFixture({ edges: false, rows: [[0xc000ffffn, 0xc0020000n, "0|0|0|0|0"]] }))
    );
    equal(spanning.lookup("192.1.0.0").country, undefined);
    equal(spanning.lookup("192.2.0.1"), null);
    spanning.close();
  });
  test("XDB field layouts are explicit, preserve raw fields and never guess legacy schemas", () => {
    const fields = ["country_name", "region_name", "city_name", "isp", "extra"];
    const source = createXDB(xdbFixture({ region: "Example|0|First|0|kept" }), { fields });
    fields[0] = "changed";
    const query = createLookup(source);
    equal(query.lookup("192.0.2.1").extensions.raw.extra, "kept");
    equal(query.lookup("192.0.2.1").country, { name: "Example" });
    equal(query.lookup("192.0.2.1").isp, undefined);
    equal(query.lookup("192.0.2.1").subdivisions, undefined);
    equal(query.capabilities.fields.includes("country.code"), false);
    const raw = createLookup(createXDB(xdbFixture({ region: "arbitrary record" }), { fields: null }));
    equal(raw.lookup("192.0.2.1").extensions, { region: "arbitrary record", raw: {} });
    equal(raw.capabilities.fields, []);
    const empty = createLookup(createXDB(xdbFixture({ region: "" })));
    equal(empty.lookup("192.0.2.1"), null);
    empty.close();
    throws(
      () => createLookup(createXDB(xdbFixture({ region: "short|record" }))).lookup("192.0.2.1"),
      "INVALID_DATABASE"
    );
    for (const fields of [[], ["x", "x"], [""], ["__proto__"]])
      throws(() => createXDB(xdbFixture(), { fields }), "INVALID_ARGUMENT");
    query.close();
    raw.close();
  });
  test("XDB rejects corrupt headers, index ranges, vector entries, pointers and UTF-8", () => {
    for (const family of [4, 6]) {
      for (const edit of [
        (b, v) => v.setUint16(0, 4, true),
        (b, v) => v.setUint16(2, 2, true),
        (b, v) => v.setUint16(16, 5, true),
        (b, v) => v.setUint16(18, 8, true),
        (b, v) => v.setUint32(8, 10, true),
        (b, v) => v.setUint32(12, b.length, true),
        (b, v) => v.setUint32(256, 0xffffffff, true),
        (b, v) => {
          const first = v.getUint32(8, true);
          b.fill(255, first, first + (family === 4 ? 4 : 16));
        },
        (b, v) => {
          const first = v.getUint32(8, true);
          v.setUint32(first + (family === 4 ? 10 : 34), 256, true);
        },
      ]) {
        const bytes = xdbFixture({ family });
        edit(bytes, new DataView(bytes.buffer));
        throws(() => createXDB(bytes), "INVALID_DATABASE");
      }
      const bytes = xdbFixture({ family });
      bytes[256 + 65536 * 8] = 255;
      throws(() => createLookup(createXDB(bytes)).lookup(family === 4 ? "0.0.0.0" : "::"), "INVALID_DATABASE");
    }
  });

  for (const [name, fixture, factory] of [
    ["XDB", xdbFixture, createXDB],
    ["IPIP", ipipFixture, createIPIP],
    ["BIN", binFixture, createBIN],
  ]) {
    test(`${name} copies a non-zero-offset view, preserves metadata and closes idempotently`, () => {
      const input = view(fixture());
      const adapter = factory(input, { metadata: { id: "custom", dataVersion: "fixed" } });
      input.fill(0);
      const query = createLookup(adapter, { ownership: "owned" });
      equal(query.lookup("192.0.2.1").city, { name: "First" });
      equal(query.lookup("192.0.2.1").source, "custom");
      equal(query.metadata.dataVersion, "fixed");
      assert(query.metadata.loadedAt);
      JSON.stringify(query.lookup("192.0.2.1"));
      query.close();
      adapter.close();
      throws(() => adapter.lookup("192.0.2.1"), "CLOSED");
    });
    test(`${name} rejects truncated files and incorrect headers`, () => {
      for (const data of [new Uint8Array(), new Uint8Array(4), fixture().subarray(0, 20)])
        throws(() => factory(data), "INVALID_DATABASE");
    });
  }

  test("IPIP maps metadata field names and languages without guessing locations", () => {
    const input = ipipFixture();
    const query = createLookup(createIPIP(input));
    const result = query.lookup("192.0.2.1");
    equal(result.country, { code: "EX", name: "Example" });
    equal(result.isp, "Example ISP");
    equal(result.asn, 64500);
    equal(result.organization, "Example AS");
    equal(result.extensions.raw.extra, "kept");
    equal(query.lookup("2001:db8::1").city.name, "First");
    equal(query.lookup("2001:db8::2").city.name, "Second");
    equal(query.lookup("::1").city.name, "Tiny one");
    equal(query.lookup("::2").city.name, "Tiny two");
    equal(query.lookup("2001:db8::3"), null);
    equal(query.lookup("192.0.3.1"), null);
    equal(createLookup(createIPIP(input, { language: "EN" })).lookup("192.0.2.1").country.name, "Example (EN)");
    throws(() => createIPIP(input, { language: "FR" }), "UNSUPPORTED_LANGUAGE");
    equal(query.metadata.builtAt, "2024-01-01T00:00:00.000Z");
    equal(query.metadata.dataVersion, undefined);
  });

  test("IPIP supports first/last addresses, family declarations and absent optional fields", () => {
    const query = createLookup(createIPIP(ipipFixture()));
    equal(query.lookup("0.0.0.0").city.name, "Zero");
    equal(query.lookup("255.255.255.255").city.name, "Maximum");
    equal(query.lookup("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff").city.name, "Maximum");
    for (const [version, unsupported] of [
      [1, "::1"],
      [2, "192.0.2.1"],
    ])
      throws(() => createLookup(createIPIP(ipipFixture({ version }))).lookup(unsupported), "UNSUPPORTED_FAMILY");
    const only = createLookup(
      createIPIP(ipipFixture({ fields: ["country_name"], values: { country_name: "United States" } }))
    );
    const result = only.lookup("192.0.2.1");
    equal(result.country, { name: "United States" });
    equal(result.city, undefined);
    equal(result.isp, undefined);
    const asOnly = createLookup(createIPIP(ipipFixture({ fields: ["asn_organization"] }))).lookup("192.0.2.1");
    equal(asOnly.organization, "Example AS");
    equal(asOnly.isp, undefined);
  });

  test("IPIP rejects malformed metadata, corrupt pointers, short language records and cycles", () => {
    for (const edit of [
      (m) => {
        m.node_count = -1;
      },
      (m) => {
        m.total_size++;
      },
      (m) => {
        m.fields = ["x", "x"];
      },
      (m) => {
        m.ip_version = 4;
      },
      (m) => {
        m.languages.CN = -1;
      },
    ])
      throws(() => createIPIP(rewriteIPIP(ipipFixture(), edit)), "INVALID_DATABASE");
    const pointer = ipipFixture();
    const at = new DataView(pointer.buffer).getUint32(0) + 4;
    new DataView(pointer.buffer).setUint32(at, 0xffffffff);
    throws(() => createIPIP(pointer), "INVALID_DATABASE");
    const short = rewriteIPIP(ipipFixture(), (m) => {
      m.languages.CN = 1000;
    });
    throws(() => createLookup(createIPIP(short)).lookup("192.0.2.1"), "INVALID_DATABASE");
    const cycle = ipipFixture({ version: 2 });
    const body = new DataView(cycle.buffer).getUint32(0) + 4;
    new DataView(cycle.buffer).setUint32(body, 0);
    throws(() => createLookup(createIPIP(cycle)).lookup("::1"), "INVALID_DATABASE");
  });

  test("BIN supports indexed and unindexed tables and all 128 IPv6 bits", () => {
    for (const indexed of [false, true]) {
      const query = createLookup(createBIN(binFixture({ indexed })));
      const result = query.lookup("192.0.2.1");
      equal(result.country, { code: "EX", name: "Example" });
      equal(result.city.name, "First");
      equal(result.isp, "Example ISP");
      equal(query.lookup("2001:db8::1").city.name, "First");
      equal(query.lookup("2001:db8::2").city.name, "Second");
      for (const ip of ["0.0.0.0", "255.255.255.255", "::", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"]) {
        const row = query.lookup(ip);
        assert(row !== null);
        equal(row.country, undefined);
      }
      equal(query.metadata.builtAt, "2026-01-01");
    }
  });

  test("BIN declares actual product capabilities, separates ASN/ISP and omits unpurchased fields", () => {
    const minimal = createLookup(createBIN(binFixture({ type: 1, ipv6: false })));
    equal(minimal.capabilities.families, [4]);
    equal(minimal.capabilities.fields, ["country.code", "country.name"]);
    const result = minimal.lookup("192.0.2.1");
    equal(result.city, undefined);
    equal(result.isp, undefined);
    throws(() => minimal.lookup("::1"), "UNSUPPORTED_FAMILY");
    const db26 = createLookup(createBIN(binFixture({ type: 26, isp: "-" })));
    const full = db26.lookup("192.0.2.1");
    equal(full.asn, 64500);
    equal(full.organization, "Example AS");
    equal(full.isp, undefined);
    const ad = createLookup(
      createBIN(
        binFixture({ isp: "This parameter is unavailable for selected data file. Please upgrade the data file." })
      )
    );
    equal(ad.lookup("192.0.2.1").isp, undefined);
  });

  test("BIN rejects invalid sizes, tables, indexes, record pointers, UTF-8 and reader error sentinels", () => {
    for (const edit of [
      (b) => {
        b[0] = 0;
      },
      (b) => {
        b[29] = 0;
      },
      (b) => {
        b[3] = 13;
      },
      (b) => new DataView(b.buffer).setUint32(9, 0xffffffff, true),
      (b) => new DataView(b.buffer).setUint32(21, 0xffffffff, true),
    ]) {
      const bytes = binFixture();
      edit(bytes);
      throws(() => createBIN(bytes), "INVALID_DATABASE");
    }
    const pointer = binFixture();
    const dv = new DataView(pointer.buffer);
    const base = dv.getUint32(9, true) - 1;
    dv.setUint32(base + 20 + 4, 0xffffffff, true);
    throws(() => createLookup(createBIN(pointer)).lookup("192.0.2.1"), "INVALID_DATABASE");
    const utf8 = binFixture();
    const view = new DataView(utf8.buffer);
    const country = view.getUint32(base + 20 + 4, true);
    utf8[country + 4] = 0xff;
    throws(() => createLookup(createBIN(utf8)).lookup("192.0.2.1"), "INVALID_DATABASE");
    throws(
      () => createLookup(createBIN(binFixture({ countryName: "MISSING_FILE" }))).lookup("192.0.2.1"),
      "INVALID_DATABASE"
    );
  });
}
