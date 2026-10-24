import { readFileSync } from "node:fs";
import { createLoader, fileError, type LocalPath } from "./shared.js";

declare const Bun: { file(path: string | URL): { arrayBuffer(): Promise<ArrayBuffer> } };
export type { LocalPath, DatabaseOptions, IP2RegionOptions } from "./shared.js";

export async function readBytes(path: LocalPath): Promise<Uint8Array> {
  try {
    return new Uint8Array(await Bun.file(path).arrayBuffer());
  } catch (cause) {
    throw fileError(cause, path, "bun");
  }
}

export function readBytesSync(path: LocalPath): Uint8Array {
  try {
    return readFileSync(path);
  } catch (cause) {
    throw fileError(cause, path, "bun");
  }
}

export const IP2Region = createLoader(readBytes, readBytesSync);
export type IP2Region = InstanceType<typeof IP2Region>;
