import Ipv4ToRegion from "./ipv4";

export interface IP2RegionOpts {
  ipv4db?: string;
}
export default class IP2Region {
  private ipv4: Ipv4ToRegion;

  constructor(opts: IP2RegionOpts = {}) {
    this.ipv4 = new Ipv4ToRegion(opts.ipv4db);
  }

  search(ipaddr: string, parse = true) {
    return this.ipv4.search(ipaddr, parse);
  }
}
