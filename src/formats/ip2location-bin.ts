import { IP2RegionError } from "../core/errors.js";
import { parseIP } from "../core/ip.js";
import type { Adapter, AddressFamily, LookupResult, ParsedIP } from "../core/types.js";
import { Bytes, field, metadata, type ReaderOptions } from "./bytes.js";

export type { ReaderOptions } from "./bytes.js";
export interface BINResult extends LookupResult {
  extensions: { databaseType: number; raw: Record<string, string> };
}

// Published BIN product column positions, checked against IP2Location 9.8.0.
const ISP = [0, 0, 3, 0, 5, 0, 7, 5, 7, 0, 8, 0, 9, 0, 9, 0, 9, 0, 9, 7, 9, 0, 9, 7, 9, 9, 9];
interface Table {
  family: AddressFamily;
  base: number;
  count: number;
  stride: number;
  width: number;
}

/** A shared memory reader; no dependency on the Node-only vendor library. */
export function createBIN(input: Uint8Array, options: ReaderOptions = {}): Adapter<BINResult> {
  const reader = new Bytes(input, "ip2location-bin");
  reader.check(0, 64);
  const type = reader.u8(0);
  const columns = reader.u8(1);
  const year = reader.u8(2);
  const month = reader.u8(3);
  const day = reader.u8(4);
  const date = new Date(Date.UTC(2000 + year, month - 1, day));
  if (
    type < 1 ||
    type > 26 ||
    columns < 2 ||
    columns > 32 ||
    date.getUTCFullYear() !== 2000 + year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    (year >= 21 && reader.u8(29) !== 1)
  )
    reader.fail("invalid BIN header");
  const declaredSize = reader.u32(31, true);
  if (declaredSize !== 0 && declaredSize !== reader.length) reader.fail("file size does not match header", 31);
  const positions: Record<string, number> = {
    countryShort: 2,
    countryLong: 2,
    region: type >= 3 ? 3 : 0,
    city: type >= 3 ? 4 : 0,
    isp: ISP[type],
    asn: type === 26 ? 24 : 0,
    as: type === 26 ? 25 : 0,
  };
  if (Math.max(...Object.values(positions)) > columns) reader.fail("database columns do not match product type");
  const tables: Table[] = [];
  const occupied: [number, number][] = [[0, 64]];
  for (const family of [4, 6] as const) {
    const offset = family === 4 ? 5 : 13;
    const count = reader.u32(offset, true);
    const base = reader.u32(offset + 4, true) - 1;
    if (!count) continue;
    const width = family === 4 ? 4 : 16;
    const stride = width + (columns - 1) * 4;
    if (base < 64) reader.fail("invalid table base", offset + 4);
    reader.check(base, count * stride + width);
    occupied.push([base, base + count * stride + width]);
    let previous = -1n;
    for (let i = 0; i <= count; i++) {
      const value = reader.unsigned(base + i * stride, width, true);
      if (value <= previous) reader.fail("unsorted address table", base + i * stride);
      previous = value;
    }
    const index = reader.u32(family === 4 ? 21 : 25, true);
    if (index) {
      reader.check(index - 1, 65536 * 8);
      occupied.push([index - 1, index - 1 + 65536 * 8]);
      for (let i = 0; i < 65536; i++) {
        const low = reader.u32(index - 1 + i * 8, true);
        const high = reader.u32(index - 1 + i * 8 + 4, true);
        if (low > high || high > count) reader.fail("invalid optional index bounds", index - 1 + i * 8);
      }
    }
    tables.push({ family, base, count, stride, width });
  }
  if (!tables.length) reader.fail("database contains no address table");
  if (tables.length === 2) {
    const [a, b] = tables;
    if (a.base < b.base + b.count * b.stride + b.width && b.base < a.base + a.count * a.stride + a.width)
      reader.fail("overlapping address tables");
  }
  const info = { ...metadata("ip2location-bin", options), builtAt: date.toISOString().slice(0, 10) };
  const commonFields = ["country.code", "country.name"];
  if (positions.region) commonFields.push("subdivisions.name", "city.name");
  if (positions.isp) commonFields.push("isp");
  if (positions.asn) commonFields.push("asn", "organization");
  const dataRange = (pointer: number, size: number) => {
    reader.check(pointer, size);
    if (occupied.some(([start, end]) => pointer < end && pointer + size > start))
      reader.fail("string overlaps header, address table or prefix index", pointer);
  };
  const stringAt = (pointer: number): string => {
    dataRange(pointer, 1);
    const size = reader.u8(pointer);
    dataRange(pointer, size + 1);
    const text = reader.text(pointer + 1, size);
    if (["MISSING_FILE", "INVALID_IP_ADDRESS", "IPV6_NOT_SUPPORTED"].includes(text))
      reader.fail("reader error sentinel in a data field", pointer);
    return text;
  };
  return {
    metadata: info,
    capabilities: { families: tables.map((t) => t.family), fields: commonFields },
    lookup(address: string, parsed: ParsedIP = parseIP(address)) {
      reader.check(0, 0);
      const table = tables.find((t) => t.family === parsed.family);
      if (!table)
        throw new IP2RegionError("UNSUPPORTED_FAMILY", `ip2location-bin does not support IPv${parsed.family}`);
      const { base, count, stride, width } = table;
      const max = (1n << BigInt(width * 8)) - 1n;
      let low = 0;
      let high = count - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const at = base + mid * stride;
        const start = reader.unsigned(at, width, true);
        const end = reader.unsigned(at + stride, width, true);
        if (parsed.value < start) {
          high = mid - 1;
          continue;
        }
        if (parsed.value >= end && !(mid === count - 1 && end === max && parsed.value === max)) {
          low = mid + 1;
          continue;
        }
        const raw: Record<string, string> = {};
        for (const [key, column] of Object.entries(positions)) {
          if (!column) continue;
          const pointer = reader.u32(at + width + (column - 2) * 4, true);
          if (key === "countryLong") {
            if (reader.u8(pointer) !== 2) reader.fail("country code must contain two bytes", pointer);
            raw[key] = stringAt(pointer + 3);
          } else raw[key] = stringAt(pointer);
        }
        const clean = (key: string) => {
          const value = field(raw[key]);
          return value?.startsWith("This parameter is unavailable") ? undefined : value;
        };
        const code = clean("countryShort");
        const name = clean("countryLong");
        const region = clean("region");
        const city = clean("city");
        const isp = clean("isp");
        const organization = clean("as");
        const text = clean("asn");
        let asn: number | undefined;
        if (text) {
          if (!/^[0-9]+$/.test(text) || Number(text) > 4294967295) reader.fail("invalid ASN", at);
          asn = Number(text);
        }
        return {
          ...(name || code ? { country: { ...(name ? { name } : {}), ...(code ? { code } : {}) } } : {}),
          ...(region ? { subdivisions: [{ name: region }] } : {}),
          ...(city ? { city: { name: city } } : {}),
          ...(isp ? { isp } : {}),
          ...(asn === undefined ? {} : { asn }),
          ...(organization ? { organization } : {}),
          source: info.id,
          extensions: { databaseType: type, raw },
        };
      }
      return null;
    },
    close: () => reader.close(),
  };
}
