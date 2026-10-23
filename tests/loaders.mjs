import { createIP2Region } from "../dist/esm/formats/ip2region.js";
import { assert, equal, rejects, throws } from "./assert.mjs";

export function loaderSuite(test, loader) {
  test("native default loading is explicit and bundled data has provenance", async () => {
    const query = await loader.openDefault();
    const result = query.lookup("120.24.78.68");
    equal(result.country, { name: "中国" });
    equal(result.city, { name: "深圳市" });
    equal(result.isp, "阿里云");
    equal(result.country.code, undefined);
    equal(query.capabilities.families, [4]);
    equal(query.metadata.id, "bundled-ip2region");
    assert(query.metadata.dataVersion.startsWith("sha256:"));
    equal(query.metadata.builtAt, undefined);
    assert(query.metadata.attribution.includes("lionsoul2014"));
    throws(() => query.lookup("2001:db8::1"), "UNSUPPORTED_FAMILY");
    query.close();
    query.close();
    throws(() => query.lookup("120.24.78.68"), "CLOSED");
  });

  test("native path loader accepts a reader factory and reports missing local files", async () => {
    const query = await loader.openDatabase(new URL("../data/ip2region.db", import.meta.url), createIP2Region);
    equal(query.lookup("120.24.78.68").subdivisions, [{ name: "广东省" }]);
    query.close();
    await rejects(() => loader.readBytes(new URL("./does-not-exist.db", import.meta.url)), "FILE_NOT_FOUND");
  });
}
