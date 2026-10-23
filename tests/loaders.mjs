import { createXDB } from "../dist/esm/formats/ip2region-xdb.js";
import { assert, equal, rejects, throws } from "./assert.mjs";

export function loaderSuite(test, loader) {
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
    const query = await loader.openDatabase(new URL("../data/ip2region_v4.xdb", import.meta.url), createXDB);
    equal(query.lookup("120.24.78.68").subdivisions, [{ name: "广东省" }]);
    query.close();
    await rejects(() => loader.readBytes(new URL("./does-not-exist.db", import.meta.url)), "FILE_NOT_FOUND");
  });
}
