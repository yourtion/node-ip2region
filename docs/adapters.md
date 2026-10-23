# External adapters

Use a function for simple sources and an object/class instance when state,
capabilities or cleanup are needed. The library never constructs an external
class or guesses its constructor arguments. No registration or inheritance is
required.

```ts
import { createLookup, type Adapter, type LookupResult } from "ip2region";

class MyReader implements Adapter {
  readonly capabilities = { families: [4, 6] as const };
  readonly metadata = { id: "my-source", dataVersion: "2026-10" };
  constructor(private records: Map<string, LookupResult>) {}
  lookup(ip: string) {
    return this.records.get(ip) ?? null;
  }
  close() {
    this.records.clear();
  }
}

const provider = new MyReader(new Map());
const query = createLookup(provider); // borrowed: provider.close is not called
query.close();
provider.close();
```

The optional second query argument is ParsedIP: canonical address, family,
network-order Uint8Array bytes, complete bigint value and optional mappedIPv4.
The context is per-call. Do not return the bigint in a public result; encode
non-JSON internal values in a JSON-compatible typed extension instead.

Capabilities and metadata are optional properties, not required methods.
Missing capability information means unknown. A declared family restriction
is enforced before calling the source. Return a result object or null, never
undefined, a sentinel string or a Promise from the synchronous contract.
The core preserves `this` for object/class methods.

For asynchronous sources use AsyncAdapter/createAsyncLookup. Both lookup and
an optional close method return Promises. Async close rejects new work, waits
for active queries (including failures), then closes an owned source once.
The same close Promise is returned on repeated calls. A source must not await
its own wrapper's close from inside an active lookup.

Borrowed sources are the default and can be shared by multiple wrappers.
`{ ownership: "owned" }` transfers cleanup responsibility. Native
`openDatabase(path, bytes => new MyReaderFromBytes(bytes))` factories create and
own their source. When a source throws a normal error, the wrapper throws
ADAPTER_ERROR with the original cause; throw IP2RegionError for stable specific
codes. Close failure leaves the wrapper closed and does not retry cleanup.

## Reusable contract-test example

Copy the following test registration into your adapter project, provide a
fresh-source factory backed by your own synthetic fixture, and call it with
Node's `test`, Bun's `test` or `Deno.test`. A fixture should contain one known hit
and one known miss. Add reader-specific malformed-file and close-resource tests.

```js
import { createLookup } from "ip2region";

export function adapterContract(test, freshSource, { hit, miss, expected }) {
  const same = (a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Unexpected result");
  };
  test("hit, miss, batch order and JSON serialization", () => {
    const query = createLookup(freshSource(), { ownership: "owned" });
    try {
      same(query.lookup(hit), expected);
      same(query.lookup(miss), null);
      same(query.lookupMany([miss, hit]), [null, expected]);
      JSON.stringify(query.lookup(hit));
      const items = query.lookupManySettled([hit, "invalid", miss]);
      same(
        items.map((item) => item.ok),
        [true, false, true]
      );
      same(items[1].error.code, "INVALID_IP");
    } finally {
      query.close();
    }
    query.close();
    try {
      query.lookup(hit);
    } catch (error) {
      if (error.code === "CLOSED") return;
      throw error;
    }
    throw new Error("Closed instance accepted a lookup");
  });
}
```

For async adapters use createAsyncLookup and await every query/close. Also
test an active query during close, rejected queries, repeated close, and two
borrowed wrappers sharing one source. The project's shared runtime test suite
contains runnable examples of these cases.
