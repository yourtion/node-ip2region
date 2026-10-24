import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
// macOS /var and Windows short-name temp paths can differ from their real paths.
// Permission grants must name the same canonical paths used by the module loader.
const directory = mkdtempSync(join(realpathSync(tmpdir()), "ip2region-package-"));
const consumer = join(directory, "consumer");
const installed = join(consumer, "node_modules/ip2region");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const node = process.env.IP2REGION_NODE ?? process.execPath;
function run(binary, args, cwd = consumer, extraEnv = {}) {
  try {
    return execFileSync(binary, args, { cwd, encoding: "utf8", env: { ...process.env, ...extraEnv }, stdio: "pipe" });
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

try {
  if (process.argv.length > 3) throw new Error("Expected at most one existing tarball path");
  let archive;
  if (process.argv[2]) {
    archive = resolve(process.argv[2]);
    if (!archive.endsWith(".tgz")) throw new Error("Expected a .tgz tarball");
  } else {
    if (!process.env.npm_execpath) throw new Error("Run this check through npm run test:package or pnpm test:package");
    run(process.execPath, [process.env.npm_execpath, "pack", "--pack-destination", directory], root, {
      npm_config_ignore_scripts: "true",
      npm_config_cache: join(directory, "npm-cache"),
    });
    const filename = readdirSync(directory).find((name) => name.endsWith(".tgz"));
    if (!filename) throw new Error("The package manager did not produce a tarball");
    archive = join(directory, filename);
  }
  const archiveDigest = createHash("sha256").update(readFileSync(archive)).digest("hex");
  mkdirSync(installed, { recursive: true });
  run("tar", ["-xzf", archive, "--strip-components=1", "-C", installed], root);
  const packedManifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  if (packedManifest.name !== manifest.name || packedManifest.version !== manifest.version)
    throw new Error("Tarball name/version does not match this checkout");
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module", dependencies: { ip2region: manifest.version } })
  );

  const files = run("tar", ["-tzf", archive], root).split(/\r?\n/);
  const allowedFiles =
    /^package\/(?:dist\/|docs\/|examples\/custom\/|data\/(?:README\.md|LICENSE\.ip2region\.md|ip2region_v[46]\.xdb)$|(?:package\.json|README\.md|LICENSE|CHANGELOG\.md)$)/;
  if (files.some((file) => file && !allowedFiles.test(file)))
    throw new Error("Tarball contains files outside the distribution allowlist");
  for (const [name, expected] of [
    ["ip2region_v4.xdb", "27ecba8c9a6d5e3b280aedbe7ee15c65372b179fbd0dad3845d8c608f2fcace1"],
    ["ip2region_v6.xdb", "939f6b46bd2b8bec3cf7c5ceb8ba782266ae9b1f35b5ba7916700dec0b7506ed"],
  ]) {
    const hash = createHash("sha256")
      .update(readFileSync(join(installed, "data", name)))
      .digest("hex");
    if (hash !== expected) throw new Error("Bundled XDB snapshot changed");
  }
  if (!files.includes("package/data/LICENSE.ip2region.md")) throw new Error("Upstream license missing");

  const esm = `import { IP2Region as MemoryIP2Region, AsyncIP2Region, IP2RegionError } from 'ip2region';
    import { IP2Region } from 'ip2region/node';
    import { createBIN } from 'ip2region/formats/ip2location-bin';
    import { createIPIP } from 'ip2region/formats/ipip-ipdb';
    import { createXDB, IP2REGION_FIELDS } from 'ip2region/formats/ip2region-xdb';
    import { binFixture, ipipFixture, xdbFixture } from './node_modules/ip2region/tests/fixtures.mjs';
    import { equal, throws } from './node_modules/ip2region/tests/assert.mjs';
    for (const [factory, fixture] of [[createBIN, binFixture], [createIPIP, ipipFixture], [(bytes) => createXDB(bytes, { fields: IP2REGION_FIELDS }), xdbFixture]]) {
      const query = new MemoryIP2Region({ source: factory(fixture()), ownership: 'owned' });
      equal(query.lookup('192.0.2.1').city.name, 'First'); query.close();
    }
    for (const query of [new IP2Region({ families: [4] }), await IP2Region.open({ families: [4] })]) {
      equal(query instanceof IP2Region, true);
      equal(query instanceof MemoryIP2Region, true);
      equal(query.lookup('120.24.78.68').city.name, '深圳市');
      equal(typeof query.lookupAsync, 'undefined'); query.close();
    }
    const external = new AsyncIP2Region({ source: async () => null });
    equal(typeof external.lookup, 'undefined'); equal(await external.lookupAsync('::1'), null); await external.closeAsync();
    equal(new IP2RegionError('CLOSED', 'closed').code, 'CLOSED');
    throws(() => new MemoryIP2Region({ source: () => null }).lookup('bad'), 'INVALID_IP');
    console.log('Packed ESM classes, sync construction and async opening passed');`;
  // Inject only the independent test harness; all library files come from the tarball.
  cpSync(join(root, "tests"), join(installed, "tests"), { recursive: true });
  writeFileSync(join(consumer, "consumer.mjs"), esm);
  writeFileSync(
    join(consumer, "consumer.cjs"),
    `const assert = require('node:assert/strict');
    const api = require('ip2region');
    assert.deepEqual(Object.keys(api).sort(), ['AsyncIP2Region', 'IP2Region', 'IP2RegionError', 'parseIP']);
    assert.deepEqual(new api.IP2Region({ source: () => ({}) }).lookup('::1'), {});
    assert(!Object.keys(require.cache).some(path => path.includes('ip2region') && /[\\\\/]formats[\\\\/]|[\\\\/]loaders[\\\\/]/.test(path)));
    assert.throws(() => require('ip2region/dist/esm/index.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    const { IP2Region } = require('ip2region/node');
    const query = new IP2Region({ families: [4] }); assert.equal(query.lookup('120.24.78.68').city.name, '深圳市'); query.close(); console.log('Packed CJS class exports passed');`
  );
  process.stdout.write(run(node, ["consumer.mjs"]));
  process.stdout.write(run(node, ["consumer.cjs"]));
  writeFileSync(
    join(consumer, "mixed.mjs"),
    `import { IP2Region } from 'ip2region'; import { createRequire } from 'node:module'; import { throws } from './node_modules/ip2region/tests/assert.mjs'; const { IP2RegionError } = createRequire(import.meta.url)('ip2region'); const error = new IP2RegionError('INVALID_DATABASE', 'corrupt record'); const caught = throws(() => new IP2Region({ source: () => { throw error; } }).lookup('::1'), 'INVALID_DATABASE'); if (caught !== error) throw new Error('Original cross-module error was lost');`
  );
  run(node, ["mixed.mjs"]);
  process.stdout.write(run(node, ["--test", join(installed, "tests/node.test.mjs")]));
  if (!files.includes("package/examples/custom/custom.test.mjs"))
    throw new Error("Runnable custom adapter examples missing");
  process.stdout.write(run(node, ["--test", join(installed, "examples/custom/custom.test.mjs")]));
  process.stdout.write(
    run(node, [
      run(node, [
        "-p",
        "process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission'",
      ]).trim(),
      `--allow-fs-read=${join(installed, "dist")}`,
      `--allow-fs-read=${join(installed, "tests")}`,
      `--allow-fs-read=${join(installed, "package.json")}`,
      join(installed, "tests/node-permissions.mjs"),
    ])
  );

  const typed = `import { IP2Region as MemoryIP2Region, AsyncIP2Region, type LookupResult, type Adapter, type AsyncAdapter } from 'ip2region';
    import { IP2Region } from 'ip2region/node';
    import { createIPIP } from 'ip2region/formats/ipip-ipdb';
    const query = new MemoryIP2Region<LookupResult>({ source: () => ({ country: { name: 'Example' } }) });
    const name: string | undefined = query.lookup('::1')?.country?.name;
    const raw = new MemoryIP2Region({ source: createIPIP(new Uint8Array()) });
    const record: string | undefined = raw.lookup('::1')?.extensions.raw.country_name;
    void name; void record;
    const adapter: Adapter = { lookup: () => null };
    const asyncAdapter: AsyncAdapter = { lookupAsync: async () => null, closeAsync: async () => {} };
    new MemoryIP2Region({ source: adapter });
    const remote = new AsyncIP2Region({ source: asyncAdapter });
    const promised: Promise<LookupResult | null> = remote.lookupAsync('::1'); void promised;
    const native: IP2Region = new IP2Region({ families: [4] }); void native;
    const loading: Promise<IP2Region> = IP2Region.open({ database: { format: 'ipip', path: '/data/custom.ipdb', language: 'EN' } }); void loading;
    // @ts-expect-error only IPv4 and IPv6 may be selected
    new IP2Region({ families: [5] });
    // @ts-expect-error custom bytes and path are mutually exclusive
    new IP2Region({ database: { format: 'bin', path: '/data/custom.bin', data: new Uint8Array() } });
    // @ts-expect-error source and database are mutually exclusive
    new IP2Region({ source: adapter, database: { format: 'bin', path: '/data/custom.bin' } });
    // @ts-expect-error language belongs to IPIP, not BIN
    new IP2Region({ database: { format: 'bin', path: '/data/custom.bin', language: 'EN' } });
    // @ts-expect-error async sources require the async class
    new MemoryIP2Region({ source: async () => null });
    // @ts-expect-error sync sources require the sync class
    new AsyncIP2Region({ source: () => null });
    // @ts-expect-error async adapters use explicit method names
    new AsyncIP2Region({ source: { lookup: async () => null } });
    // @ts-expect-error sync instances have no async query method
    query.lookupAsync('::1');
    // @ts-expect-error async instances have no sync query method
    remote.lookup('::1');
    // @ts-expect-error result fields retain their declared types
    const invalid: number = query.lookup('::1')?.country?.name; void invalid;`;
  for (const extension of ["mts", "cts"]) writeFileSync(join(consumer, `consumer.${extension}`), typed);
  const compiler = require.resolve("typescript/bin/tsc");
  const typecheckOptions = [
    "--noEmit",
    "--strict",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--types",
    "node",
    "--typeRoots",
    join(root, "node_modules/@types"),
  ];
  run(node, [compiler, ...typecheckOptions, "consumer.mts", "consumer.cts"]);
  run(node, [
    compiler,
    ...typecheckOptions,
    "--allowJs",
    "--checkJs",
    ...readdirSync(join(installed, "examples/custom"))
      .filter((name) => name.endsWith(".mjs"))
      .map((name) => join(installed, "examples/custom", name)),
  ]);
  console.log("Packed custom adapter examples pass their public declaration contracts");
  writeFileSync(
    join(consumer, "pure.mts"),
    `import { IP2Region } from 'ip2region'; import { createBIN } from 'ip2region/formats/ip2location-bin'; const db = new IP2Region({ source: createBIN(new Uint8Array()) }); const code: string | undefined = db.lookup('::1')?.country?.code; void code;`
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022"],
        types: [],
      },
      files: ["pure.mts"],
    })
  );
  run(node, [compiler, "-p", "tsconfig.json"]);
  console.log("Packed NodeNext ESM/CJS consumers and pure declarations without Node/DOM types passed");

  if (process.env.IP2REGION_BUN) {
    process.stdout.write(run(process.env.IP2REGION_BUN, ["test", join(installed, "tests/bun.test.mjs")]));
    writeFileSync(join(consumer, "bun-consumer.mjs"), esm.replaceAll("ip2region/node", "ip2region/bun"));
    process.stdout.write(run(process.env.IP2REGION_BUN, ["bun-consumer.mjs"]));
    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      const denied = join(consumer, "denied.db");
      writeFileSync(denied, new Uint8Array(1));
      chmodSync(denied, 0);
      writeFileSync(
        join(consumer, "bun-permissions.mjs"),
        `import { readBytes, readBytesSync, IP2Region } from 'ip2region/bun'; import { throws, rejects } from './node_modules/ip2region/tests/assert.mjs'; const path = new URL('./denied.db', import.meta.url); throws(() => readBytesSync(path), 'PERMISSION_DENIED'); throws(() => new IP2Region({ database: { format: 'bin', path } }), 'PERMISSION_DENIED'); await rejects(() => readBytes(path), 'PERMISSION_DENIED'); console.log('Bun native permission failure passed');`
      );
      try {
        process.stdout.write(run(process.env.IP2REGION_BUN, ["bun-permissions.mjs"]));
      } finally {
        chmodSync(denied, 0o600);
      }
    }
  }
  if (process.env.IP2REGION_DENO) {
    process.stdout.write(
      run(process.env.IP2REGION_DENO, ["test", "--no-check", "--allow-read", join(installed, "tests/deno.test.mjs")])
    );
    writeFileSync(join(consumer, "deno-consumer.mjs"), esm.replaceAll("ip2region/node", "ip2region/deno"));
    process.stdout.write(
      run(process.env.IP2REGION_DENO, [
        "run",
        "--no-prompt",
        "--cached-only",
        "--node-modules-dir=manual",
        "--allow-read",
        "deno-consumer.mjs",
      ])
    );
    process.stdout.write(
      run(process.env.IP2REGION_DENO, ["run", "--no-prompt", join(installed, "tests/deno-permissions.mjs")])
    );
  }
  if (createHash("sha256").update(readFileSync(archive)).digest("hex") !== archiveDigest)
    throw new Error("Release tarball changed during validation");
  console.log(`Validated tarball SHA-256: ${archiveDigest}`);
  console.log("Real tarball consumers passed; no runtime dependencies or vendor data downloads required");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
