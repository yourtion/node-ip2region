/**
 * 创建 debug
 */
export function createDebug() {
  if (process.env.NODE_ENV === "dev") return require("debug")("ip2region:");
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
