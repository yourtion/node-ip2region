import assert from "node:assert/strict";
import { IP2Region, AsyncIP2Region } from "ip2region";

/** @typedef {import('ip2region').LookupResult} LookupResult */
/** @typedef {(name: string, run: () => void | Promise<void>) => unknown} RegisterTest */
/** @typedef {{hit: string, miss: string, expected: LookupResult}} Fixture */

/**
 * Copy this registration helper into your own adapter project.
 * Every call to freshSource must create an independent, closable source.
 * @param {RegisterTest} test
 * @param {() => import('ip2region').Source} freshSource
 * @param {Fixture} fixture
 */
export function syncAdapterContract(test, freshSource, { hit, miss, expected }) {
  test("hit, miss, ordered batches and JSON-compatible results", () => {
    const query = new IP2Region({ source: freshSource(), ownership: "owned" });
    try {
      assert.deepEqual(query.lookup(hit), expected);
      assert.equal(query.lookup(miss), null);
      assert.deepEqual(query.lookupMany([miss, hit]), [null, expected]);
      assert.deepEqual(JSON.parse(JSON.stringify(query.lookup(hit))), expected);
      const settled = query.lookupManySettled([hit, "invalid", miss]);
      assert.deepEqual(
        settled.map((item) => item.ok),
        [true, false, true]
      );
      if (!settled[1].ok) assert.equal(settled[1].error.code, "INVALID_IP");
    } finally {
      query.close();
    }
  });
  test("invalid IPs, idempotent close and synchronous-only methods", () => {
    const query = new IP2Region({ source: freshSource(), ownership: "owned" });
    try {
      assert.throws(() => query.lookup("invalid"), { code: "INVALID_IP" });
      assert.throws(() => query.lookupMany(["invalid", hit]), { code: "INVALID_IP" });
      assert.equal("lookupAsync" in query, false);
      assert.equal("closeAsync" in query, false);
    } finally {
      query.close();
    }
    query.close();
    assert.throws(() => query.lookup(hit), { code: "CLOSED" });
  });
}

/**
 * The asynchronous contract has explicit Async suffixes on every query method.
 * @param {RegisterTest} test
 * @param {() => import('ip2region').AsyncSource} freshSource
 * @param {Fixture} fixture
 */
export function asyncAdapterContract(test, freshSource, { hit, miss, expected }) {
  test("async hit, miss, ordered batches and JSON-compatible results", async () => {
    const query = new AsyncIP2Region({ source: freshSource(), ownership: "owned" });
    try {
      assert.deepEqual(await query.lookupAsync(hit), expected);
      assert.equal(await query.lookupAsync(miss), null);
      assert.deepEqual(await query.lookupManyAsync([miss, hit]), [null, expected]);
      assert.deepEqual(JSON.parse(JSON.stringify(await query.lookupAsync(hit))), expected);
      const settled = await query.lookupManySettledAsync([hit, "invalid", miss]);
      assert.deepEqual(
        settled.map((item) => item.ok),
        [true, false, true]
      );
      if (!settled[1].ok) assert.equal(settled[1].error.code, "INVALID_IP");
    } finally {
      await query.closeAsync();
    }
  });
  test("invalid IPs, stable close promise and asynchronous-only methods", async () => {
    const query = new AsyncIP2Region({ source: freshSource(), ownership: "owned" });
    try {
      await assert.rejects(query.lookupAsync("invalid"), { code: "INVALID_IP" });
      await assert.rejects(query.lookupManyAsync(["invalid", hit]), { code: "INVALID_IP" });
      assert.equal("lookup" in query, false);
      assert.equal("close" in query, false);
    } finally {
      await query.closeAsync();
    }
    assert.equal(query.closeAsync(), query.closeAsync());
    await assert.rejects(query.lookupAsync(hit), { code: "CLOSED" });
  });
}
