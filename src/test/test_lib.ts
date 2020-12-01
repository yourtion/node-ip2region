import IP2Region from "../lib";

const queryInMemoey = new IP2Region();

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

describe("ipv4", function () {
  it("Found", function () {
    const res = queryInMemoey.search(ALIYUN_IP);
    expect(res).toMatchObject(ALIYUN2);
  });

  it("without Parse - Found", function () {
    const res = queryInMemoey.search(ALIYUN_IP, false);
    expect(res).toMatchObject(ALIYUN);
  });

  it("Error - init with db file", function () {
    const error = () => new IP2Region({ ipv4db: "/tmp/db.db" });
    expect(error).toThrow("[ip2region] db file not exists : /tmp/db.db");
  });
});
