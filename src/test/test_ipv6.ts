import Ipv6ToRegion from "../lib/ipv6";
import Ipv4ToRegion from "../lib/ipv4";

const v4 = new Ipv4ToRegion();
const queryInMemoey = new Ipv6ToRegion();
queryInMemoey.setIpv4Ins(v4);

const IP1 = "240e:47d:c20:1627:30a3:ba0d:a5e6:ec19";
const RET1 = Object.freeze({ aArea: "中国电信", cArea: "中国广东省" });
const NEIWAN_IP = "0:0:0:0:0:0:0:1";
const NEIWAN2 = Object.freeze({ aArea: "本机地址", cArea: "IANA保留地址" });
const IP4on6 = "0000:0000:0000:0000:0000:0000:135.75.43.52";
const IP4on6_RET = Object.freeze({ city_id: 166, data: "美国|0|0|0|美国电话电报" });
const IP6to4 = "2002:0C9B:A665:0001:0000:0000:0C9B:A665";
const IP6to4_RET = Object.freeze({ city_id: 0, data: "美国|0|加利福尼亚|0|美国电话电报" });
const IPTeredo = "2002:0C9B:A665:0001:0000:0000:874b:2b34";
const IPTeredo_RET = Object.freeze({ city_id: 0, data: "美国|0|加利福尼亚|0|美国电话电报" });
const IPISATAP = "fe80::200:5efe:874b:2b34";
const IPISATAP_RET = Object.freeze({ city_id: 166, data: "美国|0|0|0|美国电话电报" });
const IP2 = "2406:840::1";
const RET2 = Object.freeze({ aArea: "ZX Network Anycast网段", cArea: "全球" });

describe("search", function () {
  it("Found", function () {
    const res = queryInMemoey.search(IP1);
    expect(res).toMatchObject(RET1);
  });

  it("Not Found", function () {
    const res = queryInMemoey.search(NEIWAN_IP);
    expect(res).toMatchObject(NEIWAN2);
  });

  it("Found - 4on6", function () {
    const res = queryInMemoey.search(IP4on6);
    expect(res).toMatchObject(IP4on6_RET);
  });

  it("Found - 6to4", function () {
    const res = queryInMemoey.search(IP6to4);
    expect(res).toMatchObject(IP6to4_RET);
  });

  it("Found - Teredo", function () {
    const res = queryInMemoey.search(IPTeredo);
    expect(res).toMatchObject(IPTeredo_RET);
  });

  it("Found - ISATAP", function () {
    const res = queryInMemoey.search(IPISATAP);
    expect(res).toMatchObject(IPISATAP_RET);
  });

  it("Found", function () {
    const res = queryInMemoey.search(IP2);
    expect(res).toMatchObject(RET2);
  });
});

describe("More Tests", function () {
  it("Search Test", function () {
    queryInMemoey.search("");
    queryInMemoey.search("aa");
  });

  it("Error - init with db file", function () {
    const error = () => new Ipv6ToRegion("/tmp/db.db");
    expect(error).toThrow("[Ipv6ToRegion] db file not exists : /tmp/db.db");
  });

  it("Error - db file error", function () {
    const error = () => new Ipv6ToRegion("ipv4.ts");
    expect(error).toThrow("[Ipv6ToRegion] db file error");
  });
});
