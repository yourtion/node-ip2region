import { adapterError, IP2RegionError } from "./errors.js";
import { parseIP } from "./ip.js";
import type {
  Adapter,
  AsyncAdapter,
  AsyncBatchOptions,
  AsyncLookup,
  AsyncSource,
  BatchItem,
  Lookup,
  LookupOptions,
  LookupResult,
  Source,
} from "./types.js";

export function normalizeLookupOptions(options: LookupOptions): Required<LookupOptions> {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new IP2RegionError("INVALID_ARGUMENT", "Expected a lookup options object");
  const ownership = options.ownership ?? "borrowed";
  const mappedIPv6 = options.mappedIPv6 ?? "preserve";
  if (!["borrowed", "owned"].includes(ownership) || !["preserve", "ipv4"].includes(mappedIPv6)) {
    throw new IP2RegionError("INVALID_ARGUMENT", "Invalid lookup options");
  }
  return { ownership, mappedIPv6 };
}

function sourceOf<R extends LookupResult>(source: Source<R>): Adapter<R> {
  const adapter = typeof source === "function" ? { lookup: source } : source;
  if (
    !adapter ||
    typeof adapter.lookup !== "function" ||
    (adapter.close !== undefined && typeof adapter.close !== "function")
  ) {
    throw new IP2RegionError("CONTRACT_ERROR", "A synchronous source needs lookup and an optional close method");
  }
  validateSource(adapter);
  return adapter;
}

function asyncSourceOf<R extends LookupResult>(source: AsyncSource<R>): AsyncAdapter<R> {
  const adapter = typeof source === "function" ? { lookupAsync: source } : source;
  if (
    !adapter ||
    typeof adapter.lookupAsync !== "function" ||
    (adapter.closeAsync !== undefined && typeof adapter.closeAsync !== "function")
  ) {
    throw new IP2RegionError(
      "CONTRACT_ERROR",
      "An asynchronous source needs lookupAsync and an optional closeAsync method"
    );
  }
  validateSource(adapter);
  return adapter;
}

function validateSource(adapter: Adapter | AsyncAdapter) {
  const capabilities = adapter.capabilities;
  if (capabilities !== undefined) {
    if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities))
      throw new IP2RegionError("CONTRACT_ERROR", "capabilities must be an object");
    const families = capabilities.families;
    if (
      families !== undefined &&
      (!Array.isArray(families) ||
        families.length === 0 ||
        Array.from(families).some((family) => family !== 4 && family !== 6) ||
        new Set(families).size !== families.length)
    )
      throw new IP2RegionError("CONTRACT_ERROR", "capabilities.families must contain distinct address families");
    for (const values of [capabilities.fields, capabilities.languages]) {
      if (
        values !== undefined &&
        (!Array.isArray(values) ||
          Array.from(values).some((value) => typeof value !== "string" || value.length === 0) ||
          new Set(values).size !== values.length)
      )
        throw new IP2RegionError("CONTRACT_ERROR", "Capability fields and languages must be distinct strings");
    }
  }
  const metadata = adapter.metadata;
  if (
    metadata !== undefined &&
    (!metadata ||
      typeof metadata !== "object" ||
      Array.isArray(metadata) ||
      typeof metadata.id !== "string" ||
      metadata.id.length === 0)
  )
    throw new IP2RegionError("CONTRACT_ERROR", "metadata requires a nonempty id");
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

async function asyncBatch<T>(
  ips: Iterable<string>,
  options: AsyncBatchOptions = {},
  lookup: (ip: string) => Promise<T>
): Promise<T[]> {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new IP2RegionError("INVALID_ARGUMENT", "Expected async batch options");
  const { concurrency = 1 } = options;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new IP2RegionError("INVALID_ARGUMENT", "Batch concurrency must be a positive safe integer");

  // Acquire only after validating options, and pull at most one window ahead.
  const iterator = ips[Symbol.iterator]();
  const next = iterator.next;
  const pending = new Set<Promise<void>>();
  const results: T[] = [];
  let index = 0;
  let done = false;
  let failed = false;
  let failure: unknown;
  let notify: (() => void) | undefined;
  const fail = (cause: unknown) => {
    if (failed) return;
    failed = true;
    failure = cause;
  };
  while (!failed && (!done || pending.size)) {
    while (!failed && !done && pending.size < concurrency) {
      try {
        const item = next.call(iterator);
        if (!item || (typeof item !== "object" && typeof item !== "function"))
          throw new TypeError("Iterator result must be an object");
        if (item.done) {
          done = true;
          break;
        }
        const position = index++;
        const task = lookup(item.value)
          .then((value) => {
            results[position] = value;
          }, fail)
          .finally(() => {
            pending.delete(task);
            const resume = notify;
            notify = undefined;
            resume?.();
          });
        pending.add(task);
      } catch (cause) {
        fail(cause);
      }
    }
    // One completion notification avoids retaining repeated race handlers on a slow request.
    if (!failed && pending.size)
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
  }
  if (failed) {
    if (!done) {
      try {
        const returned = iterator.return?.();
        // A malformed synchronous iterator may return a rejected Promise.
        if (promiseLike(returned)) void Promise.resolve(returned).catch(() => {});
      } catch {
        // Preserve the first query/iteration error, including if cleanup throws.
      }
    }
    // Every started request has a rejection handler; wait before rejecting the batch.
    await Promise.all(pending);
    throw failure;
  }
  return results;
}

export function createLookup<R extends LookupResult>(source: Source<R>, options: LookupOptions = {}): Lookup<R> {
  const config = normalizeLookupOptions(options);
  const adapter = sourceOf(source);
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
  const config = normalizeLookupOptions(options);
  const adapter = asyncSourceOf(source);
  const active = new Set<Promise<R | null>>();
  let isClosed = false;
  let closing: Promise<void> | undefined;
  const lookup = (ip: string): Promise<R | null> => {
    if (isClosed) return Promise.reject(closed());
    // Register before invoking user code: a lookup can synchronously trigger close.
    let resolveTask!: (value: R | null) => void;
    let rejectTask!: (cause: unknown) => void;
    const task = new Promise<R | null>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    active.add(task);
    void task.then(
      () => active.delete(task),
      () => active.delete(task)
    );
    void (async () => {
      const parsed = prepare(ip, adapter, config);
      try {
        const pending = adapter.lookupAsync(parsed.address, parsed);
        if (!promiseLike(pending))
          throw new IP2RegionError("CONTRACT_ERROR", "An asynchronous adapter must return a Promise");
        return resultOf(await pending);
      } catch (cause) {
        throw adapterError(cause);
      }
    })().then(resolveTask, rejectTask);
    return task;
  };
  return {
    capabilities: adapter.capabilities,
    metadata: adapter.metadata,
    lookupAsync: lookup,
    lookupManyAsync: (ips, options) => asyncBatch(ips, options, lookup),
    lookupManySettledAsync: (ips, options) =>
      asyncBatch(ips, options, async (ip): Promise<BatchItem<R>> => {
        try {
          return { ok: true, value: await lookup(ip) };
        } catch (cause) {
          return { ok: false, error: adapterError(cause) };
        }
      }),
    closeAsync() {
      if (closing) return closing;
      isClosed = true;
      closing = Promise.allSettled(active).then(async () => {
        if (config.ownership === "owned" && adapter.closeAsync) {
          try {
            const pending = adapter.closeAsync();
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
