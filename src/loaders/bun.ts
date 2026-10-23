import { createLoader, fileError, type LocalPath } from "./shared.js";

declare const Bun: { file(path: string | URL): { arrayBuffer(): Promise<ArrayBuffer> } };
export type { LocalPath, ReaderFactory } from "./shared.js";

export async function readBytes(path: LocalPath): Promise<Uint8Array> {
  try {
    return new Uint8Array(await Bun.file(path).arrayBuffer());
  } catch (cause) {
    throw fileError(cause, path, "bun");
  }
}

export const { openDatabase, openDefault } = createLoader(readBytes);
