import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createLoader, fileError, type LocalPath } from "./shared.js";

export type { LocalPath, DatabaseOptions, DatabasesOptions, IP2RegionOptions } from "./shared.js";

export async function readBytes(path: LocalPath): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (cause) {
    throw fileError(cause, path, "node");
  }
}

export function readBytesSync(path: LocalPath): Uint8Array {
  try {
    return readFileSync(path);
  } catch (cause) {
    throw fileError(cause, path, "node");
  }
}

export const IP2Region = createLoader(readBytes, readBytesSync);
export type IP2Region = InstanceType<typeof IP2Region>;
