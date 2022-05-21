import Ipv6ToRegion from "../lib/ipv6";
import Ipv4ToRegion from "../lib/ipv4";

const v4 = new Ipv4ToRegion();
const queryInMemoey = new Ipv6ToRegion();
queryInMemoey.setIpv4Ins(v4);

const IP1 = "240e:47d:c20:1627:30a3:ba0d:a5e6:ec19";
const RET1 = Object.freeze({
  city: "广州市",
  country: "中国",
  data: "中国广东省广州市番禺区",
  isp: "中国电信CTNET网络",
  province: "广东省",
});
const NEIWAN_IP = "0:0:0:0:0:0:0:1";
const NEIWAN2 = Object.freeze({ city: "", country: "", data: "IANA保留地址", isp: "本机地址", province: "" });
const IP4on6 = "0000:0000:0000:0000:0000:0000:135.75.43.52";
const IP4on6_RET = Object.freeze({ city: 166, region: "美国|0|0|0|美国电话电报" });
const IP6to4 = "2002:0C9B:A665:0001:0000:0000:0C9B:A665";
const IP6to4_RET = Object.freeze({ city: 0, region: "美国|0|加利福尼亚|0|美国电话电报" });
const IPTeredo = "2001:0000:A665:0001:0000:0000:874b:2b34";
const IPTeredo_RET = Object.freeze({ city: 0, region: "印度尼西亚|0|大雅加达|雅加达|Indosat" });
const IPISATAP = "fe80::200:5efe:874b:2b34";
const IPISATAP_RET = Object.freeze({ city: 166, region: "美国|0|0|0|美国电话电报" });
const IP2 = "2406:840::1";
const RET2 = Object.freeze({ isp: "ZX Network Anycast网段", data: "全球", city: "", country: "", province: "" });
const ALIYUN = "2400:3200::1";
const ALIYUN_RET = Object.freeze({
  city: "杭州市",
  country: "中国",
  data: "中国浙江省杭州市",
  isp: "阿里云计算有限公司",
  province: "浙江省",
});
const UNKOOW = Object.freeze({ city: "", country: "", data: "未知", isp: "未知", province: "" });

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
    const res = queryInMemoey.search(IP4on6, false);
    expect(res).toMatchObject(IP4on6_RET);
  });

  it("Found - 6to4", function () {
    const res = queryInMemoey.search(IP6to4, false);
    expect(res).toMatchObject(IP6to4_RET);
  });

  it("Found - Teredo", function () {
    const res = queryInMemoey.search(IPTeredo, false);
    expect(res).toMatchObject(IPTeredo_RET);
  });

  it("Found - ISATAP", function () {
    const res = queryInMemoey.search(IPISATAP, false);
    expect(res).toMatchObject(IPISATAP_RET);
  });

  it("Found - ALIYUN", function () {
    const res = queryInMemoey.search(ALIYUN);
    expect(res).toMatchObject(ALIYUN_RET);
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

  it("No ipv4", function () {
    const ins = new Ipv6ToRegion();
    expect(ins.search(IP4on6)).toMatchObject(UNKOOW);
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

describe("Parse Tests", function () {
  it("parse gover", function () {
    const ret = (queryInMemoey as any).parseResult({ cArea: "中国北京市", aArea: "" });
    expect(ret).toMatchObject({ isp: "", data: "中国北京市", country: "中国", province: "北京市", city: "" });
  });

  it("parse province", function () {
    const ret = (queryInMemoey as any).parseResult({ cArea: "中国宁夏中卫市沙坡头区", aArea: "" });
    expect(ret).toMatchObject({
      isp: "",
      data: "中国宁夏中卫市沙坡头区",
      country: "中国",
      province: "宁夏",
      city: "中卫市",
    });
  });

  it("parse city ", function () {
    const ret = (queryInMemoey as any).parseResult({ cArea: "中国湖北省恩施土家族苗族自治州恩施市", aArea: "" });
    expect(ret).toMatchObject({
      isp: "",
      data: "中国湖北省恩施土家族苗族自治州恩施市",
      country: "中国",
      province: "湖北省",
      city: "恩施土家族苗族自治州",
    });
  });
});
