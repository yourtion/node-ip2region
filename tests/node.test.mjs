import { test } from "node:test";
import { isIP } from "node:net";
import { coreSuite, validIPs, invalidIPs } from "./core.mjs";
import { equal } from "./assert.mjs";
import { createLookup } from "../dist/esm/index.js";
import { createIPIP } from "../dist/esm/formats/ipip-ipdb.js";
import { ipipFixture } from "./fixtures.mjs";
import { formatSuite } from "./formats.mjs";
import { loaderSuite } from "./loaders.mjs";
import * as loader from "../dist/esm/loaders/node.js";

coreSuite(test);
formatSuite(test);
loaderSuite(test, loader);
test("Node Buffer subviews are copied rather than aliased", () => {
  const input = ipipFixture();
  const backing = Buffer.alloc(input.length + 17);
  backing.set(input, 9);
  const view = backing.subarray(9, 9 + input.length);
  const query = createLookup(createIPIP(view), { ownership: "owned" });
  backing.fill(0);
  equal(query.lookup("2001:db8::2").city.name, "Second");
  query.close();
});
test("literal acceptance agrees with the independent Node parser for the shared vectors", () => {
  for (const [ip, , family] of validIPs) equal(isIP(ip), family);
  for (const ip of invalidIPs) if (typeof ip === "string" && !ip.includes("%")) equal(isIP(ip), 0);
});
