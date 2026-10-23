import { readFile } from "node:fs/promises";
import { createLoader, fileError, type LocalPath } from "./shared.js";

export type { LocalPath, ReaderFactory, DefaultOptions } from "./shared.js";

export async function readBytes(path: LocalPath): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (cause) {
    throw fileError(cause, path, "node");
  }
}

export const { openDatabase, openDefault } = createLoader(readBytes);
