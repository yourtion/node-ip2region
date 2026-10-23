import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import IP2Region from "../lib";

// Generated fixtures: no downloaded data or machine-specific paths.
describe("custom databases", () => {
  let directory: string;
  let ipv4db: string;
  let ipv6db: string;
  const region = "测试国|0|测试省|测试市|测试运营商";

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "ip2region-custom-"));
    ipv4db = join(directory, "custom-v4.db");
    ipv6db = join(directory, "custom-v6.db");
    // Legacy IPv4: super block, one data record, then one 12-byte index.
    const data = Buffer.from(region);
    const index = 8 + 4 + data.length;
    const v4 = Buffer.alloc(index + 12);
    v4.writeUInt32LE(index, 0);
    v4.writeUInt32LE(index, 4);
    v4.writeUInt32LE(42, 8);
    data.copy(v4, 12);
    v4.writeUInt32LE(0xc0000200, index); // 192.0.2.0
    v4.writeUInt32LE(0xc00002ff, index + 4); // 192.0.2.255
    v4.writeUInt32LE((data.length + 4) * 0x1000000 + 8, index + 8);
    writeFileSync(ipv4db, v4);

    // IPv6wry: IPDB header, one 64-bit prefix + 3-byte pointer, UTF-8 strings.
    const v6 = Buffer.alloc(51);
    v6.write("IPDB");
    v6[6] = 3;
    v6[7] = 8;
    v6.writeBigUInt64LE(1n, 8);
    v6.writeBigUInt64LE(40n, 16);
    v6.writeBigUInt64LE(0x20010db800000000n, 40);
    v6.writeUIntLE(51, 48, 3);
    writeFileSync(ipv6db, Buffer.concat([v6, Buffer.from("中国测试省测试市\0测试运营商\0")]));
  });

  afterAll(() => {
    unlinkSync(ipv4db);
    unlinkSync(ipv6db);
    rmdirSync(directory);
  });

  it("loads custom IPv4 ranges, raw data and boundary addresses", () => {
    const query = new IP2Region({ ipv4db, disableIpv6: true });
    for (const ip of ["192.0.2.0", "192.0.2.42", "192.0.2.255"]) {
      expect(query.searchRaw(ip, false)).toEqual({ city: 42, region });
      expect(query.search(ip)).toEqual({ country: "测试国", province: "测试省", city: "测试市", isp: "测试运营商" });
    }
  });

  it("returns null outside a custom IPv4 range", () => {
    const query = new IP2Region({ ipv4db, disableIpv6: true });
    for (const ip of ["192.0.1.255", "192.0.3.0", "255.255.255.255"]) {
      expect(query.search(ip)).toBeNull();
      expect(query.searchRaw(ip, false)).toBeNull();
    }
  });

  it("loads custom IPv6 data and uses custom IPv4 data for mapped addresses", () => {
    const query = new IP2Region({ ipv4db, ipv6db });
    expect(query.searchRaw("2001:db8::1", false)).toEqual({ cArea: "中国测试省测试市", aArea: "测试运营商" });
    expect(query.search("2001:db8::1")).toEqual({
      country: "中国",
      province: "测试省",
      city: "测试市",
      isp: "测试运营商",
    });
    expect(query.searchRaw("::ffff:192.0.2.42", false)).toEqual({ city: 42, region });
  });
});
