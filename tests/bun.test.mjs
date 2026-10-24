import { customAdapterSuite } from "../examples/custom/custom-suite.mjs";
import { test } from "bun:test";
import { coreSuite } from "./core.mjs";
import { formatSuite } from "./formats.mjs";
import { loaderSuite } from "./loaders.mjs";
import * as loader from "../dist/esm/loaders/bun.js";
coreSuite(test);
formatSuite(test);
loaderSuite(test, loader);

customAdapterSuite(test);
