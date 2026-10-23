import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { cpus, totalmem } from "node:os";
import { openDatabase, openDefault } from "../dist/esm/loaders/node.js";
import { createBIN } from "../dist/esm/formats/ip2location-bin.js";
import { createIPIP } from "../dist/esm/formats/ipip-ipdb.js";
import { createIP2Region } from "../dist/esm/formats/ip2region.js";

const factories = { bin: createBIN, ipip: createIPIP, ip2region: createIP2Region };
const [format = "ip2region", path] = process.argv.slice(2);
if (!Object.hasOwn(factories, format)) throw new Error("Format must be ip2region, ipip or bin");
if (!path && format !== "ip2region") throw new Error("Supply the local database path for bin or ipip");
globalThis.gc?.();
const before = process.memoryUsage();
const start = performance.now();
const query = path ? await openDatabase(path, factories[format]) : await openDefault();
const loadMs = performance.now() - start;
globalThis.gc?.();
const after = process.memoryUsage();
const addresses = query.capabilities.families.includes(4)
  ? ["120.24.78.68", "192.0.2.1", "0.0.0.0", "255.255.255.255"]
  : [];
if (query.capabilities.families.includes(6)) addresses.push("2001:db8::1", "2001:db8::2");
for (let i = 0; i < 1000; i++) query.lookup(addresses[i % addresses.length]);
const latencies = [];
let hits = 0;
for (let i = 0; i < 10000; i++) {
  const time = performance.now();
  if (query.lookup(addresses[i % addresses.length]) !== null) hits++;
  latencies.push((performance.now() - time) * 1000);
}
latencies.sort((a, b) => a - b);
const bytes = await readFile(path ?? new URL("../data/ip2region.db", import.meta.url));
const result = {
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]?.model,
  logicalCPUs: cpus().length,
  hostMemoryBytes: totalmem(),
  format: query.metadata.format,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.length,
  loadMs,
  memoryDelta: Object.fromEntries(
    ["rss", "heapUsed", "external", "arrayBuffers"].map((key) => [key, after[key] - before[key]])
  ),
  samples: latencies.length,
  hits,
  latencyMicroseconds: { p50: latencies[5000], p95: latencies[9500], p99: latencies[9900] },
  notes:
    "Warm-up: 1000 queries. OS page cache uncontrolled. Latencies include IP parsing, allocation and clock overhead. Hits measure coverage only, not location accuracy.",
};
query.close();
console.log(JSON.stringify(result, null, 2));
