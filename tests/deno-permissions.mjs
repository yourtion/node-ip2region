import { IP2Region } from "../dist/esm/index.js";
import { createIPIP } from "../dist/esm/formats/ipip-ipdb.js";
import { IP2Region as NativeIP2Region } from "../dist/esm/loaders/deno.js";
import { ipipFixture } from "./fixtures.mjs";
import { equal, throws, rejects } from "./assert.mjs";
const memory = new IP2Region({
  source: createIPIP(ipipFixture()),
});
equal(memory.lookup("2001:db8::2").city.name, "Second");
memory.close();
throws(() => new NativeIP2Region(), "PERMISSION_DENIED");
await rejects(() => NativeIP2Region.open(), "PERMISSION_DENIED");
console.log("Memory lookup needs no file permission; native file loading reports PERMISSION_DENIED");
