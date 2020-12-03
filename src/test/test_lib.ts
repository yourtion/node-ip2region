import IP2Region from "../lib";

const queryInMemoey = new IP2Region();

const ALIYUN_IP = "120.24.78.68";
const ALIYUN = Object.freeze({ city: 2163, region: "中国|0|广东省|深圳市|阿里云" });
const ALIYUN2 = Object.freeze({ country: "中国", province: "广东省", city: "深圳市", isp: "阿里云" });
const DX_IP = "240e:47d:c20:1627:30a3:ba0d:a5e6:ec19";
const DX = Object.freeze({ cArea: "中国广东省", aArea: "中国电信" });
const DX2 = Object.freeze({ country: "中国", province: "广东省", city: "", isp: "中国电信" });
const IP4on6 = "0000:0000:0000:0000:0000:0000:135.75.43.52";
const IP4on6_RET = Object.freeze({ city: 166, region: "美国|0|0|0|美国电话电报" });

describe("ipv4", function () {
  it("Found", function () {
    const res = queryInMemoey.search(ALIYUN_IP);
    expect(res).toMatchObject(ALIYUN2);
  });

  it("without Parse - Found", function () {
    const res = queryInMemoey.searchRaw(ALIYUN_IP, false);
    expect(res).toMatchObject(ALIYUN);
  });

  it("Error - init with db file", function () {
    const error = () => new IP2Region({ ipv4db: "/tmp/db.db" });
    expect(error).toThrow("[Ipv4ToRegion] db file not exists : /tmp/db.db");
  });
});

describe("ipv6", function () {
  it("Found", function () {
    const res = queryInMemoey.search(DX_IP);
    expect(res).toMatchObject(DX2);
  });

  it("without Parse - Found", function () {
    const res = queryInMemoey.searchRaw(DX_IP, false);
    expect(res).toMatchObject(DX);
  });

  it("without Parse - Found IP4on6", function () {
    const res = queryInMemoey.searchRaw(IP4on6, false);
    expect(res).toMatchObject(IP4on6_RET);
  });

  it("Error - init with db file", function () {
    const error = () => new IP2Region({ ipv6db: "/tmp/db.db" });
    expect(error).toThrow("[Ipv6ToRegion] db file not exists : /tmp/db.db");
  });
});

describe("More Tests", function () {
  it("disableIpv6", function () {
    const ins = new IP2Region({ disableIpv6: true });
    expect(ins.search(DX_IP)).toBeNull();
    expect(ins.search(ALIYUN_IP)).toMatchObject(ALIYUN2);
  });
});
