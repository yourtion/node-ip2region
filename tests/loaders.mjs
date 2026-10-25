import { IP2Region as MemoryIP2Region, AsyncIP2Region } from "../dist/esm/index.js";
import { IP2REGION_FIELDS } from "../dist/esm/formats/ip2region-xdb.js";
import { Bytes } from "../dist/esm/formats/bytes.js";
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

  test("custom database maps route both families and retain each schema and provenance", async () => {
    const databases = {
      4: {
        format: "xdb",
        data: xdbFixture({ region: "V4|Four|retained" }),
        fields: ["country_code", "city_name", "extra"],
        metadata: { id: "custom-v4", dataVersion: "four" },
      },
      6: {
        format: "xdb",
        data: xdbFixture({ family: 6, region: "Country Six|Region Six|Six|ISP Six|V6" }),
        fields: IP2REGION_FIELDS,
        metadata: { id: "custom-v6", dataVersion: "six" },
      },
    };
    for (const query of [new IP2Region({ databases }), await IP2Region.open({ databases })]) {
      const v4 = query.lookup("192.0.2.1");
      const v6 = query.lookup("2001:db8::1");
      equal(v4.country, { code: "V4" });
      equal(v4.city, { name: "Four" });
      equal(v4.extensions.raw.extra, "retained");
      equal(v4.source, "custom-v4");
      equal(v6.country, { name: "Country Six", code: "V6" });
      equal(v6.city, { name: "Six" });
      equal(v6.source, "custom-v6");
      equal(query.lookup("2001:db8::3"), null);
      equal(query.capabilities.families, [4, 6]);
      equal(new Set(query.capabilities.fields).size, query.capabilities.fields.length);
      assert(query.capabilities.fields.includes("country.name"));
      assert(query.capabilities.fields.includes("country.code"));
      equal(query.metadata.id, "custom-databases");
      equal(query.metadata.dataVersion, undefined);
      equal(query.metadata.attribution, undefined);
      equal(
        query.metadata.datasets.map(({ id, dataVersion }) => [id, dataVersion]),
        [
          ["custom-v4", "four"],
          ["custom-v6", "six"],
        ]
      );
      query.close();
      throws(() => query.lookup("192.0.2.1"), "CLOSED");
    }
    for (const asyncOpen of [false, true]) {
      const options = { databases, mappedIPv6: "ipv4" };
      const query = asyncOpen ? await IP2Region.open(options) : new IP2Region(options);
      equal(query.lookup("::ffff:192.0.2.1").source, "custom-v4");
      query.close();
    }
  });

  test("database maps support mixed formats and expose only configured families", async () => {
    const databases = {
      4: { format: "bin", data: binFixture(), metadata: { id: "bin-v4" } },
      6: { format: "ipip", data: ipipFixture(), language: "EN", metadata: { id: "ipip-v6" } },
    };
    for (const asyncOpen of [false, true]) {
      const query = asyncOpen ? await IP2Region.open({ databases }) : new IP2Region({ databases });
      equal(query.lookup("192.0.2.1").source, "bin-v4");
      equal(query.lookup("2001:db8::1").source, "ipip-v6");
      equal(query.lookup("2001:db8::1").extensions.language, "EN");
      equal(query.capabilities.languages, ["CN", "EN"]);
      equal(
        query.metadata.datasets.map(({ format }) => format),
        ["ip2location-bin", "ipip-ipdb"]
      );
      query.close();
      for (const family of [4, 6]) {
        const options = { databases: { [family]: databases[family] } };
        const single = asyncOpen ? await IP2Region.open(options) : new IP2Region(options);
        equal(single.capabilities.families, [family]);
        throws(() => single.lookup(family === 4 ? "::1" : "192.0.2.1"), "UNSUPPORTED_FAMILY");
        single.close();
      }
    }
  });

  test("all database map options are checked before I/O and native configuration stays out of core", async () => {
    let reads = 0;
    const read = () => {
      reads++;
      return xdbFixture();
    };
    const MemoryLoader = createLoader(async () => read(), read);
    const database = { format: "xdb", path: "unused" };
    const valid = { 4: database };
    const nonenumerableExtra = Object.defineProperty({ 4: database }, "extra", { value: database });
    const cases = [
      ...[
        null,
        [],
        {},
        "4",
        { 5: database },
        { 4: undefined },
        Object.create({ 4: database }),
        { 4: database, [Symbol("extra")]: database },
        nonenumerableExtra,
        { 4: database, 6: { format: "xdb", path: "unused", fields: [] } },
        { 4: database, 6: { format: "xdb", path: "unused", metadata: { id: "" } } },
        { 4: database, 6: { format: "ipip", path: "unused", language: 42 } },
        { 4: database, 6: { format: "bin", path: "unused", fields: ["x"] } },
        { 4: database, 6: { format: "xdb", path: "unused", data: new Uint8Array() } },
      ].map((databases) => ({ databases })),
      { databases: valid, source: () => null },
      { databases: valid, database },
      { databases: valid, families: [4] },
      { databases: valid, ownership: "owned" },
    ];
    for (const options of cases) {
      throws(() => new MemoryLoader(options), "INVALID_ARGUMENT");
      await rejects(() => MemoryLoader.open(options), "INVALID_ARGUMENT");
    }
    equal(reads, 0);
    throws(() => new MemoryIP2Region({ source: () => null, databases: valid }), "INVALID_ARGUMENT");
    throws(() => new AsyncIP2Region({ source: async () => null, databases: valid }), "INVALID_ARGUMENT");
  });

  test("database map failures release prior readers and closing attempts every reader exactly once", async () => {
    const originalClose = Bytes.prototype.close;
    const closed = [];
    let failClose = false;
    const closeError = new Error("close failed");
    Bytes.prototype.close = function () {
      closed.push(this);
      originalClose.call(this);
      if (failClose && closed.length === 1) throw closeError;
    };
    try {
      for (const asyncOpen of [false, true]) {
        for (const failure of ["read", "corrupt", "family"]) {
          closed.length = 0;
          const readError = new Error("second read failed");
          const read = (path) => {
            if (path === "four") return xdbFixture();
            if (failure === "read") throw readError;
            const bytes = xdbFixture({ family: failure === "family" ? 4 : 6 });
            if (failure === "corrupt") bytes[0] = 255;
            return bytes;
          };
          const MemoryLoader = createLoader(async (path) => read(path), read);
          const options = { databases: { 4: { format: "xdb", path: "four" }, 6: { format: "xdb", path: "six" } } };
          const code =
            failure === "family" ? "INVALID_ARGUMENT" : failure === "corrupt" ? "INVALID_DATABASE" : undefined;
          const error = asyncOpen
            ? await rejects(() => MemoryLoader.open(options), code)
            : throws(() => new MemoryLoader(options), code);
          if (failure === "read") assert(error === readError);
          equal(closed.length, failure === "family" ? 2 : 1);
          equal(new Set(closed).size, closed.length);
          for (const bytes of closed) throws(() => bytes.u8(0), "CLOSED");
        }
        for (const shouldFailClose of [false, true]) {
          closed.length = 0;
          const options = {
            databases: {
              4: { format: "xdb", data: xdbFixture() },
              6: { format: "xdb", data: xdbFixture({ family: 6 }) },
            },
          };
          const query = asyncOpen ? await IP2Region.open(options) : new IP2Region(options);
          failClose = shouldFailClose;
          if (shouldFailClose) assert(throws(() => query.close(), "ADAPTER_ERROR").cause === closeError);
          else query.close();
          query.close();
          equal(closed.length, 2);
          equal(new Set(closed).size, 2);
          for (const bytes of closed) throws(() => bytes.u8(0), "CLOSED");
          failClose = false;
        }
      }
    } finally {
      Bytes.prototype.close = originalClose;
    }
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
      assert(/^(upstream|local):[a-f0-9]{40}$/.test(query.metadata.dataVersion));
      equal(query.metadata.builtAt, undefined);
      if (query.metadata.dataVersion.startsWith("local:")) {
        assert(query.metadata.attribution.includes("Operator-supplied XDB files"));
        assert(query.metadata.attribution.includes("declared upstream revision is unverified"));
      } else {
        assert(query.metadata.attribution.includes("lionsoul2014/ip2region contributors"));
        assert(query.metadata.attribution.includes("upstream XDB snapshots"));
      }
      equal(query.lookup("2001:4860:4860::8888").country.code, "US");
      equal(query.lookup("::1"), null);
      equal(query.lookup("2001:db8::1").country, undefined);
      equal(query.lookup("::ffff:120.24.78.68"), null);
      equal(query.metadata.datasets.length, 2);
      for (const dataset of query.metadata.datasets) {
        if (dataset.builtAt !== undefined) assert(Number.isFinite(Date.parse(dataset.builtAt)));
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
