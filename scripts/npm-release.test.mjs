import assert from "node:assert/strict";
import { test } from "node:test";
import { completeRelease, isPublished, publish, releaseInfo, validatePack } from "./npm-release.mjs";

const manifest = {
  name: "@example/library",
  version: "1.2.3",
  main: "./src/index.tsx",
  types: "./src/index.tsx",
  exports: {
    ".": { import: "./src/index.tsx" },
    "./styles": "./dist/styles.css",
  },
};
const info = releaseInfo("v1.2.3", manifest);
const ok = (value) => ({ status: 0, stdout: value, stderr: "" });
const failure = (code) => ({
  status: 1,
  stdout: JSON.stringify({ error: { code } }),
  stderr: code,
});

test("stable and prerelease tags choose distinct npm channels", () => {
  assert.equal(info.distTag, "latest");
  for (const version of ["1.2.3-beta.1", "1.2.3-0", "1.2.3-1alpha"]) {
    const pre = releaseInfo(`v${version}`, { ...manifest, version });
    assert.equal(pre.distTag, "next");
    assert.equal(pre.prerelease, true);
  }
});

test("reject malformed, mismatched and non-publishable releases", () => {
  for (const tag of [undefined, "1.2.3", "v1.2", "v01.2.3", "v1.2.4", "v1.2.3+build", "v1.2.3-01"]) {
    assert.throws(() => releaseInfo(tag, manifest));
  }
  assert.throws(() => releaseInfo(info.tag, { ...manifest, private: true }));
  assert.throws(() => releaseInfo(info.tag, { ...manifest, name: "--bad" }));
});

test("pack checks nested exports, types and generated CSS without changing source exports", () => {
  const pack = {
    name: manifest.name,
    version: manifest.version,
    filename: "example-library-1.2.3.tgz",
    files: ["package.json", "src/index.tsx", "dist/styles.css"].map((path) => ({
      path,
    })),
  };
  validatePack(pack, manifest);
  assert.throws(() => validatePack({ ...pack, files: pack.files.slice(0, 2) }, manifest), /styles.css/);
  assert.throws(() => validatePack({ ...pack, version: "9.0.0" }, manifest), /name\/version/);
  assert.throws(() => validatePack({ ...pack, filename: "../other.tgz" }, manifest));
  assert.throws(() => validatePack(pack, { ...manifest, types: "./missing.d.ts" }), /missing.d.ts/);
  assert.throws(() => validatePack(pack, { ...manifest, module: "./missing.mjs" }), /missing.mjs/);
  assert.throws(() => validatePack(pack, { ...manifest, bin: { cli: "./missing.js" } }), /missing.js/);
  assert.throws(() => validatePack(pack, { ...manifest, exports: "./dist/*.js" }), /wildcard/);
});

test("only exact version or structured E404 establish registry state", () => {
  assert.equal(
    isPublished(info, () => ok(JSON.stringify(info.version))),
    true
  );
  assert.equal(
    isPublished(info, () => failure("E404")),
    false
  );
  for (const code of ["E401", "E403", "E429", "E500", "ENOTFOUND", "ECONNRESET"]) {
    assert.throws(() => isPublished(info, () => failure(code)), new RegExp(code));
  }
  assert.throws(() => isPublished(info, () => ok("not json")), /Invalid/);
  assert.throws(() => isPublished(info, () => ok('"1.2.4"')), /Unexpected/);
  assert.throws(() => isPublished(info, () => ({ error: new Error("spawn failed") })), /spawn failed/);
});

test("reruns skip published npm versions", () => {
  const calls = [];
  publish(info, "/tmp/validated.tgz", (command, args) => {
    calls.push([command, args]);
    return ok(JSON.stringify(info.version));
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1][0], "view");
});

