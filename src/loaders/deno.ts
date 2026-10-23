import { createLoader, fileError, type LocalPath } from "./shared.js";

declare const Deno: { readFile(path: string | URL): Promise<Uint8Array> };
export type { LocalPath, ReaderFactory, DefaultOptions } from "./shared.js";

export async function readBytes(path: LocalPath): Promise<Uint8Array> {
  try {
    return await Deno.readFile(path);
  } catch (cause) {
    throw fileError(cause, path, "deno");
  }
}

export const { openDatabase, openDefault } = createLoader(readBytes);
