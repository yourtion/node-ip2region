import Ipv4ToRegion, { Ipv4ToRegionResult, Ipv4ToRegionRes } from "./ipv4";
import Ipv6ToRegion, { Ipv6ToRegionResult, Ipv6ToRegionRes } from "./ipv6";
import { isIP } from "net";

/** IP2Region 配置 */
export interface IP2RegionOpts {
  /** ipv4 数据库地址 */
  ipv4db?: string;
  /** ipv6 数据库地址 */
  ipv6db?: string;
  /** 关闭 ipv6 */
  disableIpv6?: boolean;
}

export interface IP2RegionResult {
  /** 国家 */
  country: string;
  /** 省份 */
  province: string;
  /** 城市 */
  city: string;
  /** ISP 供应商 */
  isp: string;
}

export default class IP2Region {
  private ipv4: Ipv4ToRegion;
  private ipv6: Ipv6ToRegion | null = null;

  constructor(opts: IP2RegionOpts = {}) {
    this.ipv4 = new Ipv4ToRegion(opts.ipv4db);
    if (!opts.disableIpv6) {
      this.ipv6 = new Ipv6ToRegion(opts.ipv6db);
      this.ipv6.setIpv4Ins(this.ipv4);
    }
  }

  /**
   * 原始搜索
   * @param ipaddr IP 地址
   */
  searchRaw(ipaddr: string): Ipv6ToRegionResult | Ipv4ToRegionResult | null;
  /**
   * 原始搜索
   * @param ipaddr IP 地址
   * @param parse 是否解析
   */
  searchRaw(ipaddr: string, parse: boolean): Ipv4ToRegionRes | Ipv6ToRegionRes | null;
  searchRaw(ipaddr: string, parse = true) {
    const v = isIP(ipaddr);
    if (v === 6 && this.ipv6) {
      return this.ipv6.search(ipaddr, parse);
    }
    return this.ipv4.search(ipaddr, parse);
  }

  /**
   * 搜索
   * @param ipaddr IP 地址
   */
  search(ipaddr: string): IP2RegionResult | null {
    const res = this.searchRaw(ipaddr);
    if (res === null) return res;
    return { country: res.country, province: res.province, city: res.city, isp: res.isp };
  }
}
