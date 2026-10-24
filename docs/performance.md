# Performance

## Reproduce

```sh
pnpm install --frozen-lockfile --ignore-scripts
npm run benchmark
npm run benchmark:bun
npm run benchmark:deno

# Load only the selected bundled file (available for all three commands).
npm run benchmark -- --families=4
npm run benchmark:bun -- --families=6
npm run benchmark:deno -- --families=4

# Explicit local files; XDB uses raw-record mode unless loaded as bundled data.
npm run benchmark -- xdb /path/to/file.xdb
npm run benchmark:bun -- bin /path/to/file.BIN
npm run benchmark:deno -- ipip /path/to/file.ipdb
```

Each command builds with Node and then measures the named runtime with its native
file loader: `node:fs/promises`, `Bun.file` or `Deno.readFile`. After `npm run build`,
you can invoke `scripts/benchmark.mjs` directly to collect JSON without npm/build
output. Node needs `--expose-gc`; Deno needs `--allow-read --allow-sys
--v8-flags=--expose-gc`; Bun requests collection through `Bun.gc(true)`.
`--families=4`, `6` or `4,6` selects bundled files only. Custom files declare their
own supported families. No data is downloaded.

The JSON includes runtime/version, loader, host, file hashes/sizes, selected
families, GC availability, loading duration, memory deltas, latency and throughput.
Deno does not expose an array-buffer memory counter, so that value is `null`.

## Repository XDB measurements

`npm run benchmark:matrix` measures only this repository's XDB reader in raw and
standard-record modes. It uses 4,096 deterministic range-boundary addresses per
family, checks expected records decoded directly from the XDB index, warms up
20,000 queries, then measures 10,000 individual latencies and 100,000 queries for
throughput. Each case runs in five sequential fresh processes.

### IP parsing optimization, 2026-10-24

CPU sampling of standard-record queries identified IPv4 splitting, mapping,
canonical string reconstruction and per-byte BigInt assembly as recurring costs.
The parser now scans IPv4 decimal characters into its byte array, reuses the
validated canonical input and assembles address integers in unsigned 32-bit
groups. IPv6 parsing also benefits from the grouped integer conversion. Strict
literal rules, canonical IPv6 spelling and complete 128-bit values are preserved.

The comparison uses a separately built main revision
`9bd36dbeedeffd50c92613a0184d4a4feb266f66` as the baseline, and the optimized
working tree identified by source/compiled hashes in the
[raw report](benchmarks/2026-10-24-ip-parsing.json). Both sides run on the same
Linux x64 host, with the same files, 4,096-address corpus and mapping mode.
Each case uses 20,000 warm-up queries, 10,000 latency samples and **500,000**
throughput queries in each of five fresh processes. All 120 workers verified
every corpus result and their timed output checksum. No other library is measured.

Standard-record throughput, median queries per second:

| Runtime      | Family | Baseline | Optimized | Change |
| ------------ | ------ | -------: | --------: | -----: |
| Node 24.19.0 | IPv4   |  259,123 |   479,727 | +85.1% |
| Node 24.19.0 | IPv6   |  150,312 |   174,450 | +16.1% |
| Bun 1.4.4    | IPv4   |  379,940 |   699,925 | +84.2% |
| Bun 1.4.4    | IPv6   |  190,258 |   237,225 | +24.7% |
| Deno 2.9.6   | IPv4   |  190,732 |   333,727 | +75.0% |
| Deno 2.9.6   | IPv6   |  132,689 |   150,633 | +13.5% |

Raw-record throughput, median queries per second:

| Runtime      | Family | Baseline | Optimized |  Change |
| ------------ | ------ | -------: | --------: | ------: |
| Node 24.19.0 | IPv4   |  398,092 | 1,227,909 | +208.4% |
| Node 24.19.0 | IPv6   |  187,936 |   230,565 |  +22.7% |
| Bun 1.4.4    | IPv4   |  524,384 | 1,257,716 | +139.8% |
| Bun 1.4.4    | IPv6   |  197,847 |   283,087 |  +43.1% |
| Deno 2.9.6   | IPv4   |  297,754 |   584,739 |  +96.4% |
| Deno 2.9.6   | IPv6   |  164,064 |   184,749 |  +12.6% |

