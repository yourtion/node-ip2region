import { adapterError, IP2RegionError } from "./errors.js";
import { parseIP } from "./ip.js";
import type {
  Adapter,
  AsyncAdapter,
  AsyncLookup,
  AsyncSource,
  BatchItem,
  Lookup,
  LookupOptions,
  LookupResult,
  Source,
} from "./types.js";

function optionsOf(options: LookupOptions): Required<LookupOptions> {
  const ownership = options.ownership ?? "borrowed";
  const mappedIPv6 = options.mappedIPv6 ?? "preserve";
  if (!["borrowed", "owned"].includes(ownership) || !["preserve", "ipv4"].includes(mappedIPv6)) {
    throw new IP2RegionError("INVALID_ARGUMENT", "Invalid lookup options");
  }
  return { ownership, mappedIPv6 };
}

function sourceOf<R extends LookupResult, A extends Adapter<R> | AsyncAdapter<R>>(
  source: Source<R> | AsyncSource<R>
): A {
  const adapter = (typeof source === "function" ? { lookup: source } : source) as Adapter<R> | AsyncAdapter<R>;
  if (
    !adapter ||
    typeof adapter.lookup !== "function" ||
    (adapter.close !== undefined && typeof adapter.close !== "function")
  ) {
    throw new IP2RegionError("CONTRACT_ERROR", "A source must be a query function or an object with a lookup method");
  }
  return adapter as A;
}

function prepare(ip: string, adapter: Adapter | AsyncAdapter, options: Required<LookupOptions>) {
  let parsed = parseIP(ip);
  if (options.mappedIPv6 === "ipv4" && parsed.mappedIPv4) parsed = parseIP(parsed.mappedIPv4);
  if (adapter.capabilities?.families && !adapter.capabilities.families.includes(parsed.family)) {
    throw new IP2RegionError("UNSUPPORTED_FAMILY", `The source does not support IPv${parsed.family}`);
  }
  return parsed;
}

function promiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

function resultOf<R extends LookupResult>(value: R | null): R | null {
  if (promiseLike(value)) {
    // A malformed JS adapter can return a rejected promise to the synchronous API.
    void Promise.resolve(value).catch(() => {});
    throw new IP2RegionError("CONTRACT_ERROR", "A synchronous adapter must not return a Promise");
  }
  if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
    throw new IP2RegionError("CONTRACT_ERROR", "An adapter must return a result object or null");
  }
  return value;
}

function closed(): IP2RegionError {
  return new IP2RegionError("CLOSED", "The lookup instance is closed");
}

export function createLookup<R extends LookupResult>(source: Source<R>, options: LookupOptions = {}): Lookup<R> {
  const config = optionsOf(options);
  const adapter = sourceOf<R, Adapter<R>>(source);
  let isClosed = false;
  const lookup = (ip: string): R | null => {
    if (isClosed) throw closed();
    const parsed = prepare(ip, adapter, config);
    try {
      return resultOf(adapter.lookup(parsed.address, parsed));
    } catch (cause) {
      throw adapterError(cause);
    }
  };
  return {
    capabilities: adapter.capabilities,
    metadata: adapter.metadata,
    lookup,
    lookupMany: (ips) => Array.from(ips, lookup),
    lookupManySettled: (ips) =>
      Array.from(ips, (ip): BatchItem<R> => {
        try {
          return { ok: true, value: lookup(ip) };
        } catch (cause) {
          return { ok: false, error: adapterError(cause) };
        }
      }),
    close() {
      if (isClosed) return;
      isClosed = true;
      if (config.ownership === "owned" && adapter.close) {
        try {
          const returned: unknown = adapter.close();
          if (promiseLike(returned)) {
            void Promise.resolve(returned).catch(() => {});
            throw new IP2RegionError("CONTRACT_ERROR", "A synchronous close method must not return a Promise");
          }
        } catch (cause) {
          throw adapterError(cause);
        }
      }
    },
  };
}

export function createAsyncLookup<R extends LookupResult>(
  source: AsyncSource<R>,
  options: LookupOptions = {}
): AsyncLookup<R> {
  const config = optionsOf(options);
  const adapter = sourceOf<R, AsyncAdapter<R>>(source);
  const active = new Set<Promise<R | null>>();
  let isClosed = false;
  let closing: Promise<void> | undefined;
  const lookup = (ip: string): Promise<R | null> => {
    if (isClosed) return Promise.reject(closed());
    const task = (async () => {
      const parsed = prepare(ip, adapter, config);
      try {
        const pending = adapter.lookup(parsed.address, parsed);
        if (!promiseLike(pending))
          throw new IP2RegionError("CONTRACT_ERROR", "An asynchronous adapter must return a Promise");
        return resultOf(await pending);
      } catch (cause) {
        throw adapterError(cause);
      }
    })();
    active.add(task);
    void task.then(
      () => active.delete(task),
      () => active.delete(task)
    );
    return task;
  };
  return {
    capabilities: adapter.capabilities,
    metadata: adapter.metadata,
    lookup,
    async lookupMany(ips) {
      const results: (R | null)[] = [];
      for (const ip of ips) results.push(await lookup(ip));
      return results;
    },
    async lookupManySettled(ips) {
      const results: BatchItem<R>[] = [];
      for (const ip of ips) {
        try {
          results.push({ ok: true, value: await lookup(ip) });
        } catch (cause) {
          results.push({ ok: false, error: adapterError(cause) });
        }
      }
      return results;
    },
    close() {
      if (closing) return closing;
      isClosed = true;
      closing = Promise.allSettled([...active]).then(async () => {
        if (config.ownership === "owned" && adapter.close) {
          try {
            const pending = adapter.close();
            if (!promiseLike(pending))
              throw new IP2RegionError("CONTRACT_ERROR", "An asynchronous close method must return a Promise");
            await pending;
          } catch (cause) {
            throw adapterError(cause);
          }
        }
      });
      return closing;
    },
  };
}
