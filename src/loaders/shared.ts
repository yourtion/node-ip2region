import { IP2RegionError } from "../core/errors.js";
import { IP2Region as MemoryIP2Region } from "../core/client.js";
import { normalizeLookupOptions } from "../core/lookup.js";
import type { Adapter, AddressFamily, LookupOptions, LookupResult, Source } from "../core/types.js";
import { createXDB, IP2REGION_FIELDS, type XDBOptions } from "../formats/ip2region-xdb.js";
import { createBIN, type ReaderOptions } from "../formats/ip2location-bin.js";
import { createIPIP } from "../formats/ipip-ipdb.js";
import { bundledMetadata, bundledFiles } from "../bundled.js";

export type LocalPath = string | URL;
type DatabaseInput = { path: LocalPath; data?: never } | { data: Uint8Array; path?: never };
export type DatabaseOptions = DatabaseInput &
  ReaderOptions &
  (
    | { format: "xdb"; fields?: XDBOptions["fields"]; language?: never }
    | { format: "bin"; fields?: never; language?: never }
    | { format: "ipip"; language?: string; fields?: never }
  );

/** Explicit routing; a dual-family reader can be assigned to either slot. */
export type DatabasesOptions =
  | { 4: DatabaseOptions; 6?: DatabaseOptions }
  | { 4?: DatabaseOptions; 6: DatabaseOptions };

export type IP2RegionOptions = Omit<LookupOptions, "ownership"> &
  (
    | { families?: readonly AddressFamily[]; database?: never; databases?: never; source?: never; ownership?: never }
    | { database: DatabaseOptions; databases?: never; families?: never; source?: never; ownership?: never }
    | { databases: DatabasesOptions; database?: never; families?: never; source?: never; ownership?: never }
    | { source: Source; ownership?: LookupOptions["ownership"]; database?: never; databases?: never; families?: never }
  );

export interface IP2RegionConstructor {
  new (options?: IP2RegionOptions): MemoryIP2Region;
  open(options?: IP2RegionOptions): Promise<MemoryIP2Region>;
}

export function fileError(cause: unknown, path: LocalPath, runtime: string): IP2RegionError {
  const error = cause as { code?: string; name?: string };
  const code = error?.code ?? error?.name;
  return new IP2RegionError(
    ["EACCES", "EPERM", "ERR_ACCESS_DENIED", "PermissionDenied", "NotCapable"].includes(code ?? "")
      ? "PERMISSION_DENIED"
      : ["ENOENT", "NotFound"].includes(code ?? "")
        ? "FILE_NOT_FOUND"
        : "IO_ERROR",
    `Unable to read local database: ${String(path)}`,
    { cause, details: { runtime, path: String(path) } }
  );
}

function invalid(message: string): never {
  throw new IP2RegionError("INVALID_ARGUMENT", message);
}

function validateDatabase(database: DatabaseOptions): DatabaseOptions {
  if (
    !database ||
    typeof database !== "object" ||
    Array.isArray(database) ||
    !["xdb", "bin", "ipip"].includes(database.format)
  )
    invalid("database needs format: xdb, bin or ipip");
  const hasPath = Object.hasOwn(database, "path");
  const hasData = Object.hasOwn(database, "data");
  if (hasPath === hasData) invalid("database requires exactly one of path or data");
  if (hasPath && !(typeof database.path === "string" || database.path instanceof URL))
    invalid("database.path must be a local path or file URL");
  if (hasData && !(database.data instanceof Uint8Array)) invalid("database.data must be a Uint8Array");
  if (database.format !== "xdb" && Object.hasOwn(database, "fields")) invalid("fields configures XDB only");
  if (database.format !== "ipip" && Object.hasOwn(database, "language")) invalid("language configures IPIP only");
  if (database.format === "xdb" && database.fields != null) {
    const fields = database.fields;
    if (
      !Array.isArray(fields) ||
      !fields.length ||
      Array.from(fields).some(
        (name) => typeof name !== "string" || !name || ["__proto__", "constructor", "prototype"].includes(name)
      ) ||
      new Set(fields).size !== fields.length
    )
      invalid("XDB fields must be distinct nonempty column names or null");
  }
  if (database.format === "ipip" && database.language !== undefined && typeof database.language !== "string")
    invalid("IPIP language must be a string");
  if (
    database.metadata !== undefined &&
    (!database.metadata ||
      typeof database.metadata !== "object" ||
      Array.isArray(database.metadata) ||
      (database.metadata.id !== undefined && (typeof database.metadata.id !== "string" || !database.metadata.id)))
  )
    invalid("Database metadata must be an object with a nonempty id when provided");
  return database;
}

function validate(options: IP2RegionOptions) {
  const normalized = normalizeLookupOptions(options);
  const hasSource = Object.hasOwn(options, "source");
  const hasDatabase = Object.hasOwn(options, "database");
  const hasDatabases = Object.hasOwn(options, "databases");
  if ([hasSource, hasDatabase, hasDatabases, Object.hasOwn(options, "families")].filter(Boolean).length > 1)
    invalid("source, database, databases and bundled families are mutually exclusive");
  if (!hasSource && Object.hasOwn(options, "ownership"))
    invalid("Database readers are owned automatically; ownership configures custom sources only");
  if (hasSource) return { kind: "source", source: options.source!, options: normalized } as const;
  if (hasDatabase) {
    return { kind: "database", database: validateDatabase(options.database!), options: normalized } as const;
  }
  if (hasDatabases) {
    const databases = options.databases;
    if (!databases || typeof databases !== "object" || Array.isArray(databases))
      invalid("databases must be a nonempty map of address families 4 and 6");
    const keys = Reflect.ownKeys(databases);
    if (!keys.length || keys.some((key) => key !== "4" && key !== "6"))
      invalid("databases must contain only address family keys 4 and 6");
    const entries = keys.map((key) => {
      const family = Number(key) as AddressFamily;
      return [family, validateDatabase(databases[family]!)] as const;
    });
    return { kind: "databases", entries, options: normalized } as const;
  }
  const families = options.families === undefined ? [4, 6] : options.families;
  if (
    !Array.isArray(families) ||
    !families.length ||
    Array.from(families).some((family) => family !== 4 && family !== 6) ||
    new Set(families).size !== families.length
  )
    invalid("Expected distinct address families: [4], [6] or [4, 6]");
  return {
    kind: "bundled",
    files: bundledFiles.filter((file) => families.includes(file.family)),
    options: normalized,
  } as const;
}