These are observed medians, not production guarantees. In particular, some IPv6
run ranges overlap. The report retains every run and latency percentile;
loading and memory remain measured but are not optimization claims for this change.
The earlier 100,000-query baseline below is a separate run and is not the
denominator for these percentages.

To reproduce, build that baseline in a separate checkout, then run:

```sh
IP2REGION_BUN=bun IP2REGION_DENO=deno npm run benchmark:matrix -- \
  --baseline=/path/to/built-9bd36db --runtimes=node,bun,deno \
  --samples=500000 --output=/tmp/ip2region-ip-parsing.json
```

### Baseline before parsing optimization, 2026-10-24

Linux x64; Intel Xeon Platinum 8573C; five visible logical CPUs. These are the
constructor API's results before query-performance changes were applied.
Each cell is the median of five processes. Loading and RSS columns are from the
standard-record cases. The [raw report](benchmarks/2026-10-24.json) retains all
60 runs, including per-run latency percentiles and the measured source hashes.

| Runtime      | Family | Raw queries/s | Standard queries/s | Load ms | RSS delta MiB |
| ------------ | ------ | ------------: | -----------------: | ------: | ------------: |
| Node 24.19.0 | IPv4   |       434,499 |            284,949 |   70.48 |         17.15 |
| Node 24.19.0 | IPv6   |       184,334 |            159,182 |   99.01 |         41.96 |
| Bun 1.4.4    | IPv4   |       520,266 |            381,143 |   78.68 |         24.78 |
| Bun 1.4.4    | IPv6   |       210,987 |            179,326 |  111.57 |         48.57 |
| Deno 2.9.6   | IPv4   |       298,565 |            203,181 |   71.09 |         16.62 |
| Deno 2.9.6   | IPv6   |       162,207 |            132,405 |  131.23 |         41.46 |

Raw mode extracts `extensions.region` without column mapping. Standard mode
also builds country, subdivision, city, ISP and raw-field extensions. All 4,096
addresses per family returned records and matched the directly decoded segment
contents in every worker. No other library's performance data is included.

### Reproduce the matrix

```sh
npm run benchmark:matrix -- --output=/tmp/ip2region-matrix.json
IP2REGION_BUN=bun IP2REGION_DENO=deno npm run benchmark:matrix -- \
  --runtimes=node,bun,deno --output=/tmp/ip2region-matrix.json

# Optional independently built revision of this repository, with src and dist/esm.
npm run benchmark:matrix -- --baseline=/path/to/built-revision \
  --runtimes=node,bun,deno --output=/tmp/ip2region-matrix.json
```

The matrix aligns file I/O through `node:fs.readFileSync` and excludes imports
and corpus setup from loading. It records runtime/host versions, data and corpus
hashes, source and compiled hashes, loading, memory deltas, latency percentiles
and throughput. Baseline and current cases rotate order between repetitions.
Every case checks the complete corpus and the timed output checksum. Defaults
can be overridden with `--repetitions`, `--size`, `--warmup` and `--samples`.

The selected range boundaries are not a production traffic distribution.
Results describe sequential queries on this host; OS page cache, scheduling
and cross-engine memory accounting are uncontrolled. RSS after requested GC is
not peak memory. BIN/IPDB synthetic fixtures validate correctness and execution;
no full-size BIN/IPDB performance result is recorded.

## Historical native-loader measurements, 2026-10-23

These historical observations precede the constructor API. The commands above
use the current API; this table has not been rerun as a before/after comparison.

Linux x64; INTEL(R) XEON(R) PLATINUM 8573C; 5 visible logical CPUs; 18,882,674,688 bytes reported host memory. Each case ran in three fresh, sequential processes; the tables show the median of each measurement.

Data is pinned to the hashes in [data provenance](../data/README.md): IPv4
11,122,642 bytes, IPv6 37,277,813 bytes, combined 48,400,455 bytes.
The complete host, inputs and all 54 runs are saved in
[the JSON report](benchmarks/2026-10-23.json).

### Dual-stack

