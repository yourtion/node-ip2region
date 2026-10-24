import { IP2Region as MemoryIP2Region } from "../dist/esm/index.js";
import { IP2REGION_FIELDS } from "../dist/esm/formats/ip2region-xdb.js";
import { assert, equal, rejects, throws } from "./assert.mjs";
import { createLoader } from "../dist/esm/loaders/shared.js";
import { xdbFixture, binFixture, ipipFixture } from "./fixtures.mjs";

export function loaderSuite(test, loader) {
  const { IP2Region } = loader;
  test("both initialization modes read only selected files and reject invalid options before I/O", async () => {
    const reads = [];
    const read = (path) => {
      const family = path.pathname.endsWith("_v4.xdb") ? 4 : 6;
      reads.push(family);
      return xdbFixture({ family });
    };
    const MemoryLoader = createLoader(async (path) => read(path), read);
    for (const asyncOpen of [false, true]) {
      for (const families of [[4], [6], [6, 4]]) {
        reads.length = 0;
        const query = asyncOpen ? await MemoryLoader.open({ families }) : new MemoryLoader({ families });
        const expected = [...families].sort();
        equal(reads, expected);
        assert(query instanceof MemoryLoader);
        assert(query instanceof MemoryIP2Region);
        equal(typeof query.lookupAsync, "undefined");
        equal(query.capabilities.families, expected);
        equal(query.metadata.datasets.length, families.length);
        for (const family of expected)
          equal(query.lookup(family === 4 ? "192.0.2.1" : "2001:db8::1").city.name, "First");
        if (families.length === 1)
          throws(() => query.lookup(families[0] === 4 ? "::1" : "192.0.2.1"), "UNSUPPORTED_FAMILY");
        query.close();
      }
      reads.length = 0;
      // Sparse arrays must fail before I/O too.
      // oxlint-disable-next-line unicorn/no-new-array
      const familiesCases = [[], [4, 4], [5], [4, 6, 5], null, "4", new Array(1)];
      const optionsCases = [
        ...familiesCases.map((families) => ({ families })),
        null,
        [],
        { source: () => null, database: { format: "bin", path: "unused" } },
        { source: () => null, families: [4] },
        { database: { format: "xdb", path: "unused" }, families: [4] },
        { database: { format: "unknown", path: "unused" } },
        { database: { format: "bin", path: "unused", data: new Uint8Array() } },
        { database: { format: "bin" } },
        { database: { format: "bin", data: [] } },
        { database: { format: "bin", path: 42 } },
        { database: { format: "bin", path: "unused", fields: [] } },
        { database: { format: "xdb", path: "unused", language: "CN" } },
        { mappedIPv6: "guess" },
        { ownership: "borrowed" },
      ];
      for (const options of optionsCases) {
        if (asyncOpen) await rejects(() => MemoryLoader.open(options), "INVALID_ARGUMENT");
        else throws(() => new MemoryLoader(options), "INVALID_ARGUMENT");
      }
      equal(reads, []);
    }
  });

  test("constructor and open accept built-in byte formats and custom sources without I/O", async () => {
    let reads = 0;
    const read = () => {
      reads++;
      throw new Error("Unexpected I/O");
    };
    const MemoryLoader = createLoader(async () => read(), read);
    for (const database of [
      { format: "xdb", data: xdbFixture(), fields: IP2REGION_FIELDS },
      { format: "bin", data: binFixture() },
      { format: "ipip", data: ipipFixture(), language: "EN" },
    ]) {
      for (const query of [new MemoryLoader({ database }), await MemoryLoader.open({ database })]) {
        equal(query.lookup("192.0.2.1").city.name, "First");
        query.close();
      }
    }
    let closes = 0;
    const source = {
      lookup: () => ({}),
      close() {
        closes++;
      },
    };
    for (const query of [new MemoryLoader({ source }), await MemoryLoader.open({ source })]) {
      equal(query.lookup("::1"), {});
      query.close();
    }
    equal(closes, 0);
    const owner = new MemoryLoader({ source, ownership: "owned" });
    owner.close();
    owner.close();
    equal(closes, 1);
    equal(reads, 0);
  });

  test("native constructor and open support each family and explicit mapped IPv4", async () => {
    for (const family of [4, 6]) {
      const options = { families: [family], mappedIPv6: family === 4 ? "ipv4" : "preserve" };
      for (const query of [new IP2Region(options), await IP2Region.open(options)]) {
        equal(query.capabilities.families, [family]);
        equal(query.metadata.datasets.length, 1);
        assert(query.metadata.datasets[0].url.endsWith(`_v${family}.xdb`));
        if (family === 4) {
          equal(query.lookup("::ffff:120.24.78.68").country.code, "CN");
          throws(() => query.lookup("::1"), "UNSUPPORTED_FAMILY");
        } else {
          equal(query.lookup("2001:4860:4860::8888").country.code, "US");
          throws(() => query.lookup("120.24.78.68"), "UNSUPPORTED_FAMILY");
        }
        query.close();
      }
    }
  });

  test("native loading returns synchronous queries and bundled data provenance", async () => {
    for (const query of [new IP2Region(), await IP2Region.open()]) {
      equal(query.lookup("120.24.78.68").country, { name: "中国", code: "CN" });
      equal(query.lookup("120.24.78.68").city, { name: "深圳市" });
      equal(query.lookup("120.24.78.68").isp, "阿里");
      equal(query.capabilities.families, [4, 6]);
      equal(query.metadata.id, "bundled-ip2region");
      assert(query.metadata.dataVersion.startsWith("upstream:"));
      equal(query.metadata.builtAt, undefined);
      assert(query.metadata.attribution.includes("lionsoul2014"));
      equal(query.lookup("2001:4860:4860::8888").country.code, "US");
      equal(query.lookup("::1"), null);
      equal(query.lookup("2001:db8::1").country, undefined);
      equal(query.lookup("::ffff:120.24.78.68"), null);
      equal(query.metadata.datasets.length, 2);
      for (const dataset of query.metadata.datasets) {
        assert(dataset.builtAt);
        assert(dataset.dataVersion.startsWith("sha256:"));
      }
      query.close();
      query.close();
      throws(() => query.lookup("120.24.78.68"), "CLOSED");
    }
  });

  test("native custom file configuration supports synchronous and asynchronous reading", async () => {
    const database = {
      format: "xdb",
      path: new URL("../data/ip2region_v4.xdb", import.meta.url),
      fields: IP2REGION_FIELDS,
    };
    for (const query of [new IP2Region({ database }), await IP2Region.open({ database })]) {
      equal(query.lookup("120.24.78.68").subdivisions, [{ name: "广东省" }]);
      query.close();
    }
    const missing = new URL("./does-not-exist.db", import.meta.url);
    throws(() => loader.readBytesSync(missing), "FILE_NOT_FOUND");
    await rejects(() => loader.readBytes(missing), "FILE_NOT_FOUND");
    throws(() => new IP2Region({ database: { format: "xdb", path: missing } }), "FILE_NOT_FOUND");
    await rejects(() => IP2Region.open({ database: { format: "xdb", path: missing } }), "FILE_NOT_FOUND");
  });

  test("partial bundled initialization reports a corrupt subsequent file", async () => {
    const bad = xdbFixture({ family: 6 });
    bad[0] = 255;
    let reads = 0;
    const read = () => (++reads === 1 ? xdbFixture() : bad);
    const MemoryLoader = createLoader(async () => read(), read);
    throws(() => new MemoryLoader(), "INVALID_DATABASE");
    equal(reads, 2);
    reads = 0;
    await rejects(() => MemoryLoader.open(), "INVALID_DATABASE");
    equal(reads, 2);
  });
}
