import { IP2RegionError } from "../core/errors.js";
import { parseIP } from "../core/ip.js";
import type { Adapter, AddressFamily, LookupResult, ParsedIP } from "../core/types.js";
import { Bytes, field, metadata, type ReaderOptions } from "./bytes.js";

export interface IPIPOptions extends ReaderOptions {
  language?: string;
}
export interface IPIPResult extends LookupResult {
  extensions: { raw: Record<string, string>; language: string };
}

interface Header {
  node_count: number;
  total_size: number;
  ip_version: number;
  fields: string[];
  languages: Record<string, number>;
  build?: number;
}

/** IPIP's metadata + binary trie format, including nmgliangwei/qqwry.ipdb. */
export function createIPIP(input: Uint8Array, options: IPIPOptions = {}): Adapter<IPIPResult> {
  const reader = new Bytes(input, "ipip-ipdb");
  const metaSize = reader.u32(0);
  if (!metaSize) reader.fail("empty metadata");
  let header: Header;
  try {
    header = JSON.parse(reader.text(4, metaSize));
  } catch (cause) {
    if (cause instanceof IP2RegionError) throw cause;
    throw new IP2RegionError("INVALID_DATABASE", "ipip-ipdb: invalid metadata JSON", {
      cause,
      details: { format: "ipip-ipdb", offset: 4 },
    });
  }
  const integer = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
  if (
    !header ||
    typeof header !== "object" ||
    !integer(header.node_count) ||
    header.node_count < 1 ||
    !integer(header.total_size) ||
    header.total_size !== reader.length - metaSize - 4 ||
    header.node_count * 8 >= header.total_size ||
    ![1, 2, 3].includes(header.ip_version) ||
    !Array.isArray(header.fields) ||
    !header.fields.length ||
    !header.fields.every((f) => typeof f === "string" && f.length > 0) ||
    new Set(header.fields).size !== header.fields.length ||
    !header.languages ||
    typeof header.languages !== "object" ||
    Array.isArray(header.languages) ||
    !Object.keys(header.languages).length ||
    !Object.entries(header.languages).every(([key, offset]) => key.length > 0 && integer(offset))
  ) {
    reader.fail("invalid metadata structure", 4);
  }
  const language = options.language ?? "CN";
  if (!Object.hasOwn(header.languages, language))
    throw new IP2RegionError("UNSUPPORTED_LANGUAGE", `ipip-ipdb: language ${language} is not available`);
  const body = metaSize + 4;
  const nodes = header.node_count;
  const fields = header.fields;
  const requiredFields = Math.max(...Object.values(header.languages).map((offset) => offset + fields.length));
  const recordAt = (node: number) => body + nodes * 8 + node - nodes;
  for (let i = 0; i < nodes * 2; i++) {
    const child = reader.u32(body + i * 4);
    if (child > nodes) {
      const at = recordAt(child);
      const size = reader.u16(at);
      reader.check(at + 2, size);
    }
  }
  const step = (node: number, side: number) => reader.u32(body + node * 8 + side * 4);
  const walk = (initial: number, bytes: Uint8Array, bits: number) => {
    let node = initial;
    const seen = new Set<number>();
    for (let bit = 0; bit < bits && node < nodes; bit++) {
      if (seen.has(node)) reader.fail("cyclic trie");
      seen.add(node);
      node = step(node, (bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    return node;
  };
  const families: AddressFamily[] = [];
  if (header.ip_version & 1) families.push(4);
  if (header.ip_version & 2) families.push(6);
  const mappedPrefix = new Uint8Array(12);
  mappedPrefix[10] = 255;
  mappedPrefix[11] = 255;
  const v4root = families.includes(4) ? walk(0, mappedPrefix, 96) : nodes;
  const info = metadata("ipip-ipdb", options);
  let builtAt: string | undefined;
  if (header.build !== undefined) {
    if (!integer(header.build) || header.build > 8640000000000) reader.fail("invalid build timestamp");
    builtAt = new Date(header.build * 1000).toISOString();
  }
  const commonFields: string[] = [];
  for (const [raw, target] of Object.entries({
    country_name: "country.name",
    country_code: "country.code",
    region_name: "subdivisions.name",
    city_name: "city.name",
    isp_domain: "isp",
    isp_name: "isp",
    asn: "asn",
    asn_organization: "organization",
    as_name: "organization",
    organization: "organization",
  })) {
    if (fields.includes(raw) && !commonFields.includes(target)) commonFields.push(target);
  }
  return {
    metadata: { ...info, ...(builtAt ? { builtAt } : {}) },
    capabilities: { families, languages: Object.keys(header.languages), fields: commonFields },
    lookup(address: string, parsed: ParsedIP = parseIP(address)) {
      reader.check(0, 0);
      if (!families.includes(parsed.family))
        throw new IP2RegionError("UNSUPPORTED_FAMILY", `ipip-ipdb does not support IPv${parsed.family}`);
      const node = walk(parsed.family === 4 ? v4root : 0, parsed.bytes, parsed.family === 4 ? 32 : 128);
      if (node === nodes) return null;
      if (node < nodes) reader.fail("trie exceeds address width");
      const at = recordAt(node);
      const values = reader.text(at + 2, reader.u16(at)).split("\t");
      if (values.length < requiredFields) reader.fail("record is missing language fields", at);
      const offset = header.languages[language];
      const raw = Object.fromEntries(fields.map((name, i) => [name, values[offset + i]]));
      const name = field(raw.country_name);
      const code = field(raw.country_code);
      const region = field(raw.region_name);
      const city = field(raw.city_name);
      const isp = field(raw.isp_domain) ?? field(raw.isp_name);
      const organization = field(raw.asn_organization) ?? field(raw.as_name) ?? field(raw.organization);
      const asnText = field(raw.asn);
      let asn: number | undefined;
      if (asnText) {
        if (!/^(?:AS)?[0-9]+$/i.test(asnText)) reader.fail("invalid ASN", at);
        asn = Number(asnText.replace(/^AS/i, ""));
        if (!Number.isSafeInteger(asn) || asn > 4294967295) reader.fail("invalid ASN", at);
      }
      return {
        ...(name || code ? { country: { ...(name ? { name } : {}), ...(code ? { code } : {}) } } : {}),
        ...(region ? { subdivisions: [{ name: region }] } : {}),
        ...(city ? { city: { name: city } } : {}),
        ...(isp ? { isp } : {}),
        ...(asn === undefined ? {} : { asn }),
        ...(organization ? { organization } : {}),
        source: info.id,
        extensions: { raw, language },
      };
    },
    close: () => reader.close(),
  };
}
