import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { cpus, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "benchmark-xdb";
const FIELDS = ["country_name", "region_name", "city_name", "isp", "country_code"];
const args = typeof Deno === "undefined" ? process.argv.slice(2) : Deno.args;
const { values } = parseArgs({
  args,
  options: {
    worker: { type: "string" },
    baseline: { type: "string" },
    runtimes: { type: "string", default: "node" },
    repetitions: { type: "string", default: "5" },
    size: { type: "string", default: "4096" },
    samples: { type: "string", default: "100000" },
    warmup: { type: "string", default: "20000" },
    output: { type: "string" },
  },
});

function integer(value, name, minimum, maximum) {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum)
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return number;
}

function standard(region) {
  if (region === "") return null;
  const values = region.split("|");
  if (values.length !== FIELDS.length) throw new Error("Unexpected XDB field layout");
  const raw = {};
  FIELDS.forEach((name, i) => {
    raw[name] = values[i];
  });
  const field = (value) =>
    value === undefined || ["", "0", "-", "--", "?", "未知", "unknown"].includes(value) ? undefined : value;
  const place = (value) => (value === "Reserved" ? undefined : field(value));
  const country = place(raw.country_name),
    code = field(raw.country_code);
  const subdivision = place(raw.region_name),
    city = place(raw.city_name),
    isp = field(raw.isp);
  return {
    ...(country || code ? { country: { ...(country ? { name: country } : {}), ...(code ? { code } : {}) } } : {}),
    ...(subdivision ? { subdivisions: [{ name: subdivision }] } : {}),
    ...(city ? { city: { name: city } } : {}),
    ...(isp ? { isp } : {}),
    source: SOURCE,
    extensions: { region, raw },
  };
}

function checksum(value, mapped) {
  if (!mapped) return value.length;
  if (value === null) return 0;
  return (
    value.extensions.region.length +
    (value.country?.name?.length ?? 0) +
    (value.country?.code?.length ?? 0) +
    (value.subdivisions?.[0]?.name?.length ?? 0) +
    (value.city?.name?.length ?? 0) +
    (value.isp?.length ?? 0)
  );
}

async function gc() {
  if (typeof Bun !== "undefined") {
    Bun.gc(true);
    Bun.gc(true);
  } else {
    assert.equal(typeof globalThis.gc, "function", "Expose GC for benchmark workers");
    globalThis.gc();
    globalThis.gc();
  }
  await new Promise((done) => setTimeout(done, 0));
}

async function worker(job) {
  const corpus = JSON.parse(readFileSync(job.corpus, "utf8"));
  const mapped = job.candidate.endsWith("standard");
  const directory = job.candidate.startsWith("baseline") ? job.baseline : root;
  const api = await import(pathToFileURL(join(directory, "dist/esm/index.js")).href);
  const format = await import(pathToFileURL(join(directory, "dist/esm/formats/ip2region-xdb.js")).href);
  const open = () => {
    const source = format.createXDB(readFileSync(job.path), {
      fields: mapped ? FIELDS : null,
      metadata: { id: SOURCE },
    });
    const query =
      typeof api.createLookup === "function"
        ? api.createLookup(source, { ownership: "owned" })
        : new api.IP2Region({ source, ownership: "owned" });
    return {
      lookup: mapped ? (ip) => query.lookup(ip) : (ip) => query.lookup(ip)?.extensions.region ?? "",
      close: () => query.close(),
    };
  };
  const memory = () => (typeof Deno === "undefined" ? process.memoryUsage() : Deno.memoryUsage());
  await gc();
  const before = memory();
  const loadStart = performance.now();
  const query = open();
  const loadMs = performance.now() - loadStart;
  try {
    await gc();
    const after = memory();
    for (const { ip, region } of corpus.records) {
      const actual = query.lookup(ip);
      assert.deepEqual(actual, mapped ? standard(region) : region, `Mismatch: ${job.candidate} ${ip}`);
    }
    const lookup = query.lookup;
    const records = corpus.records;
    const size = records.length;
    const batch = (count) => {
      let total = 0;
      for (let i = 0; i < count; i++) total += checksum(lookup(records[i % size].ip), mapped);
      return total;
    };
    batch(job.warmup);
    const latencies = [];
    for (let i = 0; i < 10000; i++) {
      const start = performance.now();
      const value = lookup(records[i % size].ip);
      checksum(value, mapped);
      latencies.push((performance.now() - start) * 1000);
    }
    latencies.sort((a, b) => a - b);
    const start = performance.now();
    const total = batch(job.samples);
    const durationMs = performance.now() - start;
    let expected = 0;
    for (let i = 0; i < job.samples; i++) {
      const record = records[i % size];
      expected += checksum(mapped ? standard(record.region) : record.region, mapped);
    }
    assert.equal(total, expected);
    return {
      candidate: job.candidate,
      runtime: typeof Deno !== "undefined" ? "deno" : typeof Bun !== "undefined" ? "bun" : "node",
      version:
        typeof Deno !== "undefined"
          ? Deno.version.deno
          : typeof Bun !== "undefined"
            ? Bun.version
            : process.versions.node,
      family: job.family,
      loadMs,
      memoryDelta: Object.fromEntries(
        ["rss", "heapUsed", "external", "arrayBuffers"].map((key) => [
          key,
          typeof before[key] === "number" && typeof after[key] === "number" ? after[key] - before[key] : null,
        ])
      ),
      verified: records.length,
      warmup: job.warmup,
      samples: job.samples,
      checksum: total,
      durationMs,
      queriesPerSecond: (job.samples * 1000) / durationMs,
      latencyMicroseconds: { p50: latencies[5000], p95: latencies[9500], p99: latencies[9900] },
    };
  } finally {
    query.close();
  }
}

