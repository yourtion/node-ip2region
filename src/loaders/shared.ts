import { IP2RegionError } from "../core/errors.js";
import { createLookup } from "../core/lookup.js";
import type { Adapter, LookupOptions, LookupResult } from "../core/types.js";
import { createIP2Region } from "../formats/ip2region.js";
import { bundledMetadata, bundledURL } from "../bundled.js";

export type LocalPath = string | URL;
export type ReaderFactory<R extends LookupResult> = (bytes: Uint8Array) => Adapter<R>;

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
  const openDefault = (options: Omit<LookupOptions, "ownership"> = {}) =>
    openDatabase(bundledURL, (bytes) => createIP2Region(bytes, { metadata: bundledMetadata }), options);
  return { openDatabase, openDefault };
}