| Runtime      | Load ms | RSS delta MiB | p50 µs | p95 µs | p99 µs | Queries/s |
| ------------ | ------: | ------------: | -----: | -----: | -----: | --------: |
| Node 22.12.0 |  255.01 |         93.17 |   4.24 |   9.29 |  67.16 |   194,819 |
| Node 24.19.0 |  272.99 |         90.21 |   2.98 |   6.08 |  35.66 |   241,521 |
| Bun 1.2.0    |  466.12 |        110.67 |   5.53 |  11.74 |  44.97 |   181,178 |
| Bun 1.4.4    |  201.32 |         59.11 |   3.22 |   7.22 |  28.04 |   290,304 |
| Deno 2.0.0   |  196.74 |         97.85 |   3.71 |   6.58 |  38.26 |   199,511 |
| Deno 2.9.6   |  216.10 |         91.18 |   4.32 |   9.42 |  75.35 |   179,068 |

### Single-family

| Runtime      | Family | Load ms | RSS delta MiB | p50 µs | Queries/s |
| ------------ | ------ | ------: | ------------: | -----: | --------: |
| Node 22.12.0 | IPv4   |   71.08 |         27.97 |   2.68 |   266,930 |
| Node 22.12.0 | IPv6   |  224.90 |         78.29 |   5.06 |   176,959 |
| Node 24.19.0 | IPv4   |   74.43 |         24.41 |   2.72 |   322,089 |
| Node 24.19.0 | IPv6   |  136.03 |         75.21 |   4.36 |   166,821 |
| Bun 1.2.0    | IPv4   |  161.24 |         35.52 |   4.00 |   309,353 |
| Bun 1.2.0    | IPv6   |  249.75 |         84.64 |   7.80 |   151,237 |
| Bun 1.4.4    | IPv4   |   79.59 |         24.93 |   2.24 |   422,472 |
| Bun 1.4.4    | IPv6   |  122.14 |         49.28 |   3.79 |   194,797 |
| Deno 2.0.0   | IPv4   |   72.36 |         34.19 |   3.24 |   228,187 |
| Deno 2.0.0   | IPv6   |  109.51 |         83.32 |   5.25 |   138,894 |
| Deno 2.9.6   | IPv4   |   91.80 |         27.53 |   3.42 |   235,854 |
| Deno 2.9.6   | IPv6   |  138.14 |         77.37 |   5.07 |   126,194 |

Single-family loading reads only that file. The table quantifies its lower
loading cost on this host; it does not establish a universal memory budget or
rank runtimes for production workloads.

### Historical workload and limits

- IPv4 inputs: `120.24.78.68`, `8.8.8.8`, `1.1.1.1`, `192.0.2.1`, `0.0.0.0`,
  `255.255.255.255`. IPv6 inputs: `2001:4860:4860::8888`,
  `2606:4700:4700::1111`, `2001:db8::1`, `2001:db8::2`. Each case cycles through
  only its selected families; this small mix includes reserved ranges.
- 1,000 warm-up lookups, 10,000 individually timed lookups, then a separately
  timed loop of 100,000 lookups for throughput. Latency includes parsing, result
  allocation and clock overhead; throughput avoids per-lookup timing overhead.
- Loading includes file I/O, copying and index validation, excluding module import
  and requested GC. Memory deltas are sampled before loading and after requested
  GC. The OS page cache and host scheduling are uncontrolled.
- All measured bundled lookups returned records, including records without
  geographic fields. The runner checked runtime/loader identity, selected
  families, hashes, sample/hit counts and finite positive timings. This measures
  coverage and execution, not geographic accuracy.

Memory counters have different accounting across engines, and external-buffer
reclamation can lag. RSS includes allocator and runtime behavior. The current
workload differs from the earlier six-address Node-only baseline, so its latency
numbers are not a direct regression comparison. Compare changes using identical
files, inputs, mapping mode, runtime, host and cache conditions.

Benchmarks run manually. For performance changes, measure the base and proposed
revisions on the same host with identical runtimes, inputs and data. The recorded
measurements describe this environment and do not establish a regression check.
No real BIN/IPDB performance claim is made without a fixed, licensed input;
synthetic fixtures validate those readers and benchmark execution only.
