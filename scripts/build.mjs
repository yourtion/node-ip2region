import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
rmSync(join(root, "dist"), { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"], {
  cwd: root,
  stdio: "inherit",
});

function copy(relative = "") {
  for (const entry of readdirSync(join(root, "dist/esm", relative), { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) {
      copy(path);
      continue;
    }
    if (/^loaders[\\/](bun|deno)\./.test(path)) continue;
    const destination = join(root, "dist/cjs", path);
    mkdirSync(resolve(destination, ".."), { recursive: true });
    let content = readFileSync(join(root, "dist/esm", path), "utf8");
    if (entry.name.endsWith(".js")) {
      content = ts.transpileModule(
        content.replaceAll("import.meta.url", 'require("node:url").pathToFileURL(__filename).href'),
        {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }
      ).outputText;
    }
    writeFileSync(destination, content);
  }
}
copy();
writeFileSync(join(root, "dist/cjs/package.json"), '{"type":"commonjs"}\n');
