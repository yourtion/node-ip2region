/** Standard results contain JSON-compatible values. Missing fields are omitted. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface Place {
  code?: string;
  name?: string;
}

export interface LookupResult {
  country?: Place;
  subdivisions?: Place[];
  city?: Place;
  isp?: string;
  asn?: number;
  organization?: string;
  source?: string;
  extensions?: { [key: string]: JsonValue };
}

export type AddressFamily = 4 | 6;

/** Network-order bytes and the complete unsigned address, never a truncated IPv6. */
export interface ParsedIP {
  readonly address: string;
  readonly family: AddressFamily;
  readonly bytes: Uint8Array;
  readonly value: bigint;
  readonly mappedIPv4?: string;
}

export interface Capabilities {
  readonly families?: readonly AddressFamily[];
  readonly languages?: readonly string[];
  readonly fields?: readonly string[];
}

export interface SourceMetadata {
  /** Per-file provenance for a source composed of multiple databases. */
  readonly datasets?: readonly SourceMetadata[];
  readonly id: string;
  readonly format?: string;
  readonly dataVersion?: string;
  readonly builtAt?: string;
  readonly loadedAt?: string;
  readonly attribution?: string;
  readonly url?: string;
}

export type LookupFunction<R extends LookupResult = LookupResult> = (ip: string, parsed: ParsedIP) => R | null;
export type AsyncLookupFunction<R extends LookupResult = LookupResult> = (
  ip: string,
  parsed: ParsedIP
) => Promise<R | null>;

export interface Adapter<R extends LookupResult = LookupResult> {
  lookup: LookupFunction<R>;
  close?(): void;
  readonly capabilities?: Capabilities;
  readonly metadata?: SourceMetadata;
}

export interface AsyncAdapter<R extends LookupResult = LookupResult> {
  lookupAsync: AsyncLookupFunction<R>;
  closeAsync?(): Promise<void>;
  readonly capabilities?: Capabilities;
  readonly metadata?: SourceMetadata;
}

export type Source<R extends LookupResult = LookupResult> = LookupFunction<R> | Adapter<R>;
export type AsyncSource<R extends LookupResult = LookupResult> = AsyncLookupFunction<R> | AsyncAdapter<R>;

export interface LookupOptions {
  /** Borrowed sources are never closed by the wrapper. */
  ownership?: "borrowed" | "owned";
  /** Only the exact ::ffff:0:0/96 prefix can be converted. Default: preserve. */
  mappedIPv6?: "preserve" | "ipv4";
}

export type BatchItem<R> = { ok: true; value: R | null } | { ok: false; error: import("./errors.js").IP2RegionError };

export interface Lookup<R extends LookupResult = LookupResult> {
  readonly capabilities?: Capabilities;
  readonly metadata?: SourceMetadata;
  lookup(ip: string): R | null;
  lookupMany(ips: Iterable<string>): (R | null)[];
  lookupManySettled(ips: Iterable<string>): BatchItem<R>[];
  close(): void;
}

export interface AsyncLookup<R extends LookupResult = LookupResult> {
  readonly capabilities?: Capabilities;
  readonly metadata?: SourceMetadata;
  lookupAsync(ip: string): Promise<R | null>;
  lookupManyAsync(ips: Iterable<string>): Promise<(R | null)[]>;
  lookupManySettledAsync(ips: Iterable<string>): Promise<BatchItem<R>[]>;
  /** Reject new work immediately, finish active work, then close the owned source. */
  closeAsync(): Promise<void>;
}

/** A custom source is borrowed unless ownership is explicitly transferred. */
export interface IP2RegionOptions<R extends LookupResult = LookupResult> extends LookupOptions {
  source: Source<R>;
}

export interface AsyncIP2RegionOptions<R extends LookupResult = LookupResult> extends LookupOptions {
  source: AsyncSource<R>;
}
