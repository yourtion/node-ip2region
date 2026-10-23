// Synthetic documentation addresses and invented records, authored for these tests.
// These builders do not import production parsers. No vendor database is included.
const encoder = new TextEncoder();
function concat(parts) {
  const output = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
function u32(bytes, offset, value, little = false) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, little);
}

export function legacyFixture(edges = true) {
  const rows = edges
    ? [
        [0, 0],
        [0xc0000200, 0xc0000202],
        [0xffffffff, 0xffffffff],
      ]
    : [[0xc0000200, 0xc0000202]];
  const raw = encoder.encode("Example|0|Region|First|Example ISP");
  const start = 8 + rows.length * 12;
  const data = new Uint8Array(start + 4 + raw.length);
  u32(data, 0, 8, true);
  u32(data, 4, 8 + (rows.length - 1) * 12, true);
  rows.forEach(([from, to], i) => {
    u32(data, 8 + i * 12, from, true);
    u32(data, 12 + i * 12, to, true);
    u32(data, 16 + i * 12, (raw.length + 4) * 0x1000000 + start, true);
  });
  u32(data, start, 42, true);
  data.set(raw, start + 4);
  return data;
}

export function ipipFixture(options = {}) {
  const fields = options.fields ?? [
    "country_name",
    "country_code",
    "region_name",
    "city_name",
    "isp_domain",
    "asn",
    "asn_organization",
    "extra",
  ];
  const languages = options.languages ?? { CN: 0, EN: fields.length };
  const records = [];
  const networks = [
    [(0xffffn << 32n) | 0xc0000200n, 120, "First"],
    [1n, 128, "Tiny one"],
    [2n, 128, "Tiny two"],
    [(0x20010db8n << 96n) | 1n, 128, "First"],
    [(0x20010db8n << 96n) | 2n, 128, "Second"],
    [0xffffn << 32n, 128, "Zero"],
    [(0xffffn << 32n) | 0xffffffffn, 128, "Maximum"],
    [(1n << 128n) - 1n, 128, "Maximum"],
  ];
  const nodes = [[null, null]];
  for (const [address, prefix, city] of networks) {
    const values = {
      country_name: "Example",
      country_code: "EX",
      region_name: "Region",
      city_name: city,
      isp_domain: "Example ISP",
      asn: "64500",
      asn_organization: "Example AS",
      extra: "kept",
      ...options.values,
    };
    const slots = [];
    for (const [language, offset] of Object.entries(languages)) {
      fields.forEach((name, i) => {
        slots[offset + i] = language === "EN" && name === "country_name" ? "Example (EN)" : (values[name] ?? "");
      });
    }
    const text = encoder.encode(slots.join("\t"));
    const record = new Uint8Array(text.length + 2);
    new DataView(record.buffer).setUint16(0, text.length);
    record.set(text, 2);
    const recordIndex = records.length;
    records.push(record);
    let node = 0;
    for (let i = 127; i >= 128 - prefix; i--) {
      const side = Number((address >> BigInt(i)) & 1n);
      if (i === 128 - prefix) nodes[node][side] = `r${recordIndex}`;
      else {
        if (nodes[node][side] === null) {
          nodes[node][side] = nodes.length;
          nodes.push([null, null]);
        }
        node = nodes[node][side];
      }
    }
  }
  const tree = new Uint8Array(nodes.length * 8);
  const pointers = [];
  let position = 1;
  for (const record of records) {
    pointers.push(nodes.length + position);
    position += record.length;
  }
  nodes.forEach((children, i) =>
    children.forEach((child, side) => {
      u32(
        tree,
        i * 8 + side * 4,
        child === null ? nodes.length : typeof child === "string" ? pointers[Number(child.slice(1))] : child
      );
    })
  );
  const body = concat([tree, new Uint8Array(1), ...records]);
  const metadata = encoder.encode(
    JSON.stringify({
      node_count: nodes.length,
      total_size: body.length,
      ip_version: options.version ?? 3,
      fields,
      languages,
      build: 1704067200,
    })
  );
  const header = new Uint8Array(4);
  u32(header, 0, metadata.length);
  return concat([header, metadata, body]);
}

