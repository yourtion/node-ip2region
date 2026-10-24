# Development

Use Node >=22.12.0 and pnpm 9.15.9 (the version pinned in `package.json`).
Install without dependency lifecycle scripts:

```sh
pnpm install --frozen-lockfile --ignore-scripts
npm run check
npm run test:package
```

`check` runs oxlint with zero warnings, oxfmt in check mode and TypeScript without
emitting files, including the JSDoc-typed custom adapter examples.
`npm run lint:fix` applies lint fixes; `npm run format` formats the repository. Generated output, lockfiles and the verbatim upstream license are
excluded from formatting. CI and release validation enforce the same checks.

`npm test` builds ESM/CJS and runs Node core, independent-reference and release
helper tests, including the shared custom adapter examples. `test:package`
additionally packs the library and exercises isolated consumers, declarations, exports, permission failures and bundled data hashes.
To validate all native consumers, install Bun and Deno and run:

```sh
IP2REGION_BUN=bun IP2REGION_DENO=deno npm run test:package
```

Without those variables, the package test runs Node consumers only. Set
`IP2REGION_NODE=/path/to/node` to test another Node consumer version; the build
still uses the Node running npm. A configured but missing runtime fails the test.
`npm run test:packed -- /path/to/package.tgz` checks an existing archive without
repacking. Test fixtures are injected into the temporary consumer and are not
included in the published package.

CI covers Node 22.12.0 and 24 on Linux, macOS and Windows, plus minimum and current
Bun/Deno on Linux. It checks code quality, correctness and package compatibility.
Run benchmarks locally when changing performance-sensitive code, comparing the
base and proposed revisions on the same host with identical runtime and data.

- [Architecture](architecture.md): core, readers and loaders.
- [Validation results](validation.md): checks performed and their limits.
- [Performance](performance.md): commands, workload and measurements.
- [Releasing](releasing.md): trusted publishing and exact-tarball validation.

`npm run test:examples` builds and runs only the public custom adapter examples.
The same suite runs inside the Node/Bun/Deno tarball consumers, from the examples
shipped in the package. See [the adapter contract](adapters.md) and
[examples/custom](../examples/custom/) for the reusable test registration helpers.

`npm run benchmark:matrix` records this repository's XDB reader across a
deterministic corpus, with optional built revisions as a baseline. It validates
every result before measuring and writes JSON; see
[the workload and commands](performance.md#repository-xdb-measurements).
