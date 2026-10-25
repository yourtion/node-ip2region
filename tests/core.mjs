import { IP2Region, AsyncIP2Region, parseIP, IP2RegionError } from "../dist/esm/index.js";
import { assert, equal, throws, rejects } from "./assert.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Let all current Promise reactions run while explicitly held requests stay pending.
const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

export const validIPs = [
  ["0.0.0.0", "0.0.0.0", 4, 0n],
  ["255.255.255.255", "255.255.255.255", 4, 4294967295n],
  ["192.0.2.1", "192.0.2.1", 4, 3221225985n],
  ["::", "::", 6, 0n],
  ["0:0:0:0:0:0:0:1", "::1", 6, 1n],
  [
    "FFFF:FFFF:FFFF:FFFF:FFFF:FFFF:FFFF:FFFF",
    "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    6,
    340282366920938463463374607431768211455n,
  ],
  ["2001:db8::1", "2001:db8::1", 6, 42540766411282592856903984951653826561n],
  ["2001:db8::2", "2001:db8::2", 6, 42540766411282592856903984951653826562n],
  ["::ffff:192.0.2.1", "::ffff:c000:201", 6, 281473902969345n],
  ["0:0:0:0:0:0:192.0.2.1", "::c000:201", 6, 3221225985n],
  ["2001:0:0:1:0:0:1:1", "2001::1:0:0:1:1", 6],
  ["2001:db8:0:1:2:3:4:5", "2001:db8:0:1:2:3:4:5", 6],
];
export const invalidIPs = [
  null,
  undefined,
  0,
  {},
  "",
  " ",
  " 192.0.2.1",
  "192.0.2.1\n",
  "01.2.3.4",
  "1.02.3.4",
  "1.2.03.4",
  "1.2.3.04",
  "1.2.3.000",
  "256.0.0.1",
  "1.2.3.256",
  "1.2.3.999",
  "1.2.3.1234",
  "1.2.3.4.5",
  ".1.2.3.4",
  "1.2.3.4.",
  "1..3.4",
  "1.2..4",
  "1.2.3.",
  "1.2.3.-1",
  "1.2.3.+1",
  "1.2.3.1e2",
  "1.2.3.１",
  "1.2.3.4\u0000",
  "127.1",
  "0x7f000001",
  "1.2.3.4:80",
  "[::1]",
  "[::1]:80",
  "fe80::1%eth0",
  "1::2::3",
  "1:2:3:4:5:6:7",
  "1:2:3:4:5:6:7:8:9",
  "1:2:3:4:5:6:7:8::",
  ":1:2:3:4:5:6:7",
  "1:2:3:4:5:6:7:",
  "::ffff:192.0.2.256",
  "::ffff:192.0.02.1",
  "::ffff:192.0.2.01",
  "::ffff:192.0.2.1.",
  "::ffff:192.0.2.+1",
  "1:::2",
  "::gggg",
  ":::1",
  "::ffff:1.2.3.4:5",
];
export function coreSuite(test) {
  test("IP literals retain all 128 bits and canonicalize deterministically", () => {
    for (const [input, address, family, value] of validIPs) {
      const parsed = parseIP(input);
      equal(parsed.address, address);
      equal(parsed.family, family);
      equal(parsed.bytes.length, family === 4 ? 4 : 16);
      if (value !== undefined) equal(parsed.value, value);
      equal(parseIP(parsed.address).value, parsed.value);
    }
    equal(parseIP("::ffff:192.0.2.1").mappedIPv4, "192.0.2.1");
    equal(parseIP("::192.0.2.1").mappedIPv4, undefined);
  });
  test("invalid inputs, scopes and port syntax have a stable error", () => {
    for (const input of invalidIPs) throws(() => parseIP(input), "INVALID_IP");
  });
  test("every decimal octet round-trips without changing its canonical spelling", () => {
    for (let position = 0; position < 4; position++) {
      for (let value = 0; value <= 255; value++) {
        const bytes = [192, 0, 2, 1];
        bytes[position] = value;
        const address = bytes.join(".");
        const parsed = parseIP(address);
        equal(parsed.address, address);
        equal(parsed.bytes, bytes);
        throws(() => parseIP(bytes.map((byte, i) => (i === position ? `0${byte}` : byte)).join(".")), "INVALID_IP");
      }
    }
  });
  test("address integers retain every bit across unsigned word boundaries", () => {
    for (const width of [4, 16]) {
      const maximum = (1n << BigInt(width * 8)) - 1n;
      const values = [0n, maximum];
      for (let bit = 0; bit < width * 8; bit++) values.push(1n << BigInt(bit), maximum ^ (1n << BigInt(bit)));
      for (const value of values) {
        const hex = value.toString(16).padStart(width * 2, "0");
        const bytes = hex.match(/../g).map((pair) => Number.parseInt(pair, 16));
        const input = width === 4 ? bytes.join(".") : hex.match(/.{4}/g).join(":").toUpperCase();
        const parsed = parseIP(input);
        equal(parsed.bytes, bytes);
        equal(parsed.value, value);
        equal(parseIP(parsed.address).value, value);
      }
    }
  });
  test("functions receive canonical addresses and parsed context", () => {
    const query = new IP2Region({
      source: (ip, parsed) => ({
        extensions: { ip, family: parsed.family, lowByte: parsed.bytes.at(-1) },
      }),
    });
    equal(query.lookup("2001:0db8::2"), { extensions: { ip: "2001:db8::2", family: 6, lowByte: 2 } });
    const mapped = new IP2Region({
      source: (ip, parsed) => ({
        extensions: {
          ip,
          family: parsed.family,
        },
      }),
      mappedIPv6: "ipv4",
    });
    equal(mapped.lookup("::ffff:192.0.2.1"), { extensions: { ip: "192.0.2.1", family: 4 } });
    equal(mapped.lookup("::192.0.2.1").extensions.family, 6);
    equal(mapped.lookup("2002:c000:201::1").extensions.family, 6);
  });
  test("objects and class instances retain this; shared instances are borrowed", () => {
    class Provider {
      name = "Example";
      closes = 0;
      metadata = { id: "external" };
      capabilities = { families: [4] };
      lookup() {
        return { country: { name: this.name } };
      }
      close() {
        this.closes++;
      }
    }
    const source = new Provider();
    const first = new IP2Region({
      source: source,
    });
    const second = new IP2Region({
      source: source,
    });
    equal(first.metadata.id, "external");
    equal(first.lookup("192.0.2.1"), { country: { name: "Example" } });
    throws(() => first.lookup("::1"), "UNSUPPORTED_FAMILY");
    first.close();
    first.close();
    equal(source.closes, 0);
    throws(() => first.lookup("invalid"), "CLOSED");
    assert(second.lookup("192.0.2.1"));
    const owner = new IP2Region({
      source,
      ownership: "owned",
    });
    owner.close();
    owner.close();
    equal(source.closes, 1);
  });
  test("only null denotes a miss; batches retain order and define error policy", () => {
    const query = new IP2Region({
      source: (ip) => (ip === "192.0.2.1" ? null : {}),
    });
    equal(query.lookupMany(["192.0.2.2", "192.0.2.1"]), [{}, null]);
    throws(() => query.lookupMany(["bad", "192.0.2.1"]), "INVALID_IP");
    const settled = query.lookupManySettled(["192.0.2.1", "bad", "192.0.2.2"]);
    equal(
      settled.map((item) => (item.ok ? item.value : item.error.code)),
      [null, "INVALID_IP", {}]
    );
  });
  test("adapter failures preserve their cause; owned close is attempted once", () => {
    const cause = new Error("external error");
    let closes = 0;
    const query = new IP2Region({
      source: {
        lookup() {
          throw cause;
        },
        close() {
          closes++;
          throw cause;
        },
      },
      ownership: "owned",
    });
    assert(throws(() => query.lookup("::1"), "ADAPTER_ERROR").cause === cause);
    assert(throws(() => query.close(), "ADAPTER_ERROR").cause === cause);
    query.close();
    equal(closes, 1);
    throws(() => query.lookup("::1"), "CLOSED");
    const stable = new IP2RegionError("INVALID_DATABASE", "bad record");
    assert(
      throws(() =>
        new IP2Region({
          source: () => {
            throw stable;
          },
        }).lookup("::1")
      ) === stable
    );
  });
  test("malformed sources and mixed synchronous contracts fail explicitly", () => {
    for (const value of [null, {}, { lookup: 1 }, { lookup() {}, close: 1 }])
      throws(
        () =>
          new IP2Region({
            source: value,
          }),
        "CONTRACT_ERROR"
      );
    throws(
      () =>
        new IP2Region({
          source: () => null,
          mappedIPv6: "guess",
        }),
      "INVALID_ARGUMENT"
    );
    for (const value of [
      undefined,
      false,
      "unknown",
      [],
      Promise.resolve(null),
      Promise.reject(new Error("bad async")),
    ]) {
      throws(
        () =>
          new IP2Region({
            source: () => value,
          }).lookup("::1"),
        "CONTRACT_ERROR"
      );
    }
    const query = new IP2Region({
      source: {
        lookup: () => null,
        close: async () => {},
      },
      ownership: "owned",
    });
    throws(() => query.close(), "CONTRACT_ERROR");
    query.close();
  });
  test("custom source declarations and instance options are checked before queries", () => {
    for (const options of [null, [], 1, { source: () => null, families: [4] }, { source: () => null, database: {} }]) {
      throws(() => new IP2Region(options), "INVALID_ARGUMENT");
      throws(() => new AsyncIP2Region(options), "INVALID_ARGUMENT");
    }
    for (const capabilities of [
      null,
      [],
      { families: [] },
      { families: [5] },
      { families: [4, 4] },
      { fields: [""] },
      { fields: ["city", "city"] },
      { languages: "CN" },
    ]) {
      throws(() => new IP2Region({ source: { capabilities, lookup: () => null } }), "CONTRACT_ERROR");
      throws(() => new AsyncIP2Region({ source: { capabilities, lookupAsync: async () => null } }), "CONTRACT_ERROR");
    }
    for (const metadata of [null, "source", {}, { id: "" }]) {
      throws(() => new IP2Region({ source: { metadata, lookup: () => null } }), "CONTRACT_ERROR");
      throws(() => new AsyncIP2Region({ source: { metadata, lookupAsync: async () => null } }), "CONTRACT_ERROR");
    }
    throws(() => new AsyncIP2Region({ source: { lookup: async () => null } }), "CONTRACT_ERROR");
    throws(() => new IP2Region({ source: { lookupAsync: async () => null } }), "CONTRACT_ERROR");
  });
  test("async functions and classes use a distinct Promise contract", async () => {
    class Provider {
      name = "Async";
      async lookupAsync() {
        return { organization: this.name };
      }
      async closeAsync() {
        this.name = "closed";
      }
    }
    const source = new Provider();
    const query = new AsyncIP2Region({
      source,
      ownership: "owned",
    });
    equal(await query.lookupManyAsync(["::1", "192.0.2.1"]), [{ organization: "Async" }, { organization: "Async" }]);
    const settled = await query.lookupManySettledAsync(["::1", "bad", "192.0.2.1"]);
    equal(
      settled.map((r) => r.ok),
      [true, false, true]
    );
    equal(settled[1].error.code, "INVALID_IP");
    await query.closeAsync();
    equal(source.name, "closed");
    const pending = query.lookupAsync("::1");
    assert(pending instanceof Promise);
    await rejects(() => pending, "CLOSED");
    await rejects(
      () =>
        new AsyncIP2Region({
          source: () => null,
        }).lookupAsync("::1"),
      "CONTRACT_ERROR"
    );
  });
  test("async close waits for active work, rejects new work, and returns the same promise", async () => {
    let release;
    let closes = 0;
    const query = new AsyncIP2Region({
      source: {
        lookupAsync: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
        closeAsync: async () => {
          closes++;
        },
      },
      ownership: "owned",
    });
    const active = query.lookupAsync("::1");
    const closing = query.closeAsync();
    assert(closing === query.closeAsync());
    equal(closes, 0);
    await rejects(() => query.lookupAsync("::2"), "CLOSED");
    release({ isp: "Example" });
    equal(await active, { isp: "Example" });
    await closing;
    equal(closes, 1);
    let borrowed = 0;
    const shared = new AsyncIP2Region({
      source: {
        lookupAsync: async () => null,
        closeAsync: async () => {
          borrowed++;
        },
      },
    });
    await shared.closeAsync();
    equal(borrowed, 0);
  });
  test("async batch options reject invalid concurrency before acquiring the iterable", async () => {
    let acquired = 0;
    const ips = {
      [Symbol.iterator]() {
        acquired++;
        return ["::1"][Symbol.iterator]();
      },
    };
    const query = new AsyncIP2Region({ source: async () => null });
    const invalid = [
      null,
      [],
      false,
      "options",
      ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", null].map((concurrency) => ({ concurrency })),
    ];
    for (const method of ["lookupManyAsync", "lookupManySettledAsync"]) {
      for (const options of invalid) await rejects(() => query[method](ips, options), "INVALID_ARGUMENT");
      equal(acquired, 0);
      equal(await query[method]([], { concurrency: Number.MAX_SAFE_INTEGER }), []);
    }
    equal(await query.lookupManyAsync(["::1", "::2"], { concurrency: Number.MAX_SAFE_INTEGER }), [null, null]);
    await query.closeAsync();
  });
  test("async batches remain sequential by default and with concurrency one", async () => {
    for (const options of [undefined, {}, { concurrency: 1 }]) {
      const requests = [];
      const query = new AsyncIP2Region({
        source: () => {
          const request = deferred();
          requests.push(request);
          return request.promise;
        },
      });
      const batch = query.lookupManyAsync(["::1", "::2"], options);
      equal(requests.length, 1);
      requests[0].resolve({ isp: "first" });
      await nextTurn();
      equal(requests.length, 2);
      requests[1].resolve(null);
      equal(await batch, [{ isp: "first" }, null]);
      await query.closeAsync();
    }
  });
  test("bounded async batches pull lazily and refill completed slots while preserving result order", async () => {
    let pulled = 0,
      running = 0,
      maximum = 0;
    const requests = new Map();
    const ips = {
      *[Symbol.iterator]() {
        for (let i = 1; i <= 5; i++) {
          pulled++;
          yield `::${i}`;
        }
      },
    };
    const query = new AsyncIP2Region({
      source: (ip) => {
        running++;
        maximum = Math.max(maximum, running);
        const request = deferred();
        requests.set(ip, request);
        return request.promise.finally(() => running--);
      },
    });
    const batch = query.lookupManyAsync(ips, { concurrency: 2 });
    equal(pulled, 2);
    equal([...requests.keys()], ["::1", "::2"]);
    for (const i of [2, 3, 4]) {
      requests.get(`::${i}`).resolve(i === 2 ? null : { isp: String(i) });
      await nextTurn();
      equal(pulled, i + 1);
      equal(running, 2);
    }
    requests.get("::5").resolve({ isp: "5" });
    requests.get("::1").resolve({ isp: "1" });
    equal(await batch, [{ isp: "1" }, null, { isp: "3" }, { isp: "4" }, { isp: "5" }]);
    equal(maximum, 2);
    equal(running, 0);
    await query.closeAsync();
  });
  test("async fail-fast batches close their iterator, stop pulling and drain started requests", async () => {
    let pulled = 0,
      returned = 0,
      finished = false;
    const requests = [];
    const failure = new Error("second request failed");
    const ips = {
      *[Symbol.iterator]() {
        try {
          for (const ip of ["::1", "::2", "::3", "::4"]) {
            pulled++;
            yield ip;
          }
        } finally {
          returned++;
        }
      },
    };
    const query = new AsyncIP2Region({
      source: () => {
        const request = deferred();
        requests.push(request);
        return request.promise;
      },
    });
    const observed = rejects(() => query.lookupManyAsync(ips, { concurrency: 2 }), "ADAPTER_ERROR").then((error) => {
      finished = true;
      return error;
    });
    requests[1].reject(failure);
    await nextTurn();
    equal(pulled, 2);
    equal(returned, 1);
    equal(requests.length, 2);
    equal(finished, false);
    requests[0].resolve(null);
    assert((await observed).cause === failure);
    await query.closeAsync();
  });
  test("a slow first request does not block a long stream of later async batch results", async () => {
    const first = deferred();
    let called = 0,
      running = 0,
      maximum = 0;
    const ips = Array.from({ length: 1000 }, (_, index) => `2001:db8::${(index + 1).toString(16)}`);
    const query = new AsyncIP2Region({
      source: async (ip) => {
        called++;
        running++;
        maximum = Math.max(maximum, running);
        try {
          if (ip === ips[0]) return await first.promise;
          return { isp: ip };
        } finally {
          running--;
        }
      },
    });
    const batch = query.lookupManyAsync(ips.values(), { concurrency: 2 });
    await nextTurn();
    equal(called, ips.length);
    equal(running, 1);
    equal(maximum, 2);
    first.resolve({ isp: ips[0] });
    equal(
      (await batch).map((result) => result.isp),
      ips
    );
    await query.closeAsync();
  });
  test("async batches drain requests on iterator errors and preserve the first error over cleanup errors", async () => {
    for (const method of ["lookupManyAsync", "lookupManySettledAsync"]) {
      const request = deferred();
      const failure = new Error("iterator failed");
      let reads = 0,
        returned = 0,
        finished = false,
        called = 0;
      const ips = {
        [Symbol.iterator]() {
          return {
            next() {
              if (reads++ === 0) return { value: "::1", done: false };
              throw failure;
            },
            return() {
              returned++;
              throw new Error("cleanup failed");
            },
          };
        },
      };
      const query = new AsyncIP2Region({
        source: () => {
          called++;
          return request.promise;
        },
      });
      const observed = rejects(() => query[method](ips, { concurrency: 3 })).then((error) => {
        finished = true;
        return error;
      });
      equal(returned, 1);
      equal(called, 1);
      await nextTurn();
      equal(finished, false);
      request.reject(new Error("later request rejection"));
      assert((await observed) === failure);
      equal(reads, 2);
      await query.closeAsync();
    }
  });
  test("async batches reject malformed iterator results and handle rejected iterator cleanup", async () => {
    let called = 0,
      returned = 0;
    const query = new AsyncIP2Region({
      source: async () => {
        called++;
        return null;
      },
    });
    for (const method of ["lookupManyAsync", "lookupManySettledAsync"]) {
      const ips = {
        [Symbol.iterator]() {
          return {
            next: () => 42,
            return() {
              returned++;
              return Promise.reject(new Error("malformed async cleanup"));
            },
          };
        },
      };
      assert((await rejects(() => query[method](ips, { concurrency: 2 }))) instanceof TypeError);
    }
    await nextTurn();
    equal(called, 0);
    equal(returned, 2);
    await query.closeAsync();
  });
  test("concurrent settled batches retain per-item errors and continue in input order", async () => {
    const requests = new Map();
    const failure = new Error("transport failed");
    const query = new AsyncIP2Region({
      source: (ip) => {
        const request = deferred();
        requests.set(ip, request);
        return request.promise;
      },
    });
    const batch = query.lookupManySettledAsync(["::1", "bad", "::2", "::3"], { concurrency: 2 });
    await nextTurn();
    equal([...requests.keys()], ["::1", "::2"]);
    requests.get("::2").reject(failure);
    await nextTurn();
    equal([...requests.keys()], ["::1", "::2", "::3"]);
    requests.get("::3").resolve(null);
    requests.get("::1").resolve({ isp: "first" });
    const results = await batch;
    equal(
      results.map((result) => (result.ok ? result.value : result.error.code)),
      [{ isp: "first" }, "INVALID_IP", "ADAPTER_ERROR", null]
    );
    assert(results[2].error.cause === failure);
    await query.closeAsync();
  });
  test("close during a concurrent batch waits for every started request and rejects queued work", async () => {
    const requests = [];
    let closes = 0;
    const query = new AsyncIP2Region({
      source: {
        lookupAsync() {
          const request = deferred();
          requests.push(request);
          return request.promise;
        },
        async closeAsync() {
          closes++;
        },
      },
      ownership: "owned",
    });
    const observed = rejects(() => query.lookupManyAsync(["::1", "::2", "::3"], { concurrency: 2 }), "CLOSED");
    const closing = query.closeAsync();
    requests[0].resolve(null);
    await nextTurn();
    equal(closes, 0);
    equal(requests.length, 2);
    requests[1].resolve(null);
    await observed;
    await closing;
    equal(closes, 1);
    assert(query.closeAsync() === closing);
  });
  test("reentrant close in a concurrent batch never invokes more adapter requests", async () => {
    for (const method of ["lookupManyAsync", "lookupManySettledAsync"]) {
      let called = 0,
        closes = 0,
        closing;
      const request = deferred();
      const query = new AsyncIP2Region({
        source: {
          lookupAsync() {
            called++;
            closing = query.closeAsync();
            return request.promise;
          },
          async closeAsync() {
            closes++;
          },
        },
        ownership: "owned",
      });
      const batch = query[method](["::1", "::2", "::3", "::4"], { concurrency: 3 });
      const observed = method === "lookupManyAsync" ? rejects(() => batch, "CLOSED") : batch;
      await nextTurn();
      equal(called, 1);
      equal(closes, 0);
      request.resolve(null);
      const result = await observed;
      if (method === "lookupManySettledAsync")
        equal(
          result.map((item) => (item.ok ? item.value : item.error.code)),
          [null, "CLOSED", "CLOSED", "CLOSED"]
        );
      await closing;
      equal(closes, 1);
      equal(called, 1);
    }
  });
  test("async rejection does not block cleanup and close failures remain closed", async () => {
    const failure = new Error("failure");
    let closes = 0;
    const query = new AsyncIP2Region({
      source: {
        lookupAsync: async () => {
          throw failure;
        },
        closeAsync: async () => {
          closes++;
          throw failure;
        },
      },
      ownership: "owned",
    });
    const active = query.lookupAsync("::1");
    const closing = query.closeAsync();
    assert((await rejects(() => active, "ADAPTER_ERROR")).cause === failure);
    await rejects(() => closing, "ADAPTER_ERROR");
    await rejects(() => query.closeAsync(), "ADAPTER_ERROR");
    equal(closes, 1);
    await rejects(() => query.lookupAsync("::1"), "CLOSED");
  });
  test("reentrant async close waits for the lookup that triggered it, including rejection", async () => {
    for (const fail of [false, true]) {
      let finish, closing;
      const events = [];
      const query = new AsyncIP2Region({
        source: {
          lookupAsync() {
            events.push("lookup");
            closing = query.closeAsync();
            return new Promise((resolve, reject) => {
              finish = fail ? reject : resolve;
            });
          },
          async closeAsync() {
            events.push("close");
          },
        },
        ownership: "owned",
      });
      const pending = query.lookupAsync("::1");
      assert(closing === query.closeAsync());
      await rejects(() => query.lookupAsync("::2"), "CLOSED");
      equal(events, ["lookup"]);
      finish(fail ? new Error("lookup failed") : null);
      if (fail) await rejects(() => pending, "ADAPTER_ERROR");
      else equal(await pending, null);
      await closing;
      equal(events, ["lookup", "close"]);
    }
  });
}
