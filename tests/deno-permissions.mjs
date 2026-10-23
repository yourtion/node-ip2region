import { createLookup } from "../dist/esm/index.js";
import { createIPIP } from "../dist/esm/formats/ipip-ipdb.js";
import { openDefault } from "../dist/esm/loaders/deno.js";
import { ipipFixture } from "./fixtures.mjs";
import { equal, rejects } from "./assert.mjs";

const memory = createLookup(createIPIP(ipipFixture()));
equal(memory.lookup("2001:db8::2").city.name, "Second");
memory.close();
await rejects(() => openDefault(), "PERMISSION_DENIED");
console.log("Memory lookup needs no file permission; native file loading reports PERMISSION_DENIED");