function address(bytes, offset, width) {
  if (width === 4) return Array.from({ length: 4 }, (_, i) => bytes[offset + 3 - i]).join(".");
  const words = Array.from({ length: 8 }, (_, i) => bytes.readUInt16BE(offset + i * 2).toString(16));
  let at = -1,
    length = 1;
  for (let i = 0; i < words.length;) {
    if (words[i] !== "0") {
      i++;
      continue;
    }
    let end = i;
    while (end < words.length && words[end] === "0") end++;
    if (end - i > length) {
      at = i;
      length = end - i;
    }
    i = end;
  }
  return at < 0 ? words.join(":") : `${words.slice(0, at).join(":")}::${words.slice(at + length).join(":")}`;
}

async function coordinator() {
  const repetitions = integer(values.repetitions, "repetitions", 1, 20);
  const size = integer(values.size, "size", 16, 65536);
  const samples = integer(values.samples, "samples", 1000, 10000000);
  const warmup = integer(values.warmup, "warmup", 1000, 1000000);
  const runtimes = values.runtimes.split(",");
  const commands = {
    node: [process.execPath, "--expose-gc"],
    bun: [process.env.IP2REGION_BUN ?? "bun"],
    deno: [process.env.IP2REGION_DENO ?? "deno", "run", "--allow-read", "--allow-sys", "--v8-flags=--expose-gc"],
  };
  if (runtimes.some((runtime) => !Object.hasOwn(commands, runtime)) || new Set(runtimes).size !== runtimes.length)
    throw new Error("runtimes must contain distinct node, bun or deno entries");
  const baseline = values.baseline ? resolve(values.baseline) : undefined;
  const temporary = mkdtempSync(join(tmpdir(), "ip2region-matrix-"));
  const report = {
    recordedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model,
      logicalCPUs: cpus().length,
      hostMemoryBytes: totalmem(),
    },
    methodology: {
      repetitions,
      size,
      samples,
      warmup,
      seed: "0x243f6a88",
      order: "cyclically rotated candidates in sequential fresh processes",
      corpus: "stratified XDB index sampling; alternating first and last addresses of disjoint segments",
      io: "all candidates read the full same file via node:fs.readFileSync; import and corpus setup excluded",
      output: "raw region text or standard records; expected values decoded independently from sampled XDB segments",
      validation: "every candidate verifies the complete corpus and measured checksum before accepting a result",
      notes:
        "GC requested before/after loading. OS page cache uncontrolled. Corpus samples ranges, not production traffic or location accuracy. Query timings include parsing and output consumption. All measured query APIs are synchronous.",
    },
    versions: {},
    datasets: [],
    cases: [],
  };
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  report.versions.currentHead = git("rev-parse", "HEAD");
  report.versions.currentBranch = git("branch", "--show-current");
  report.versions.runtimes = {};
  const treeHash = (directory, extension) => {
    const hash = createHash("sha256");
    const visit = (relative = "") => {
      for (const entry of readdirSync(join(directory, relative), { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        const name = join(relative, entry.name);
        if (entry.isDirectory()) visit(name);
        else if (name.endsWith(extension))
          hash
            .update(name + "\0")
            .update(readFileSync(join(directory, name)))
            .update("\0");
      }
    };
    visit();
    return hash.digest("hex");
  };
  report.versions.currentSourceSHA256 = treeHash(join(root, "src"), ".ts");
  report.versions.currentCompiledSHA256 = treeHash(join(root, "dist/esm"), ".js");
  report.versions.harnessSHA256 = createHash("sha256")
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .digest("hex");
  if (baseline) {
    report.versions.baselineDirectory = baseline;
    report.versions.baselineSourceSHA256 = treeHash(join(baseline, "src"), ".ts");
    report.versions.baselineCompiledSHA256 = treeHash(join(baseline, "dist/esm"), ".js");
  }
  try {
    const corpora = new Map();
    for (const family of [4, 6]) {
      const path = join(root, `data/ip2region_v${family}.xdb`);
      const bytes = readFileSync(path);
      const width = family === 4 ? 4 : 16,
        stride = width * 2 + 6;
      const first = bytes.readUInt32LE(8),
        last = bytes.readUInt32LE(12);
      const count = (last - first) / stride + 1;
      assert(size <= count);
      let seed = 0x243f6a88;
      const next = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return seed >>> 0;
      };
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const records = [];
      for (let i = 0; i < size; i++) {
        const low = Math.floor((i * count) / size),
          high = Math.floor(((i + 1) * count) / size);
        const index = low + (next() % (high - low));
        const ip = address(bytes, first + index * stride + (i % 2) * width, width);
        const recordSize = bytes.readUInt16LE(first + index * stride + width * 2);
        const pointer = bytes.readUInt32LE(first + index * stride + width * 2 + 2);
        records.push({ ip, region: decoder.decode(bytes.subarray(pointer, pointer + recordSize)) });
      }
      assert.equal(new Set(records.map((record) => record.ip)).size, size);
      const corpus = JSON.stringify({ family, records });
      const corpusPath = join(temporary, `corpus-${family}.json`);
      writeFileSync(corpusPath, corpus);
      corpora.set(family, corpusPath);
      report.datasets.push({
        family,
        file: `ip2region_v${family}.xdb`,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        corpusSHA256: createHash("sha256").update(corpus).digest("hex"),
        addresses: records.length,
        distinctRegions: new Set(records.map((record) => record.region)).size,
        hits: records.filter((record) => record.region !== "").length,
      });
    }
    for (const runtime of runtimes)
      for (const family of [4, 6]) {
        const candidates = ["current-raw", "current-standard"];
        if (baseline) candidates.push("baseline-raw", "baseline-standard");
        for (const candidate of candidates) report.cases.push({ runtime, family, candidate, runs: [] });
        for (let repetition = 0; repetition < repetitions; repetition++) {
          const order = [
            ...candidates.slice(repetition % candidates.length),
            ...candidates.slice(0, repetition % candidates.length),
          ];
          for (const candidate of order) {
            const job = {
              candidate,
              family,
              baseline,
              samples,
              warmup,
              corpus: corpora.get(family),
              path: join(root, `data/ip2region_v${family}.xdb`),
            };
            const filename = join(temporary, "job.json");
            writeFileSync(filename, JSON.stringify(job));
            const output = execFileSync(
              commands[runtime][0],
              [...commands[runtime].slice(1), fileURLToPath(import.meta.url), `--worker=${filename}`],
              {
                cwd: root,
                encoding: "utf8",
                timeout: 60000,
                maxBuffer: 4 * 1024 * 1024,
              }
            );
            const result = JSON.parse(output);
            assert.equal(result.runtime, runtime);
            assert.equal(result.family, family);
            assert.equal(result.candidate, candidate);
            if (report.versions.runtimes[runtime]) assert.equal(result.version, report.versions.runtimes[runtime]);
            else report.versions.runtimes[runtime] = result.version;
            report.cases
              .find((item) => item.runtime === runtime && item.family === family && item.candidate === candidate)
              .runs.push(result);
          }
          process.stderr.write(`${runtime} IPv${family}: repetition ${repetition + 1}/${repetitions} complete\n`);
        }
      }
    if (values.output) writeFileSync(resolve(values.output), JSON.stringify(report, null, 2) + "\n");
    else console.log(JSON.stringify(report, null, 2));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (values.worker) console.log(JSON.stringify(await worker(JSON.parse(readFileSync(values.worker, "utf8")))));
else await coordinator();
