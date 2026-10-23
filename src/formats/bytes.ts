import { IP2RegionError } from "../core/errors.js";
import type { SourceMetadata } from "../core/types.js";

export interface ReaderOptions {
  metadata?: Partial<Omit<SourceMetadata, "format" | "loadedAt">>;
}

export function metadata(format: string, options: ReaderOptions): SourceMetadata {
  return { ...options.metadata, id: options.metadata?.id ?? format, format, loadedAt: new Date().toISOString() };
}

export class Bytes {
  private data?: Uint8Array;
  private view?: DataView;
  readonly length: number;
  private decoder = new TextDecoder("utf-8", { fatal: true });

  constructor(
    input: Uint8Array,
    readonly format: string
  ) {
    if (!(input instanceof Uint8Array)) throw new IP2RegionError("INVALID_ARGUMENT", `${format}: expected Uint8Array`);
    // Uint8Array's constructor copies exactly the view, including Buffer views.
    this.data = new Uint8Array(input);
    this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    this.length = this.data.byteLength;
  }

  fail(message: string, offset?: number): never {
    throw new IP2RegionError("INVALID_DATABASE", `${this.format}: ${message}`, {
      details: { format: this.format, ...(offset === undefined ? {} : { offset }) },
    });
  }

  check(offset: number, size: number): void {
    if (!this.data) throw new IP2RegionError("CLOSED", `${this.format}: reader is closed`);
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(size) ||
      offset < 0 ||
      size < 0 ||
      offset + size > this.length
    )
      this.fail("read outside database", offset);
  }

  u8(offset: number): number {
    this.check(offset, 1);
    return this.view!.getUint8(offset);
  }
  u16(offset: number, little = false): number {
    this.check(offset, 2);
    return this.view!.getUint16(offset, little);
  }
  u32(offset: number, little = false): number {
    this.check(offset, 4);
    return this.view!.getUint32(offset, little);
  }

  unsigned(offset: number, width: number, little = false): bigint {
    this.check(offset, width);
    let result = 0n;
    for (let i = 0; i < width; i++) result = (result << 8n) | BigInt(this.data![offset + (little ? width - i - 1 : i)]);
    return result;
  }

  text(offset: number, size: number): string {
    this.check(offset, size);
    try {
      return this.decoder.decode(this.data!.subarray(offset, offset + size));
    } catch {
      this.fail("invalid UTF-8 string", offset);
    }
  }

  close(): void {
    this.data = undefined;
    this.view = undefined;
  }
}

export function field(value: string | undefined): string | undefined {
  return value === undefined || ["", "0", "-", "--", "?", "未知", "unknown"].includes(value) ? undefined : value;
}
