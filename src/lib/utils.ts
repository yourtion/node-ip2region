/**
 * 创建 debug
 */
export function createDebug(name?: string) {
  if (process.env.NODE_ENV === "dev") return require("debug")(`ip2region:${name}:`);
  return () => {};
}

// for ip2long
const ipbase = [16777216, 65536, 256, 1];
/**
 * Convert ip to long (xxx.xxx.xxx.xxx to a integer)
 *
 * @param {string} ip IP Address
 * @returns {number} long value
 */
export function ipv4ToLong(ip: string) {
  let val = 0;
  ip.split(".").forEach((ele, i) => {
    val += ipbase[i] * parseInt(ele, 10);
  });
  return val;
}

export function ipv6ToLong(ip: string) {
  let num = BigInt(0);
  let exp = BigInt(0);

  // 处理 IPv4 混合地址
  if (ip.includes(".")) {
    ip = ip
      .split(":")
      .map((part) => {
        if (part.includes(".")) {
          const digits = part.split(".").map((str) => Number(str).toString(16).padStart(2, "0"));
          return `${digits[0]}${digits[1]}:${digits[2]}${digits[3]}`;
        } else {
          return part;
        }
      })
      .join(":");
  }

  const parts = ip.split(":");
  const index = parts.indexOf("");

  if (index !== -1) {
    while (parts.length < 8) {
      parts.splice(index, 0, "");
    }
  }
  const p = parts
    .map((part) => (part ? `0x${part}` : `0`))
    .map(Number)
    .reverse();
  for (const n of p) {
    num += BigInt(n) * BigInt(2) ** BigInt(exp);
    exp += BigInt(16);
  }

  return { ip, num };
}
