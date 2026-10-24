import { IP2RegionError } from "./errors.js";
import { createLookup, createAsyncLookup } from "./lookup.js";
import type {
  IP2RegionOptions,
  AsyncIP2RegionOptions,
  Lookup,
  AsyncLookup,
  LookupResult,
  Capabilities,
  SourceMetadata,
} from "./types.js";

function checkOptions(options: unknown): void {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new IP2RegionError("INVALID_ARGUMENT", "Expected an options object with a source");
  if (Object.hasOwn(options, "database") || Object.hasOwn(options, "families"))
    throw new IP2RegionError("INVALID_ARGUMENT", "Database configuration requires a native runtime entry");
}

/** Memory-only synchronous client. Native entries additionally load database files. */
export class IP2Region<R extends LookupResult = LookupResult> implements Lookup<R> {
  readonly capabilities?: Capabilities;
  readonly metadata?: SourceMetadata;
  readonly lookup: Lookup<R>["lookup"];
  readonly lookupMany: Lookup<R>["lookupMany"];
  readonly lookupManySettled: Lookup<R>["lookupManySettled"];
  readonly close: Lookup<R>["close"];

  constructor(options: IP2RegionOptions<R>) {
    checkOptions(options);
    const { source, ...lookupOptions } = options;
    const query = createLookup(source, lookupOptions);
    this.capabilities = query.capabilities;
    this.metadata = query.metadata;
    this.lookup = query.lookup;
    this.lookupMany = query.lookupMany;
    this.lookupManySettled = query.lookupManySettled;
    this.close = query.close;
  }
}

/** Asynchronous sources expose only explicitly asynchronous query/lifecycle methods. */
export class AsyncIP2Region<R extends LookupResult = LookupResult> implements AsyncLookup<R> {
  readonly capabilities?: Capabilities;
  readonly metadata?: SourceMetadata;
  readonly lookupAsync: AsyncLookup<R>["lookupAsync"];
  readonly lookupManyAsync: AsyncLookup<R>["lookupManyAsync"];
  readonly lookupManySettledAsync: AsyncLookup<R>["lookupManySettledAsync"];
  readonly closeAsync: AsyncLookup<R>["closeAsync"];

  constructor(options: AsyncIP2RegionOptions<R>) {
    checkOptions(options);
    const { source, ...lookupOptions } = options;
    const query = createAsyncLookup(source, lookupOptions);
    this.capabilities = query.capabilities;
    this.metadata = query.metadata;
    this.lookupAsync = query.lookupAsync;
    this.lookupManyAsync = query.lookupManyAsync;
    this.lookupManySettledAsync = query.lookupManySettledAsync;
    this.closeAsync = query.closeAsync;
  }
}