export function rewriteIPIP(input, edit) {
  const length = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(0);
  const metadata = JSON.parse(new TextDecoder().decode(input.subarray(4, 4 + length)));
  edit(metadata);
  const text = encoder.encode(JSON.stringify(metadata));
  const size = new Uint8Array(4);
  u32(size, 0, text.length);
  return concat([size, text, input.subarray(4 + length)]);
}

export function binFixture(options = {}) {
  const type = options.type ?? 4;
  const columns = [0, 2, 3, 4, 5, 6, 7, 6, 8, 7, 9, 8, 10, 8, 11, 10, 13, 10, 15, 11, 18, 11, 19, 12, 20, 22, 28][type];
  const ispColumn = [0, 0, 3, 0, 5, 0, 7, 5, 7, 0, 8, 0, 9, 0, 9, 0, 9, 0, 9, 7, 9, 0, 9, 7, 9, 9, 9][type];
  const v4 = options.ipv4 !== false;
  const v6 = options.ipv6 !== false;
  const rows = [];
  if (v4) rows.push({ family: 4, width: 4, starts: [0n, 0xc0000200n, 0xc0000300n, 0xffffffffn] });
  if (v6)
    rows.push({
      family: 6,
      width: 16,
      starts: [0n, (0x20010db8n << 96n) | 1n, (0x20010db8n << 96n) | 2n, (0x20010db8n << 96n) | 3n, (1n << 128n) - 1n],
    });
  let offset = 64;
  for (const row of rows) {
    row.base = offset;
    row.stride = row.width + (columns - 1) * 4;
    offset += row.stride * row.starts.length;
  }
  if (options.indexed)
    for (const row of rows) {
      row.index = offset;
      offset += 65536 * 8;
    }
  const tableEnd = offset;
  const strings = [];
  function str(text) {
    const bytes = encoder.encode(text);
    if (bytes.length > 255) throw new Error("fixture string too long");
    const pointer = offset;
    strings.push(Uint8Array.of(bytes.length), bytes);
    offset += bytes.length + 1;
    return pointer;
  }
  const unknown = str("--");
  str("-");
  const country = str("EX");
  str(options.countryName ?? "Example");
  const missing = str("-");
  const region = str("Region");
  const first = str("First");
  const second = str("Second");
  const isp = str(options.isp ?? "Example ISP");
  const asn = str("64500");
  const organization = str("Example AS");
  const tables = new Uint8Array(tableEnd);
  tables[0] = type;
  tables[1] = columns;
  tables[2] = 26;
  tables[3] = 1;
  tables[4] = 1;
  tables[29] = 1;
  for (const row of rows) {
    const position = row.family === 4 ? 5 : 13;
    u32(tables, position, row.starts.length - 1, true);
    u32(tables, position + 4, row.base + 1, true);
    row.starts.forEach((address, i) => {
      const at = row.base + row.stride * i;
      for (let byte = 0; byte < row.width; byte++) tables[at + byte] = Number((address >> BigInt(byte * 8)) & 255n);
      const known = i === 1 || (i === 2 && row.family === 6);
      for (let column = 2; column <= columns; column++) u32(tables, at + row.width + (column - 2) * 4, missing, true);
      const values = { 2: known ? country : unknown };
      if (type >= 3) {
        values[3] = known ? region : missing;
        values[4] = known ? (i === 2 ? second : first) : missing;
      }
      if (ispColumn) values[ispColumn] = known ? isp : missing;
      if (type === 26) {
        values[24] = known ? asn : missing;
        values[25] = known ? organization : missing;
      }
      for (const [column, pointer] of Object.entries(values))
        u32(tables, at + row.width + (Number(column) - 2) * 4, pointer, true);
    });
    if (row.index) {
      u32(tables, row.family === 4 ? 21 : 25, row.index + 1, true);
      for (let i = 0; i < 65536; i++) u32(tables, row.index + i * 8 + 4, row.starts.length - 2, true);
    }
  }
  u32(tables, 31, offset, true);
  return concat([tables, ...strings]);
}
