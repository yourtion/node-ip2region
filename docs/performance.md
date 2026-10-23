# Performance baseline

Run `npm run benchmark` for the bundled snapshot, or
`npm run benchmark -- bin /path/to/file.BIN` /
`npm run benchmark -- ipip /path/to/file.ipdb` for an explicitly supplied file.
The tool reports file hash/size, runtime/host, loading duration, memory counters,
and p50/p95/p99 query latency. No database is downloaded.

## Initial observation, 2026-10-23

- Linux x64 cloud worker; Node v24.19.0; AMD EPYC 9V74 CPU; 5 visible logical
  CPUs and 18,882,674,688 bytes of reported host memory.
- Existing bundled legacy ip2region IPv4 data: 8,733,094 bytes;
  SHA-256 `3a8baab4f2e536a1c4a9be683cc81d563b0d4f942b304202be6f0d4aecc7f5d4`.
- 1,000 warm-up lookups, then 10,000 individually timed lookups cycling through
  `120.24.78.68`, `192.0.2.1`, `0.0.0.0`, `255.255.255.255`.
- Explicit GC requested before/after loading; OS page cache uncontrolled.

| Measurement                     |   Observed value |
| ------------------------------- | ---------------: |
| Load, copy and index validation |         26.10 ms |
| RSS delta                       | 23,310,336 bytes |
| Heap-used delta                 |     41,840 bytes |
| External-memory delta           | 17,466,192 bytes |
| Array-buffer delta              |  8,733,094 bytes |
| Query p50                       |          3.41 µs |
| Query p95                       |          5.83 µs |
| Query p99                       |         17.56 µs |

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
