import { createLoader, fileError, type LocalPath } from "./shared.js";

declare const Deno: { readFile(path: string | URL): Promise<Uint8Array>; readFileSync(path: string | URL): Uint8Array };
export type { LocalPath, DatabaseOptions, DatabasesOptions, IP2RegionOptions } from "./shared.js";

export async function readBytes(path: LocalPath): Promise<Uint8Array> {
  try {
    return await Deno.readFile(path);
  } catch (cause) {
    throw fileError(cause, path, "deno");
  }
}

export function readBytesSync(path: LocalPath): Uint8Array {
  try {
    return Deno.readFileSync(path);
  } catch (cause) {
    throw fileError(cause, path, "deno");
  }
}

export const IP2Region = createLoader(readBytes, readBytesSync);
export type IP2Region = InstanceType<typeof IP2Region>;
