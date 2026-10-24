import { IP2RegionError } from "./errors.js";
import type { ParsedIP } from "./types.js";

function invalid(): never {
  throw new IP2RegionError("INVALID_IP", "Expected an IPv4 or IPv6 address literal without a port or scope identifier");
}

function ipv4(input: string): Uint8Array {
  const parts = input.split(".");
  if (parts.length !== 4) invalid();
  return Uint8Array.from(
    parts.map((part) => {
      if (!/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255) invalid();
      return Number(part);
    })
  );
}

function valueOf(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) result = (result << 8n) | BigInt(byte);
  return result;
}

function canonical(words: number[]): string {
  let start = -1;
  let length = 1;
  for (let i = 0; i < words.length;) {
    if (words[i] !== 0) {
      i++;
      continue;
    }
    let end = i;
    while (end < words.length && words[end] === 0) end++;
    if (end - i > length) {
      start = i;
      length = end - i;
    }
    i = end;
  }
  if (start === -1) return words.map((n) => n.toString(16)).join(":");
  return `${words
    .slice(0, start)
    .map((n) => n.toString(16))
    .join(":")}::${words
    .slice(start + length)
    .map((n) => n.toString(16))
    .join(":")}`;
}

/** Strict parsing; no DNS, trimming, legacy IPv4 notation, or transition-address guessing. */
export function parseIP(input: string): ParsedIP {
  if (typeof input !== "string" || input.length === 0 || input.length > 45 || input.trim() !== input) invalid();
  if (!input.includes(":")) {
    const bytes = ipv4(input);
    return { address: [...bytes].join("."), family: 4, bytes, value: valueOf(bytes) };
  }
  if (!/^[0-9a-f:.]+$/i.test(input)) invalid();
  let text = input;
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    const tail = ipv4(text.slice(lastColon + 1));
    text = `${text.slice(0, lastColon + 1)}${((tail[0] << 8) | tail[1]).toString(16)}:${((tail[2] << 8) | tail[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) invalid();
  const left = halves[0] === "" ? [] : halves[0].split(":");
  const right = halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
  if (halves.length === 1 ? left.length !== 8 : left.length + right.length >= 8) invalid();
  const tokens = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  const words = tokens.map((token: string) => {
    if (!/^[0-9a-f]{1,4}$/i.test(token)) invalid();
    return Number.parseInt(token, 16);
  });
  const bytes = new Uint8Array(16);
  words.forEach((word, i) => {
    bytes[i * 2] = word >> 8;
    bytes[i * 2 + 1] = word & 255;
  });
  const mapped = words.slice(0, 5).every((n) => n === 0) && words[5] === 0xffff;
  return {
    address: canonical(words),
    family: 6,
    bytes,
    value: valueOf(bytes),
    ...(mapped ? { mappedIPv4: [...bytes.subarray(12)].join(".") } : {}),
  };
}
