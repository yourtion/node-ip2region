import { createXDB, IP2REGION_FIELDS } from "../dist/esm/formats/ip2region-xdb.js";
import { assert, equal, rejects, throws } from "./assert.mjs";
import { createLoader } from "../dist/esm/loaders/shared.js";
import { xdbFixture } from "./fixtures.mjs";

export function loaderSuite(test, loader) {
  test("default family selection reads only selected files and rejects invalid options before I/O", async () => {
    const read = [];
    const memoryLoader = createLoader(async (path) => {
      const family = path.pathname.endsWith("_v4.xdb") ? 4 : 6;
      read.push(family);
      return xdbFixture({ family });
    });
    for (const families of [[4], [6], [6, 4]]) {
      read.length = 0;
      const query = await memoryLoader.openDefault({ families });
      const expected = [...families].sort();
      equal(read, expected);
      equal(query.capabilities.families, expected);
      equal(query.metadata.datasets.length, families.length);
      for (const family of expected) equal(query.lookup(family === 4 ? "192.0.2.1" : "2001:db8::1").city.name, "First");
      if (families.length === 1)
        throws(() => query.lookup(families[0] === 4 ? "::1" : "192.0.2.1"), "UNSUPPORTED_FAMILY");
      query.close();
    }
    read.length = 0;
    for (const families of [[], [4, 4], [5], [4, 6, 5], null, "4", new Array(1)])
      await rejects(() => memoryLoader.openDefault({ families }), "INVALID_ARGUMENT");
    equal(read, []);
  });

  test("native default loading supports each family independently and explicit mapped IPv4", async () => {
    for (const family of [4, 6]) {
      const query = await loader.openDefault({ families: [family], mappedIPv6: family === 4 ? "ipv4" : "preserve" });
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
  });
  test("native default loading is explicit and bundled data has provenance", async () => {
    const query = await loader.openDefault();
    const result = query.lookup("120.24.78.68");
    equal(result.country, { name: "中国", code: "CN" });
    equal(result.city, { name: "深圳市" });
    equal(result.isp, "阿里");
    equal(result.country.code, "CN");
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
  });

  test("native path loader accepts a reader factory and reports missing local files", async () => {
    const query = await loader.openDatabase(new URL("../data/ip2region_v4.xdb", import.meta.url), (bytes) =>
      createXDB(bytes, { fields: IP2REGION_FIELDS })
    );
    equal(query.lookup("120.24.78.68").subdivisions, [{ name: "广东省" }]);
    query.close();
    await rejects(() => loader.readBytes(new URL("./does-not-exist.db", import.meta.url)), "FILE_NOT_FOUND");
  });
}
