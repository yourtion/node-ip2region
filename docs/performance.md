# Performance baseline

Run `npm run benchmark` for both bundled XDB snapshots, or
`npm run benchmark -- xdb /path/to/file.xdb` /
`npm run benchmark -- bin /path/to/file.BIN` /
`npm run benchmark -- ipip /path/to/file.ipdb` for an explicitly supplied file.
The tool reports file hash/size, runtime/host, loading duration, memory counters,
and p50/p95/p99 query latency. No database is downloaded.

## Initial observation, 2026-10-23

- Linux x64 cloud worker; Node v24.19.0; AMD EPYC 9V74 CPU; 5 visible logical
  CPUs and 18,882,674,688 bytes of reported host memory.
- Bundled IPv4 and IPv6 XDB data: 48,400,455 bytes combined; individual
  fixed SHA-256 values and build dates are recorded in [data provenance](../data/README.md).
- 1,000 warm-up lookups, then 10,000 individually timed lookups cycling through
  `120.24.78.68`, `192.0.2.1`, `0.0.0.0`, `255.255.255.255`,
  `2001:db8::1`, `2001:db8::2`. This small workload includes reserved ranges;
  it does not represent the distribution of production traffic.
- Explicit GC requested before/after loading; OS page cache uncontrolled.

| Measurement                     |   Observed value |
| ------------------------------- | ---------------: |
| Load, copy and index validation |        120.99 ms |
| RSS delta                       | 96,317,440 bytes |
| Heap-used delta                 |     72,360 bytes |
| External-memory delta           | 86,726,848 bytes |
| Array-buffer delta              | 49,449,031 bytes |
| Query p50                       |          2.41 µs |
| Query p95                       |          4.75 µs |
| Query p99                       |         17.55 µs |

These are one environment's baseline observations, not universal performance
guarantees or thresholds for shared CI workers. Memory counters include loading
buffers and runtime GC bookkeeping; external-memory reclamation can lag.
Latency includes parsing, result allocation and clock overhead. Compare changes
using the same file hash, inputs, runtime, host and cache conditions.

All 10,000 inputs returned records in this run. That is a coverage observation,
not a location-accuracy measurement. Correct/incorrect/unknown locations require
separate traceable reference samples. Passing parser tests, agreement with a
reference reader, record completeness and agreement between databases do not
establish geographic accuracy.

No real BIN/IPDB performance baseline is claimed without a fixed, licensed
input file. Synthetic fixtures are used for reader correctness only. Caching,
random-access disk queries, hot reload and multi-source fallback remain outside
the core until measurements justify them.
