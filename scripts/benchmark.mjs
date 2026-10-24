import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { cpus, totalmem } from "node:os";
import { parseArgs } from "node:util";

const runtime = typeof Deno !== "undefined" ? "deno" : typeof Bun !== "undefined" ? "bun" : "node";
const version = runtime === "deno" ? Deno.version.deno : runtime === "bun" ? Bun.version : process.versions.node;
const { IP2Region, readBytes } = await import(`../dist/esm/loaders/${runtime}.js`);
const args = runtime === "deno" ? Deno.args : process.argv.slice(2);
const { values, positionals } = parseArgs({
  args,
  options: { families: { type: "string", default: "4,6" } },
  allowPositionals: true,
});
const [format = "xdb", path] = positionals;
const formats = ["bin", "ipip", "xdb"];
if (positionals.length > 2 || !formats.includes(format))
  throw new Error("Usage: benchmark.mjs [xdb|bin|ipip] [local-file] [--families=4|6|4,6]");
if (!path && format !== "xdb") throw new Error("Supply the local database path for bin or ipip");
if (!["4", "6", "4,6", "6,4"].includes(values.families)) throw new Error("Families must be 4, 6 or 4,6");
if (path && args.some((arg) => arg === "--families" || arg.startsWith("--families=")))
  throw new Error("--families selects bundled files; custom files declare their own address families");
const families = values.families.split(",").map(Number);
const collect = runtime === "bun" ? () => Bun.gc(true) : typeof globalThis.gc === "function" ? globalThis.gc : null;
const memoryUsage = () => (runtime === "deno" ? Deno.memoryUsage() : process.memoryUsage());
collect?.();
const before = memoryUsage();
const start = performance.now();
const query = await IP2Region.open(path ? { database: { format, path } } : { families });
const loadMs = performance.now() - start;
try {
  collect?.();
  const after = memoryUsage();
  const addresses = query.capabilities.families.includes(4)
    ? ["120.24.78.68", "8.8.8.8", "1.1.1.1", "192.0.2.1", "0.0.0.0", "255.255.255.255"]
    : [];
  if (query.capabilities.families.includes(6))
    addresses.push("2001:4860:4860::8888", "2606:4700:4700::1111", "2001:db8::1", "2001:db8::2");
  if (addresses.length === 0) throw new Error("The database declares no supported address family");
  const warmup = 1000;
  const samples = 10000;
  for (let i = 0; i < warmup; i++) query.lookup(addresses[i % addresses.length]);
  const latencies = [];
  let hits = 0;
  for (let i = 0; i < samples; i++) {
    const time = performance.now();
    if (query.lookup(addresses[i % addresses.length]) !== null) hits++;
    latencies.push((performance.now() - time) * 1000);
  }
  latencies.sort((a, b) => a - b);
  const throughputSamples = 100000;
  let throughputHits = 0;
  const throughputStart = performance.now();
  for (let i = 0; i < throughputSamples; i++) {
    if (query.lookup(addresses[i % addresses.length]) !== null) throughputHits++;
  }
  const throughputMs = performance.now() - throughputStart;
  const datasets = [];
  for (const local of path
    ? [path]
    : [...families].sort().map((family) => new URL(`../data/ip2region_v${family}.xdb`, import.meta.url))) {
    const bytes = await readBytes(local);
    datasets.push({
      file: String(local).split(/[\\/]/).at(-1),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    });
  }
  console.log(
    JSON.stringify(
      {
        runtime,
        version,
        loader: `ip2region/${runtime}`,
        platform: process.platform,
        architecture: process.arch,
        cpu: cpus()[0]?.model,
        logicalCPUs: cpus().length,
        hostMemoryBytes: totalmem(),
        format: query.metadata.format,
        families: query.capabilities.families,
        datasets,
        bytes: datasets.reduce((sum, data) => sum + data.bytes, 0),
        gcRequested: collect !== null,
        loadMs,
        memoryDelta: Object.fromEntries(
          ["rss", "heapUsed", "external", "arrayBuffers"].map((key) => [
            key,
            typeof before[key] === "number" && typeof after[key] === "number" ? after[key] - before[key] : null,
          ])
        ),
        workload: { addresses, warmup, samples },
        hits,
        latencyMicroseconds: { p50: latencies[5000], p95: latencies[9500], p99: latencies[9900] },
        throughput: {
          samples: throughputSamples,
          hits: throughputHits,
          durationMs: throughputMs,
          queriesPerSecond: (throughputSamples * 1000) / throughputMs,
        },
        notes:
          "OS page cache uncontrolled. Memory counters differ by runtime; unavailable counters are null. Latency includes parsing, allocation and clock overhead. This small cyclic workload measures coverage and speed, not geographic accuracy or production traffic.",
      },
      null,
      2
    )
  );
} finally {
  query.close();
}
