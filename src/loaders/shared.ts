import { IP2RegionError } from "../core/errors.js";
import { createLookup } from "../core/lookup.js";
import type { Adapter, AddressFamily, LookupOptions, LookupResult } from "../core/types.js";
import { createXDB, IP2REGION_FIELDS, type XDBResult } from "../formats/ip2region-xdb.js";
import { bundledMetadata, bundledFiles } from "../bundled.js";

export type LocalPath = string | URL;
export type ReaderFactory<R extends LookupResult> = (bytes: Uint8Array) => Adapter<R>;
export interface DefaultOptions extends Omit<LookupOptions, "ownership"> {
  /** Nonempty, distinct address families to load. Default: both IPv4 and IPv6. */
  families?: readonly AddressFamily[];
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

export function createLoader(readBytes: (path: LocalPath) => Promise<Uint8Array>) {
  async function openDatabase<R extends LookupResult>(
    path: LocalPath,
    factory: ReaderFactory<R>,
    options: Omit<LookupOptions, "ownership"> = {}
  ) {
    if (typeof factory !== "function") throw new IP2RegionError("INVALID_ARGUMENT", "Expected a byte reader factory");
    const bytes = await readBytes(path);
    const adapter = factory(bytes);
    try {
      return createLookup(adapter, { ...options, ownership: "owned" });
    } catch (cause) {
      try {
        adapter.close?.();
      } catch {
        /* Preserve the creation error. */
      }
      throw cause;
    }
  }
  async function openDefault(options: DefaultOptions = {}) {
    const { families = [4, 6], ...lookupOptions } = options;
    if (
      !Array.isArray(families) ||
      !families.length ||
      Array.from(families).some((family) => family !== 4 && family !== 6) ||
      new Set(families).size !== families.length
    )
      throw new IP2RegionError("INVALID_ARGUMENT", "Expected distinct address families: [4], [6] or [4, 6]");
    const files = bundledFiles.filter((file) => families.includes(file.family));
    const sources = new Map<AddressFamily, Adapter<XDBResult>>();
    try {
      for (const file of files) {
        const bytes = await readBytes(file.url);
        sources.set(
          file.family,
          createXDB(bytes, {
            fields: IP2REGION_FIELDS,
            metadata: {
              ...bundledMetadata,
              dataVersion: `sha256:${file.sha256}`,
              url: `${bundledMetadata.url.replace("/tree/", "/blob/")}/ip2region_v${file.family}.xdb`,
            },
          })
        );
      }
      return createLookup<XDBResult>(
        {
          metadata: {
            ...bundledMetadata,
            format: "ip2region-xdb",
            loadedAt: new Date().toISOString(),
            datasets: [...sources.values()].map((source) => source.metadata!),
          },
          capabilities: { families: [...sources.keys()], fields: [...sources.values()][0].capabilities!.fields },
          lookup(address, parsed) {
            const source = sources.get(parsed.family);
            if (!source) throw new IP2RegionError("UNSUPPORTED_FAMILY", `IPv${parsed.family} was not loaded`);
            return source.lookup(address, parsed);
          },
          close() {
            for (const source of sources.values()) source.close?.();
          },
        },
        { ...lookupOptions, ownership: "owned" }
      );
    } catch (cause) {
      for (const source of sources.values()) source.close?.();
      throw cause;
    }
  }
  return { openDatabase, openDefault };
}
