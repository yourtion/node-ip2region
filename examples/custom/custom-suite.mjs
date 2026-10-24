import assert from "node:assert/strict";
import { IP2Region, AsyncIP2Region, IP2RegionError } from "ip2region";
import { MapReader, ServiceReader, JSONReader } from "./readers.mjs";
import { syncAdapterContract, asyncAdapterContract } from "./contracts.mjs";

const hit = "2001:db8::1";
const miss = "2001:db8::2";
const expected = { country: { name: "Example" }, city: { name: "Fixture" } };
const bytes = new TextEncoder().encode(JSON.stringify([{ ip: hit, country: "Example", city: "Fixture" }]));

/** @param {import('./contracts.mjs').RegisterTest} test */
export function customAdapterSuite(test) {
  const named =
    (/** @type {string} */ prefix) => (/** @type {string} */ name, /** @type {() => void | Promise<void>} */ run) =>
      test(`${prefix}: ${name}`, run);
  syncAdapterContract(named("custom function"), () => (ip) => (ip === hit ? expected : null), { hit, miss, expected });
  syncAdapterContract(named("custom class"), () => new MapReader([[hit, expected]]), { hit, miss, expected });
  syncAdapterContract(named("custom JSON format"), () => new JSONReader(bytes), { hit, miss, expected });
  asyncAdapterContract(named("async function"), () => async (ip) => (ip === hit ? expected : null), {
    hit,
    miss,
    expected,
  });
  asyncAdapterContract(
    named("async service class"),
    () => new ServiceReader(async (ip) => (ip === hit ? expected : null)),
    { hit, miss, expected }
  );

  test("custom sources receive canonical addresses and the full parsed context", async () => {
    /** @type {import('ip2region').ParsedIP[]} */
    const contexts = [];
    /** @type {import('ip2region').LookupFunction} */
    const source = (ip, parsed) => {
      contexts.push(parsed);
      return { extensions: { address: ip } };
    };
    const sync = new IP2Region({ source });
    const asyncQuery = new AsyncIP2Region({ source: async (ip, parsed) => source(ip, parsed) });
    try {
      assert.equal(sync.lookup("2001:0DB8:0:0:0:0:0:1")?.extensions?.address, hit);
      assert.equal((await asyncQuery.lookupAsync("2001:0DB8:0:0:0:0:0:1"))?.extensions?.address, hit);
      for (const parsed of contexts) {
        assert.equal(parsed.family, 6);
        assert.equal(parsed.value, 0x20010db8000000000000000000000001n);
        assert.equal(parsed.bytes.length, 16);
        assert.equal(parsed.bytes[15], 1);
      }
      const count = contexts.length;
      assert.throws(() => sync.lookup("invalid"), { code: "INVALID_IP" });
      await assert.rejects(asyncQuery.lookupAsync("invalid"), { code: "INVALID_IP" });
      assert.equal(contexts.length, count);
    } finally {
      sync.close();
      await asyncQuery.closeAsync();
    }
  });

  test("class methods retain this and borrowed sources can be shared", () => {
    const source = new MapReader([[hit, expected]]);
    const first = new IP2Region({ source });
    const second = new IP2Region({ source });
    first.close();
    first.close();
    assert.equal(source.closed, false);
    assert.deepEqual(second.lookup(hit), expected);
    second.close();
    const owner = new IP2Region({ source, ownership: "owned" });
    owner.close();
    owner.close();
    assert.equal(source.closed, true);
    assert.equal(source.records.size, 0);
  });

  test("capabilities reject an unsupported family before invoking the source", () => {
    let calls = 0;
    const query = new IP2Region({
      source: {
        capabilities: { families: [4] },
        lookup() {
          calls++;
          return expected;
        },
      },
    });
    try {
      assert.throws(() => query.lookup(hit), { code: "UNSUPPORTED_FAMILY" });
      assert.equal(calls, 0);
      assert.deepEqual(query.lookup("192.0.2.1"), expected);
    } finally {
      query.close();
    }
  });

  test("custom failures preserve stable codes and wrap ordinary causes", async () => {
    const cause = new Error("transport failed");
    const stable = new IP2RegionError("INVALID_DATABASE", "bad custom record");
    for (const failure of [cause, stable]) {
      const sync = new IP2Region({
        source: () => {
          throw failure;
        },
      });
      const asyncQuery = new AsyncIP2Region({
        source: async () => {
          throw failure;
        },
      });
      const check = (/** @type {unknown} */ error) => {
        assert(error instanceof IP2RegionError);
        if (failure === stable) assert.equal(error, stable);
        else {
          assert.equal(error.code, "ADAPTER_ERROR");
          assert.equal(error.cause, cause);
        }
        return true;
      };
      try {
        assert.throws(() => sync.lookup(hit), check);
        await assert.rejects(asyncQuery.lookupAsync(hit), check);
      } finally {
        sync.close();
        await asyncQuery.closeAsync();
      }
    }
  });

  test("async close waits for active transport work and releases exactly once", async () => {
    let release = () => {};
    let closes = 0;
    const source = new ServiceReader(
      () =>
        new Promise((resolve) => {
          release = () => resolve(expected);
        }),
      async () => {
        closes++;
      }
    );
    const query = new AsyncIP2Region({ source, ownership: "owned" });
    const pending = query.lookupAsync(hit);
    const closing = query.closeAsync();
    try {
      assert.equal(closing, query.closeAsync());
      await assert.rejects(query.lookupAsync(miss), { code: "CLOSED" });
      assert.equal(closes, 0);
    } finally {
      release();
      await closing;
    }
    assert.deepEqual(await pending, expected);
    assert.equal(closes, 1);
  });

  test("async batches call the transport sequentially and preserve input order", async () => {
    let active = 0;
    let peak = 0;
    /** @type {string[]} */
    const calls = [];
    const query = new AsyncIP2Region({
      source: async (ip) => {
        calls.push(ip);
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return ip === hit ? expected : null;
      },
    });
    try {
      assert.deepEqual(await query.lookupManyAsync([miss, hit]), [null, expected]);
      assert.deepEqual(calls, [miss, hit]);
      assert.equal(peak, 1);
    } finally {
      await query.closeAsync();
    }
  });

  test("custom byte reader validates its own format and snapshots input", () => {
    const input = bytes.slice();
    const query = new IP2Region({ source: new JSONReader(input), ownership: "owned" });
    input.fill(0);
    try {
      assert.deepEqual(query.lookup(hit), expected);
    } finally {
      query.close();
    }
    for (const invalid of [
      "not-json",
      "{}",
      '[{"ip":"bad","country":"Example"}]',
      '[{"ip":"::1","country":1}]',
      '[{"ip":"::1","country":"A"},{"ip":"0:0:0:0:0:0:0:1","country":"B"}]',
    ]) {
      assert.throws(() => new JSONReader(new TextEncoder().encode(invalid)), { code: "INVALID_DATABASE" });
    }
    assert.throws(() => new JSONReader(new Uint8Array([0xff])), { code: "INVALID_DATABASE" });
  });
}
