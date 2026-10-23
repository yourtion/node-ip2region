import Ipv4ToRegion from "../lib/ipv4";
import * as fs from "fs";
import * as path from "path";

const queryInMemoey = new Ipv4ToRegion();

const ALIYUN_IP = "120.24.78.68";
const ALIYUN = Object.freeze({ city: 2163, region: "中国|0|广东省|深圳市|阿里云" });
const ALIYUN2 = Object.freeze({
  id: 2163,
  country: "中国",
  region: "",
  province: "广东省",
  city: "深圳市",
  isp: "阿里云",
});
const NEIWAN_IP = "10.10.10.10";
const IPV6 = "2409:8946:2d51:1569:dfdb:6dcf:dd39:5d9a";
const NEIWAN = Object.freeze({ city: 0, region: "0|0|0|内网IP|内网IP" });
const NEIWAN2 = Object.freeze({ id: 0, country: "", region: "", province: "", city: "内网IP", isp: "内网IP" });

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

  // Test for an IP that is valid but not expected to be in the database
  // Assuming "0.0.0.1" is not in the ip2region.db or resolves to a default/null entry
  // If this test fails because "0.0.0.1" IS in the database, pick another IP.
  // For example, an IP from a reserved range like "240.0.0.1"
  // Using an IP from 240.0.0.0/4 (Class E, reserved)
  const UNKNOWN_IP = "250.250.250.250";

  it("Not Found - Valid IP not in DB (parsed result)", function () {
    const res = queryInMemoey.search(UNKNOWN_IP);
    // Expecting null because if searchLong returns null, parseResult(null) is null
    expect(res).toBeNull();
  });

  it("Not Found - Valid IP not in DB (raw result)", function () {
    const res = queryInMemoey.search(UNKNOWN_IP, false);
    // Expecting null because searchLong should return null
    expect(res).toBeNull();
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

describe("Initialization Tests", function () {
  const tempDbPath = path.join("/tmp", "ip2region_test.db");
  const originalDbPath = path.resolve(__dirname, "../../data/ip2region.db"); // Corrected path to project root data

  beforeAll(() => {
    // Copy the original database to a temporary location
    try {
      fs.copyFileSync(originalDbPath, tempDbPath);
    } catch (err) {
      console.error("Error copying DB for test:", err);
      // If copy fails, we might want to skip or fail the test suite for this block
      throw new Error(`Failed to copy DB from ${originalDbPath} to ${tempDbPath}: ${err}`);
    }
  });

  afterAll(() => {
    // Clean up the temporary database file
    try {
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {
      console.error("Error deleting temporary DB:", err);
    }
  });

  it("should instantiate with an absolute path to a valid DB file", function () {
    let queryWithAbsolutePath: Ipv4ToRegion | null = null;
    // Attempt to instantiate
    try {
      queryWithAbsolutePath = new Ipv4ToRegion(tempDbPath);
    } catch (e) {
      // Let Jest handle unexpected errors during instantiation
      throw e;
    }

    // Assert that instantiation was successful and the object is not null
    expect(queryWithAbsolutePath).not.toBeNull();

    // Perform checks only if queryWithAbsolutePath is confirmed to be non-null
    if (queryWithAbsolutePath) {
      const res = queryWithAbsolutePath.search(ALIYUN_IP);
      expect(res).toMatchObject(ALIYUN2); // Check if a known IP lookup works
    } else {
      // This path should ideally not be reached if instantiation is expected to succeed.
      // Explicitly fail if queryWithAbsolutePath is null, which means instantiation failed silently
      // or the logic is flawed.
      fail("Ipv4ToRegion instantiation with absolute path resulted in a null object without throwing an error.");
    }
  });
});

describe("BugFix - 1", function () {
  const ip = "218.70.78.68";
  const ret = Object.freeze({ city: 2430, region: "中国|0|重庆|重庆市|电信" });

  it("search", function () {
    expect(queryInMemoey.search(ip, false)).toMatchObject(ret);
  });
});
