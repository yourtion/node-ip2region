import { createDebug, ipv6ToLong } from "./utils";
import { existsSync, readFileSync } from "fs";
import { resolve as pathResolve, isAbsolute } from "path";
import { isIPv6 } from "net";

const debug = createDebug("ipv6");
const FF = 0xffffffffffffffffn;
const N64 = 64n;

export default class Ipv6ToRegion {
  /**  数据库文件位置 */
  private dbFilePath: string;
  private data: Buffer;

  private name: string;
  private offlen: number;
  //private iplen: number;
  //private v: number;
  private record: number;
  private indexStart: number;
  //private versionStart: number;

  constructor(dbPath?: string) {
    const p = dbPath || "../../data/ipv6wry.db";
    this.dbFilePath = isAbsolute(p) ? p : pathResolve(__dirname, p);
    if (!existsSync(this.dbFilePath)) {
      throw new Error("[Ipv6ToRegion] db file not exists : " + this.dbFilePath);
    }
    this.data = readFileSync(this.dbFilePath);
    this.name = this.data.toString("utf-8", 0, 4);
    if (this.name !== "IPDB") {
      throw new Error("[Ipv6ToRegion] db file error");
    }
    this.offlen = this.data.readInt8(6);
    //this.iplen = this.data.readInt8(7);
    //this.v = this.data.readInt8(4);
    this.record = Number(this.data.readBigInt64LE(8));
    this.indexStart = Number(this.data.readBigInt64LE(16));
    //this.versionStart = Number(this.data.readBigInt64LE(32));
  }

  /**
   * 读取 Long 数据
   * @param offset 偏移量
   */
  private readLongData(offset: number) {
    return this.data.readIntLE(offset, this.offlen);
  }

  /**
   * 使用二分法查找网络字节编码的IP地址的索引记录
   * @param ip IP地址
   * @param l 左边界
   * @param r 右边界
   */
  private find(ip: BigInt, l: number, r: number): number {
    if (r - l <= 1) {
      return l;
    }
    const m = (l + r) >> 1;
    const o = this.indexStart + m * (8 + this.offlen);
    const new_ip = this.data.readBigUInt64LE(o);
    // debug(new_ip);
    if (ip < new_ip) {
      return this.find(ip, l, m);
    } else {
      return this.find(ip, m, r);
    }
  }
  /**
   * 读取字符串信息
   * @param offset 偏移量
   */
  private getString(offset = 0) {
    // 读取字符串信息，包括"国家"信息和"地区"信息,QQWry.Dat的记录区每条信息都是一个以"\0"结尾的字符串
    const o2 = this.data.indexOf("\0", offset);
    // 有可能只有国家信息没有地区信息，
    return this.data.toString("utf-8", offset, o2);
  }

  /**
   * 读取区域信息字符串
   * @param offset 偏移量
   */
  private getAreaAddr(offset = 0): string {
    const byte = this.data.readInt8(offset);
    if (byte == 1 || byte == 2) {
      // 第一个字节为 1 或者 2 时，取得 2-4 字节作为一个偏移量调用自己
      const p = this.readLongData(offset + 1);
      return this.getAreaAddr(p);
    } else {
      return this.getString(offset);
    }
  }

  /**
   * 获取地址信息
   * @param offset 偏移量
   */
  private getAddr(offset: number): { cArea: string; aArea: string } {
    let o = offset;
    const byte = this.data.readInt8(o);
    debug(byte);
    if (byte === 1) {
      // 重定向模式 1 ：[IP][0x01][国家和地区信息的绝对偏移地址]，使用接下来的3字节作为偏移量调用字节取得信息
      return this.getAddr(this.readLongData(o + 1));
    } else {
      // 重定向模式 2 + 正常模式：[IP][0x02][信息的绝对偏移][...]
      const cArea = this.getAreaAddr(o);
      debug(cArea);
      if (byte == 2) {
        o += 1 + this.offlen;
      } else {
        o = this.data.indexOf("\0", o) + 1;
      }
      const aArea = this.getAreaAddr(o);
      debug(aArea);
      return { cArea, aArea };
    }
  }

  search(ipaddr: string) {
    if (!isIPv6(ipaddr)) return null;
    // 把IP地址转成数字
    const ip6 = ipv6ToLong(ipaddr);
    const ip = (ip6 >> N64) & FF;
    debug("ip", ip);
    // 查找ip的索引偏移
    const idx = this.find(ip, 0, this.record);
    debug(idx);
    // 得到索引记录
    const ipOff = this.indexStart + idx * (8 + this.offlen);
    const ipRecOff = this.readLongData(ipOff + 8);
    debug({ ipOff, ipRecOff });
    return this.getAddr(ipRecOff);
  }
}
