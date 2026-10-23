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
  if (!process.env.npm_execpath) throw new Error("Run this check through npm run test:package or pnpm test:package");
  run(process.execPath, [process.env.npm_execpath, "pack", "--pack-destination", directory], root, {
    npm_config_ignore_scripts: "true",
    npm_config_cache: join(directory, "npm-cache"),
  });
  const archive = readdirSync(directory).find((name) => name.endsWith(".tgz"));
  if (!archive) throw new Error("The package manager did not produce a tarball");
  mkdirSync(installed, { recursive: true });
  run("tar", ["-xzf", join(directory, archive), "--strip-components=1", "-C", installed], root);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module", dependencies: { ip2region: manifest.version } })
  );

  const files = run("tar", ["-tzf", join(directory, archive)], root).split("\n");
  if (files.some((file) => /node_modules|ipv6wry|src\/|dist\/lib|install\.sh|update_db\.sh/.test(file)))
    throw new Error("Tarball contains obsolete or development files");
  const hash = createHash("sha256")
    .update(readFileSync(join(installed, "data/ip2region.db")))
    .digest("hex");
  if (hash !== "3a8baab4f2e536a1c4a9be683cc81d563b0d4f942b304202be6f0d4aecc7f5d4")
    throw new Error("Bundled snapshot changed");

  const esm = `import { createLookup, createAsyncLookup, IP2RegionError } from 'ip2region';
    import { openDefault, openDatabase } from 'ip2region/node';
    import { createBIN } from 'ip2region/formats/ip2location-bin';
    import { createIPIP } from 'ip2region/formats/ipip-ipdb';
    import { createIP2Region } from 'ip2region/formats/ip2region';
    import { binFixture, ipipFixture, legacyFixture } from './node_modules/ip2region/tests/fixtures.mjs';
    import { equal, throws } from './node_modules/ip2region/tests/assert.mjs';
    for (const [factory, fixture] of [[createBIN, binFixture], [createIPIP, ipipFixture], [createIP2Region, legacyFixture]]) {
      const query = createLookup(factory(fixture()), { ownership: 'owned' });
      equal(query.lookup('192.0.2.1').city.name, 'First'); query.close();
    }
    const defaults = await openDefault(); equal(defaults.lookup('120.24.78.68').city.name, '深圳市'); defaults.close();
    const external = createAsyncLookup(async () => null); equal(await external.lookup('::1'), null); await external.close();
    equal(typeof openDatabase, 'function');
    equal(new IP2RegionError('CLOSED', 'closed').code, 'CLOSED');
    throws(() => createLookup(() => null).lookup('bad'), 'INVALID_IP');
    console.log('Packed ESM exports and native default loading passed');`;
  // Inject only the independent test harness; all library files come from the tarball.
  cpSync(join(root, "tests"), join(installed, "tests"), { recursive: true });
  writeFileSync(join(consumer, "consumer.mjs"), esm);
  writeFileSync(
    join(consumer, "consumer.cjs"),
    `const assert = require('node:assert/strict');
    const api = require('ip2region');
    assert.equal(api.default, undefined); assert.equal(api.searchRaw, undefined);
    assert.deepEqual(api.createLookup(() => ({})).lookup('::1'), {});
    assert(!Object.keys(require.cache).some(path => path.includes('ip2region') && /[\\\\/]formats[\\\\/]|[\\\\/]loaders[\\\\/]/.test(path)));
    assert.throws(() => require('ip2region/dist/lib'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    const { openDefault } = require('ip2region/node');
    openDefault().then(query => { assert.equal(query.lookup('120.24.78.68').city.name, '深圳市'); query.close(); console.log('Packed CJS exports passed'); });`
  );
  process.stdout.write(run(node, ["consumer.mjs"]));
  process.stdout.write(run(node, ["consumer.cjs"]));
  writeFileSync(
    join(consumer, "mixed.mjs"),
    `import { createLookup } from 'ip2region'; import { createRequire } from 'node:module'; import { throws } from './node_modules/ip2region/tests/assert.mjs'; const { IP2RegionError } = createRequire(import.meta.url)('ip2region'); const error = new IP2RegionError('INVALID_DATABASE', 'corrupt record'); const caught = throws(() => createLookup(() => { throw error; }).lookup('::1'), 'INVALID_DATABASE'); if (caught !== error) throw new Error('Original cross-module error was lost');`
  );
  run(node, ["mixed.mjs"]);
  process.stdout.write(run(node, ["--test", join(installed, "tests/node.test.mjs")]));
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

  const typed = `import { createLookup, createAsyncLookup, type LookupResult } from 'ip2region';
    import { openDefault } from 'ip2region/node';
    import { createIPIP } from 'ip2region/formats/ipip-ipdb';
    const query = createLookup<LookupResult>(() => ({ country: { name: 'Example' } }));
    const name: string | undefined = query.lookup('::1')?.country?.name;
    const raw = createLookup(createIPIP(new Uint8Array()));
    const record: string | undefined = raw.lookup('::1')?.extensions.raw.country_name;
    void name; void record; void openDefault;
    createAsyncLookup(async () => null);
    // @ts-expect-error async sources require the asynchronous factory
    createLookup(async () => null);
    // @ts-expect-error sync sources require the synchronous factory
    createAsyncLookup(() => null);
    // @ts-expect-error removed obsolete public interface
    query.searchRaw('::1');`;
  for (const extension of ["mts", "cts"]) writeFileSync(join(consumer, `consumer.${extension}`), typed);
  const compiler = require.resolve("typescript/bin/tsc");
  run(node, [
    compiler,
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
    "consumer.mts",
    "consumer.cts",
  ]);
  writeFileSync(
    join(consumer, "pure.mts"),
    `import { createLookup } from 'ip2region'; import { createBIN } from 'ip2region/formats/ip2location-bin'; const db = createLookup(createBIN(new Uint8Array())); const code: string | undefined = db.lookup('::1')?.country?.code; void code;`
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
        `import { readBytes } from 'ip2region/bun'; import { rejects } from './node_modules/ip2region/tests/assert.mjs'; await rejects(() => readBytes(new URL('./denied.db', import.meta.url)), 'PERMISSION_DENIED'); console.log('Bun native permission failure passed');`
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
  console.log("Real tarball consumers passed; no runtime dependencies or vendor data downloads required");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
