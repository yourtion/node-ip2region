import { coreSuite } from "./core.mjs";
import { formatSuite } from "./formats.mjs";
import { loaderSuite } from "./loaders.mjs";
import * as loader from "../dist/esm/loaders/deno.js";

coreSuite(Deno.test);
formatSuite(Deno.test);
loaderSuite(Deno.test, loader);
