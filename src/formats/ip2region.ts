import type { Adapter, LookupResult } from "../core/types.js";
import { IP2RegionError } from "../core/errors.js";
import { parseIP } from "../core/ip.js";
import { Bytes, field, metadata, type ReaderOptions } from "./bytes.js";

export type { ReaderOptions } from "./bytes.js";

export interface IP2RegionResult extends LookupResult {
  extensions: { cityId: number; region: string };
}

/** The legacy ip2region IPv4 .db format, not XDB, IPIP IPDB or QQWry DAT. */
export function createIP2Region(input: Uint8Array, options: ReaderOptions = {}): Adapter<IP2RegionResult> {
  const reader = new Bytes(input, "ip2region-db");
  reader.check(0, 8);
  const first = reader.u32(0, true);
  const last = reader.u32(4, true);
  if (first < 8 || last < first || (last - first) % 12 !== 0) reader.fail("invalid index header");
  reader.check(first, last - first + 12);
  const count = (last - first) / 12 + 1;
  let previous = -1;
  for (let i = 0; i < count; i++) {
    const at = first + i * 12;
    const start = reader.u32(at, true);
    const end = reader.u32(at + 4, true);
    if (start <= previous || end < start) reader.fail("unsorted or overlapping IP ranges", at);
    previous = end;
    const data = reader.u32(at + 8, true);
    const size = data >>> 24;
    if (size < 4) reader.fail("invalid record length", at + 8);
    const pointer = data & 0xffffff;
    if (pointer < 8 || (pointer < last + 12 && pointer + size > first))
      reader.fail("record overlaps index or header", pointer);
    reader.check(pointer, size);
  }
  const info = metadata("ip2region-db", options);
  return {
    metadata: info,
    capabilities: { families: [4], fields: ["country.name", "subdivisions.name", "city.name", "isp"] },
    lookup(address, parsed = parseIP(address)) {
      reader.check(0, 0);
      if (parsed.family !== 4) throw new IP2RegionError("UNSUPPORTED_FAMILY", "ip2region-db supports IPv4 only");
      const ip = Number(parsed.value);
      let low = 0;
      let high = count - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const at = first + mid * 12;
        const start = reader.u32(at, true);
        const end = reader.u32(at + 4, true);
        if (ip < start) {
          high = mid - 1;
          continue;
        }
        if (ip > end) {
          low = mid + 1;
          continue;
        }
        const packed = reader.u32(at + 8, true);
        const pointer = packed & 0xffffff;
        const region = reader.text(pointer + 4, (packed >>> 24) - 4);
        const fields = region.split("|");
        if (fields.length !== 5) reader.fail("expected five delimited region fields", pointer);
        const [country, , subdivision, city, isp] = fields.map(field);
        return {
          ...(country ? { country: { name: country } } : {}),
          ...(subdivision ? { subdivisions: [{ name: subdivision }] } : {}),
          ...(city ? { city: { name: city } } : {}),
          ...(isp ? { isp } : {}),
          source: info.id,
          extensions: { cityId: reader.u32(pointer, true), region },
        };
      }
      return null;
    },
    close: () => reader.close(),
  };
}