function reader(bytes: Uint8Array, database: DatabaseOptions): Adapter {
  switch (database.format) {
    case "xdb":
      return createXDB(bytes, database);
    case "bin":
      return createBIN(bytes, database);
    case "ipip":
      return createIPIP(bytes, database);
  }
}

function bundledReader(bytes: Uint8Array, file: (typeof bundledFiles)[number]): Adapter {
  return createXDB(bytes, {
    fields: IP2REGION_FIELDS,
    metadata: {
      ...bundledMetadata,
      dataVersion: `sha256:${file.sha256}`,
      url: `${bundledMetadata.url.replace("/tree/", "/blob/")}/ip2region_v${file.family}.xdb`,
    },
  });
}

function combined(sources: Map<AddressFamily, Adapter>, bundled = true): Adapter {
  const readers = [...new Set(sources.values())];
  const fields = [...new Set(readers.flatMap((source) => source.capabilities?.fields ?? []))];
  const languages = [...new Set(readers.flatMap((source) => source.capabilities?.languages ?? []))];
  let isClosed = false;
  return {
    metadata: {
      ...(bundled ? { ...bundledMetadata, format: "ip2region-xdb" } : { id: "custom-databases" }),
      loadedAt: new Date().toISOString(),
      datasets: readers.map((source) => source.metadata!),
    },
    capabilities: { families: [...sources.keys()], fields, ...(languages.length ? { languages } : {}) },
    lookup(address, parsed) {
      const source = sources.get(parsed.family);
      if (!source) throw new IP2RegionError("UNSUPPORTED_FAMILY", `IPv${parsed.family} was not loaded`);
      return source.lookup(address, parsed);
    },
    close() {
      if (isClosed) return;
      isClosed = true;
      let failed = false;
      let failure: unknown;
      for (const source of readers) {
        try {
          source.close?.();
        } catch (cause) {
          if (!failed) failure = cause;
          failed = true;
        }
      }
      if (failed) throw failure;
    },
  };
}

function dispose(sources: Iterable<Adapter>) {
  for (const source of sources) {
    try {
      source.close?.();
    } catch {
      /* Preserve the loading error. */
    }
  }
}

/** Build a native class with explicit synchronous construction and asynchronous opening. */
export function createLoader(
  readBytes: (path: LocalPath) => Promise<Uint8Array>,
  readBytesSync: (path: LocalPath) => Uint8Array
): IP2RegionConstructor {
  return class IP2Region extends MemoryIP2Region<LookupResult> {
    constructor(options: IP2RegionOptions = {}) {
      const config = validate(options);
      if (config.kind === "source") {
        super({ source: config.source, ...config.options });
        return;
      }
      const sources = new Map<AddressFamily, Adapter>();
      let source: Adapter | undefined;
      try {
        if (config.kind === "database") {
          const database = config.database;
          source = reader(database.data ?? readBytesSync(database.path!), database);
        } else if (config.kind === "databases") {
          for (const [family, database] of config.entries) {
            const loaded = reader(database.data ?? readBytesSync(database.path!), database);
            sources.set(family, loaded);
            if (!loaded.capabilities?.families?.includes(family))
              invalid(`Database assigned to IPv${family} does not support that address family`);
          }
          source = combined(sources, false);
        } else {
          for (const file of config.files) sources.set(file.family, bundledReader(readBytesSync(file.url), file));
          source = combined(sources);
        }
        super({ source, mappedIPv6: config.options.mappedIPv6, ownership: "owned" });
      } catch (cause) {
        dispose(source ? [source] : sources.values());
        throw cause;
      }
    }

    static async open(options: IP2RegionOptions = {}): Promise<IP2Region> {
      const config = validate(options);
      if (config.kind === "source") return new IP2Region(options);
      const sources = new Map<AddressFamily, Adapter>();
      let source: Adapter | undefined;
      try {
        if (config.kind === "database") {
          const database = config.database;
          source = reader(database.data ?? (await readBytes(database.path!)), database);
        } else if (config.kind === "databases") {
          for (const [family, database] of config.entries) {
            const loaded = reader(database.data ?? (await readBytes(database.path!)), database);
            sources.set(family, loaded);
            if (!loaded.capabilities?.families?.includes(family))
              invalid(`Database assigned to IPv${family} does not support that address family`);
          }
          source = combined(sources, false);
        } else {
          for (const file of config.files) sources.set(file.family, bundledReader(await readBytes(file.url), file));
          source = combined(sources);
        }
        return new IP2Region({ source, mappedIPv6: config.options.mappedIPv6, ownership: "owned" });
      } catch (cause) {
        dispose(source ? [source] : sources.values());
        throw cause;
      }
    }
  };
}