test("publish the exact validated tarball with explicit channel and no lifecycle rebuild", () => {
  for (const version of ["1.2.3", "1.2.3-rc.0"]) {
    const release = releaseInfo(`v${version}`, { ...manifest, version });
    const calls = [];
    publish(release, "/tmp/validated.tgz", (command, args) => {
      calls.push([command, args]);
      return args[0] === "view" ? failure("E404") : ok("published");
    });
    assert.deepEqual(calls[1], [
      "npm",
      ["publish", "/tmp/validated.tgz", "--access", "public", "--tag", release.distTag, "--ignore-scripts"],
    ]);
  }
});

test("registry and publish failures stop completion", () => {
  const calls = [];
  assert.throws(
    () =>
      publish(info, "/tmp/validated.tgz", (command, args) => {
        calls.push([command, args]);
        return failure("E401");
      }),
    /E401/
  );
  assert.equal(calls.length, 1);
  assert.throws(
    () => publish(info, "/tmp/validated.tgz", (_, args) => failure(args[0] === "view" ? "E404" : "E403")),
    /E403/
  );
});

test("GitHub list errors abort instead of being treated as a missing release", () => {
  const calls = [];
  assert.throws(
    () =>
      completeRelease(info, "owner/repo", (command, args) => {
        calls.push([command, args]);
        return { status: 1, stderr: "network failure" };
      }),
    /network failure/
  );
  assert.equal(calls.length, 1);
  assert.throws(() => completeRelease(info, undefined), /GITHUB_REPOSITORY/);
});

test("create or complete GitHub release with the matching prerelease state", () => {
  for (const version of ["1.2.3", "1.2.3-rc.0"]) {
    const release = releaseInfo(`v${version}`, { ...manifest, version });
    for (const existing of [false, true]) {
      const calls = [];
      completeRelease(release, "owner/repo", (command, args) => {
        calls.push([command, args]);
        return ok(args[0] === "api" ? (existing ? `${release.tag}\n` : "v0.1.0\n") : "done");
      });
      assert.ok(calls[0][1].includes("--paginate"));
      assert.deepEqual(calls[1][1].slice(-2), ["--repo", "owner/repo"]);
      assert.equal(calls[1][1][1], existing ? "edit" : "create");
      assert.ok(calls[1][1].includes(existing ? `--prerelease=${release.prerelease}` : "--verify-tag"));
      if (!existing) assert.equal(calls[1][1].includes("--prerelease"), release.prerelease);
    }
  }
});

test("first publication followed by GitHub failure can resume without republishing npm", () => {
  let published = false;
  let failGithub = true;
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args[0], args[1]]);
    if (command === "npm" && args[0] === "view") return published ? ok(JSON.stringify(info.version)) : failure("E404");
    if (command === "npm" && args[0] === "publish") {
      published = true;
      return ok("published");
    }
    if (command === "gh" && args[0] === "api") return ok("");
    if (command === "gh" && args[0] === "release")
      return failGithub ? { status: 1, stderr: "GitHub unavailable" } : ok("created");
    throw new Error("Unexpected command");
  };
  const attempt = () => {
    publish(info, "/tmp/validated.tgz", run);
    completeRelease(info, "owner/repo", run);
  };
  assert.throws(attempt, /GitHub unavailable/);
  failGithub = false;
  attempt();
  assert.equal(calls.filter(([command, verb]) => command === "npm" && verb === "publish").length, 1);
  assert.equal(calls.filter(([command, verb]) => command === "gh" && verb === "release").length, 2);
  assert.deepEqual(
    calls.slice(0, 4).map(([command, verb]) => `${command} ${verb}`),
    ["npm view", "npm publish", "gh api", "gh release"]
  );
});

test("failed npm publication never reaches GitHub completion", () => {
  const calls = [];
  const run = (command, args) => {
    calls.push(command);
    return failure(args[0] === "view" ? "E404" : "E403");
  };
  assert.throws(() => {
    publish(info, "/tmp/validated.tgz", run);
    completeRelease(info, "owner/repo", run);
  }, /E403/);
  assert.deepEqual(calls, ["npm", "npm"]);
});
