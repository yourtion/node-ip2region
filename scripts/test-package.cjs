// Exercise the actual npm tarball from an isolated consumer, without network access.
const assert = require("assert");
const { execFileSync } = require("child_process");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("fs");
const { tmpdir } = require("os");
const { join, resolve } = require("path");

const root = resolve(__dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "ip2region-package-"));
const npm = process.env.npm_execpath;
assert(npm, "Run this check with npm run test:package");
const run = (args, cwd = temporary) =>
  execFileSync(process.execPath, args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, npm_config_cache: join(temporary, "npm-cache") },
  });
try {
  const packed = JSON.parse(run([npm, "pack", root, "--json", "--ignore-scripts"]));
  const files = packed[0].files.map((file) => file.path);
  for (const path of [
    "esm/index.mjs",
    "esm/index.d.mts",
    "dist/lib/index.js",
    "dist/lib/index.d.ts",
    "data/ip2region.db",
    "data/ipv6wry.db",
  ]) {
    assert(files.includes(path), `Missing packed file: ${path}`);
  }
  writeFileSync(join(temporary, "package.json"), '{"private":true}');
  run([
    npm,
    "install",
    "--offline",
    "--ignore-scripts",
    "--legacy-peer-deps",
    "--no-audit",
    "--no-fund",
    join(temporary, packed[0].filename),
  ]);
  const lookup = `
    assert.deepStrictEqual(query.search('120.24.78.68'), {
      country: '中国', province: '广东省', city: '深圳市', isp: '阿里云'
    });
    assert(query.search('240e:47d:c20:1627:30a3:ba0d:a5e6:ec19'));
    assert.strictEqual(query.search('invalid'), null);
  `;
  writeFileSync(
    join(temporary, "consumer.cjs"),
    `
    const assert = require('assert');
    const IP2Region = require('ip2region').default;
    const query = new IP2Region();
    assert.strictEqual(IP2Region, require('ip2region/dist/lib/index').default);
    assert.strictEqual(IP2Region, require('ip2region/dist/lib/index.js').default);
    assert.strictEqual(IP2Region, require('ip2region/dist/lib').default);
    assert(require.resolve('ip2region/dist/lib/index.d.ts'));
    assert(require.resolve('ip2region/dist/lib/index.js.map'));
    assert(require.resolve('ip2region/data/ip2region.db'));
    assert.strictEqual(require('ip2region/package.json').name, 'ip2region');
    ${lookup}
  `
  );
  writeFileSync(
    join(temporary, "consumer.mjs"),
    `
    import assert from 'assert';
    import IP2Region from 'ip2region';
    import { createRequire } from 'module';
    const require = createRequire(import.meta.url);
    assert.strictEqual(IP2Region, require('ip2region').default);
    assert.strictEqual((await import('ip2region')).default, IP2Region);
    assert.strictEqual(IP2Region.default, IP2Region);
    assert(new IP2Region.default() instanceof IP2Region);
    const query = new IP2Region();
    ${lookup}
  `
  );
  run(["consumer.cjs"]);
  run(["consumer.mjs"]);
  console.log("Packed CommonJS, native ESM, dynamic import, deep imports and bundled databases: passed");

  // Check both value and instance types, named interfaces, and emitted runtime imports.
  const source = `
    import IP2Region, { IP2RegionOpts, IP2RegionResult } from 'ip2region';
    const options: IP2RegionOpts = { disableIpv6: true };
    const query: IP2Region = new IP2Region(options);
    const result: IP2RegionResult | null = query.search('120.24.78.68');
    if (!result || result.isp !== '阿里云') throw new Error('typed consumer lookup failed');
    // @ts-expect-error options must retain their declared types
    new IP2Region({ disableIpv6: 'yes' });
  `;
  const compiler = require.resolve("typescript/bin/tsc");
  const common = [
    "--strict",
    "--target",
    "ES2020",
    "--types",
    "node",
    "--typeRoots",
    join(root, "node_modules/@types"),
  ];
  for (const mode of ["Node16", "NodeNext", "commonjs", "bundler"]) {
    const dir = join(temporary, mode);
    mkdirSync(dir);
    const extensions = mode === "Node16" || mode === "NodeNext" ? ["mts", "cts"] : ["ts"];
    for (const extension of extensions) {
      const file = join(dir, `consumer.${extension}`);
      writeFileSync(file, source + (extension === "mts" ? "\nnew IP2Region.default(options);\n" : ""));
      const module = mode === "bundler" ? "ESNext" : mode;
      const resolution = mode === "commonjs" ? "node" : mode;
      run([compiler, file, ...common, "--module", module, "--moduleResolution", resolution, "--esModuleInterop"]);
      if (mode !== "bundler") {
        run([join(dir, `consumer.${extension === "mts" ? "mjs" : extension === "cts" ? "cjs" : "js"}`)]);
      }
    }
    console.log(`Packed TypeScript ${mode} consumer: passed`);
  }
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
