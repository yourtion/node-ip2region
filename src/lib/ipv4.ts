"use strict";

import { createDebug, ipv4ToLong } from "./utils";
import { existsSync, readFileSync } from "fs";
import { resolve as pathResolve, isAbsolute } from "path";
import { isIPv4 } from "net";

const debug = createDebug("ipv4");
/**
 * IP 结果
 */
export interface Ipv4ToRegionRes {
  /** 城市 id */
  city: number;
  /** 区域字符串 */
  region: string;
}
/**
 * IP 解析结果
 */
export interface Ipv4ToRegionResult {
  /** 城市 id */
  id: number;
  /** 国家 */
  country: string;
  /** 区域 */
  region: string;
  /** 省份 */
  province: string;
  /** 城市 */
  city: string;
  /** ISP 供应商 */
  isp: string;
}

/**
 * IP v4 解析
 */
export default class Ipv4ToRegion {
  /**  数据库文件位置 */
  private dbFilePath: string;
  // init basic search environment
  private superBlock = Buffer.allocUnsafe(8);
  private indexBlockLength = 12;
  private data: Buffer;

  private firstIndexPtr: number;
  private lastIndexPtr: number;
  private totalBlocks: number;

  constructor(dbPath?: string) {
    const p = dbPath || "../../data/ip2region.db";
    this.dbFilePath = isAbsolute(p) ? p : pathResolve(__dirname, p);
    if (!existsSync(this.dbFilePath)) {
      throw new Error("[Ipv4ToRegion] db file not exists : " + this.dbFilePath);
    }

    this.data = readFileSync(this.dbFilePath);
    this.data.copy(this.superBlock, 0, 0, 8);

    this.firstIndexPtr = this.superBlock.readUInt32LE(0);
    this.lastIndexPtr = this.superBlock.readUInt32LE(4);
    this.totalBlocks = (this.lastIndexPtr - this.firstIndexPtr) / this.indexBlockLength + 1;

    debug(this.totalBlocks);
  }

  parseResult(res: Ipv4ToRegionRes | null) {
    if (res === null) return res;
    // 城市Id|国家|区域|省份|城市|ISP
    const data = res.region.split("|");
    return {
      id: res.city,
      country: data[0] !== "0" ? data[0] : "",
      region: data[1] !== "0" ? data[1] : "",
      province: data[2] !== "0" ? data[2] : "",
      city: data[3] !== "0" ? data[3] : "",
      isp: data[4] !== "0" ? data[4] : "",
    };
  }

  searchLong(ip: number): Ipv4ToRegionRes | null {
    let low = 0;
    let mid = 0;
    let high = this.totalBlocks;
    let dataPos = 0;
    let pos = 0;
    let sip = 0;
    let eip = 0;

    // binary search
    while (low <= high) {
      mid = (low + high) >> 1;
      pos = this.firstIndexPtr + mid * this.indexBlockLength;
      sip = this.data.readUInt32LE(pos);

      debug(" sip : " + sip + " eip : " + eip);
      if (ip < sip) {
        high = mid - 1;
      } else {
        eip = this.data.readUInt32LE(pos + 4);

        if (ip > eip) {
          low = mid + 1;
        } else {
          dataPos = this.data.readUInt32LE(pos + 8);
          break;
        }
      }
    }

    // read data
    if (dataPos === 0) return null;

    const dataLen = (dataPos >> 24) & 0xff;
    dataPos = dataPos & 0x00ffffff;
    const city_id = this.data.readUInt32LE(dataPos);
    const data = this.data.toString("utf8", dataPos + 4, dataPos + dataLen);

    debug(city_id);
    debug(data);
    return { city: city_id, region: data };
  }

  search(ipaddr: string): Ipv4ToRegionResult;
  search(ipaddr: string, parse: boolean): Ipv4ToRegionRes;
  search(ipaddr: string, parse: boolean = true) {
    if (!isIPv4(ipaddr)) return null;
    const ip = ipv4ToLong(ipaddr);
    // first search  (in header index)
    const ret = this.searchLong(ip);
    return parse ? this.parseResult(ret) : ret;
  }
}
