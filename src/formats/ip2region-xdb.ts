import type { Adapter, LookupResult } from "../core/types.js";
import { IP2RegionError } from "../core/errors.js";
import { parseIP } from "../core/ip.js";
import { Bytes, field, metadata, type ReaderOptions } from "./bytes.js";

/** The current upstream bundled-data schema, not a property of the XDB container. */
export const IP2REGION_FIELDS = Object.freeze([
  "country_name",
  "region_name",
  "city_name",
  "isp",
  "country_code",
] as const);

export interface XDBOptions extends ReaderOptions {
  /** Ordered pipe-delimited columns; omitted or null returns an uninterpreted raw record. */
  fields?: readonly string[] | null;
}

export interface XDBResult extends LookupResult {
  extensions: { region: string; raw: Record<string, string> };
}

/** XDB structure 2 (IPv4) and 3 (IPv4/IPv6), vector indexes and 32-bit pointers. */
export function createXDB(input: Uint8Array, options: XDBOptions = {}): Adapter<XDBResult> {
  const reader = new Bytes(input, "ip2region-xdb");
  const fields = options.fields ?? null;
  if (
    fields !== null &&
    (!Array.isArray(fields) ||
      fields.length === 0 ||
      Array.from(fields).some(
        (name) => typeof name !== "string" || !name || ["__proto__", "constructor", "prototype"].includes(name)
      ) ||
      new Set(fields).size !== fields.length)
  )
    throw new IP2RegionError("INVALID_ARGUMENT", "XDB fields must be distinct nonempty column names or null");
  // Copy caller configuration as well as the byte view.
  const columns = fields === null ? null : [...fields];
  const floor = 256 + 65536 * 8;
  reader.check(0, floor);
  const structure = reader.u16(0, true);
  if (structure !== 2 && structure !== 3) reader.fail("unsupported structure version", 0);
  if (reader.u16(2, true) !== 1) reader.fail("unsupported index policy (vector required)", 2);
  const familyId = structure === 2 ? 4 : reader.u16(16, true);
  if (familyId !== 4 && familyId !== 6) reader.fail("invalid address family", 16);
  if (structure === 3 && reader.u16(18, true) !== 4) reader.fail("unsupported pointer width", 18);
  if (reader.length > 0xffffffff) reader.fail("database exceeds 32-bit pointer limit");
  const family = familyId as 4 | 6;
  const width = family === 4 ? 4 : 16;
  const stride = width * 2 + 6;
  const first = reader.u32(8, true);
  const last = reader.u32(12, true);
  if (first < floor || last < first || (last - first) % stride !== 0) reader.fail("invalid segment index bounds", 8);
  reader.check(first, last - first + stride);

  function compareOffsets(a: number, b: number): number {
    // IPv4 addresses are little endian; IPv6 addresses are network byte order.
    for (let i = 0; i < width; i += 4) {
      const left = reader.u32(a + i, family === 4);
      const right = reader.u32(b + i, family === 4);
      if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
  }
  const prefix = (at: number) => (family === 4 ? reader.u32(at, true) >>> 16 : reader.u16(at));
  // Reconstruct vector bounds to reject missing, misaligned or misleading entries.
  let expected = new Uint32Array(65536 * 2);
  for (let at = first; at <= last; at += stride) {
    if (compareOffsets(at, at + width) > 0 || (at > first && compareOffsets(at - stride + width, at) >= 0))
      reader.fail("unsorted or overlapping IP ranges", at);
    const size = reader.u16(at + width * 2, true);
    const pointer = reader.u32(at + width * 2 + 2, true);
    if (size > 0) {
      if (pointer < floor || pointer + size > first) reader.fail("record outside data section", pointer);
      reader.check(pointer, size);
    }
    for (let bucket = prefix(at); bucket <= prefix(at + width); bucket++) {
      if (expected[bucket * 2] === 0) expected[bucket * 2] = at;
      expected[bucket * 2 + 1] = at;
    }
  }
  for (let i = 0; i < expected.length; i++) {
    const actual = reader.u32(256 + i * 4, true);
    // Upstream makers have emitted both inclusive and exclusive upper pointers.
    const exclusive = i % 2 === 1 && expected[i] !== 0 && actual === expected[i] + stride;
    if (actual !== expected[i] && !exclusive) reader.fail("inconsistent vector index", 256 + i * 4);
  }
  const built = reader.u32(4, true);
  const info = metadata("ip2region-xdb", {
    ...options,
    metadata: { ...(built ? { builtAt: new Date(built * 1000).toISOString() } : {}), ...options.metadata },
  });
  const names = new Set(columns ?? []);
  return {
    metadata: info,
    capabilities: {
      families: [family],
      fields: [
        ...(names.has("country_name") ? ["country.name"] : []),
        ...(names.has("country_code") ? ["country.code"] : []),
        ...(names.has("region_name") ? ["subdivisions.name"] : []),
        ...(names.has("city_name") ? ["city.name"] : []),
        ...(names.has("isp") ? ["isp"] : []),
      ],
    },
    lookup(address, parsed = parseIP(address)) {
      reader.check(0, 0);
      if (parsed.family !== family)
        throw new IP2RegionError("UNSUPPORTED_FAMILY", `XDB file supports IPv${family} only`);
      const bucket = parsed.bytes[0] * 256 + parsed.bytes[1];
      const start = expected[bucket * 2];
      if (start === 0) return null;
      let low = 0;
      let high = (expected[bucket * 2 + 1] - start) / stride;
      const compare = (at: number) => {
        for (let i = 0; i < width; i++) {
          const byte = reader.u8(at + (family === 4 ? width - i - 1 : i));
          if (parsed.bytes[i] !== byte) return parsed.bytes[i] < byte ? -1 : 1;
        }
        return 0;
      };
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const at = start + mid * stride;
        if (compare(at) < 0) {
          high = mid - 1;
          continue;
        }
        if (compare(at + width) > 0) {
          low = mid + 1;
          continue;
        }
        const size = reader.u16(at + width * 2, true);
        if (size === 0) return null;
        const pointer = reader.u32(at + width * 2 + 2, true);
        const region = reader.text(pointer, size);
        const raw: Record<string, string> = {};
        if (columns) {
          const values = region.split("|");
          if (values.length !== columns.length) reader.fail("record does not match configured field layout", pointer);
          columns.forEach((name, i) => {
            raw[name] = values[i];
          });
        }
        const place = (value: string | undefined) => (value === "Reserved" ? undefined : field(value));
        const country = place(raw.country_name),
          code = field(raw.country_code);
        const subdivision = place(raw.region_name),
          city = place(raw.city_name),
          isp = field(raw.isp);
        return {
          ...(country || code ? { country: { ...(country ? { name: country } : {}), ...(code ? { code } : {}) } } : {}),
          ...(subdivision ? { subdivisions: [{ name: subdivision }] } : {}),
          ...(city ? { city: { name: city } } : {}),
          ...(isp ? { isp } : {}),
          source: info.id,
          extensions: { region, raw },
        };
      }
      return null;
    },
    close() {
      reader.close();
      expected = new Uint32Array(0);
    },
  };
}
