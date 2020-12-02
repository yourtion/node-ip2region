import Ipv4ToRegion from "../lib/ipv4";

const queryInMemoey = new Ipv4ToRegion();

const ALIYUN_IP = "120.24.78.68";
const ALIYUN = Object.freeze({ city: 2163, region: "中国|0|广东省|深圳市|阿里云" });
const ALIYUN2 = Object.freeze({
  id: 2163,
  country: "中国",
  region: "0",
  province: "广东省",
  city: "深圳市",
  isp: "阿里云",
});
const NEIWAN_IP = "10.10.10.10";
const IPV6 = "2409:8946:2d51:1569:dfdb:6dcf:dd39:5d9a";
const NEIWAN = Object.freeze({ city: 0, region: "0|0|0|内网IP|内网IP" });
const NEIWAN2 = Object.freeze({ id: 0, country: "0", region: "0", province: "0", city: "内网IP", isp: "内网IP" });

describe("search", function () {
  it("Found", function () {
    const res = queryInMemoey.search(ALIYUN_IP);
    expect(res).toMatchObject(ALIYUN2);
  });

  it("Not Found", function () {
    const res = queryInMemoey.search(NEIWAN_IP);
    expect(res).toMatchObject(NEIWAN2);
  });

  it("Not Found ipv6", function () {
    const res = queryInMemoey.search(IPV6);
    expect(res).toBeNull();
  });

  it("without Parse - Found", function () {
    const res = queryInMemoey.search(ALIYUN_IP, false);
    expect(res).toMatchObject(ALIYUN);
  });

  it("without Parse - Not Found", function () {
    const res = queryInMemoey.search(NEIWAN_IP, false);
    expect(res).toMatchObject(NEIWAN);
  });
});

describe("More Tests", function () {
  it("Search Test", function () {
    queryInMemoey.searchLong(-1);
    queryInMemoey.searchLong(0);
    queryInMemoey.searchLong(1747920896);
    queryInMemoey.searchLong(3220758528);
    queryInMemoey.search("");
    queryInMemoey.search("aa");
  });

  it("Error - init with db file", function () {
    const error = () => new Ipv4ToRegion("/tmp/db.db");
    expect(error).toThrow("[Ipv4ToRegion] db file not exists : /tmp/db.db");
  });
});

describe("BugFix - 1", function () {
  const ip = "218.70.78.68";
  const ret = Object.freeze({ city: 2430, region: "中国|0|重庆|重庆市|电信" });

  it("search", function () {
    expect(queryInMemoey.search(ip, false)).toMatchObject(ret);
  });
});
