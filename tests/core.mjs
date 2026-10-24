import { IP2Region, AsyncIP2Region, parseIP, IP2RegionError } from "../dist/esm/index.js";
import { assert, equal, throws, rejects } from "./assert.mjs";
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
