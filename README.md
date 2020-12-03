[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![David deps][david-image]][david-url]
[![node version][node-image]][node-url]
[![npm download][download-image]][download-url]
[![npm license][license-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/ip2region.svg?style=flat-square
[npm-url]: https://npmjs.org/package/ip2region
[travis-image]: https://img.shields.io/travis/yourtion/node-ip2region.svg?style=flat-square
[travis-url]: https://travis-ci.org/yourtion/node-ip2region
[coveralls-image]: https://img.shields.io/coveralls/yourtion/node-ip2region.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/yourtion/node-ip2region?branch=master
[david-image]: https://img.shields.io/david/yourtion/node-ip2region.svg?style=flat-square
[david-url]: https://david-dm.org/yourtion/node-ip2region
[node-image]: https://img.shields.io/badge/node.js-%3E=12.0-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/
[download-image]: https://img.shields.io/npm/dm/ip2region.svg?style=flat-square
[download-url]: https://npmjs.org/package/ip2region
[license-image]: https://img.shields.io/npm/l/ip2region.svg

# node-ip2region

IP 地址到区域运营商 IP（支持 IPv6） to region on Node.js

## 安装使用使用

```bash
$ npm install ip2region --save
```

```typescript
// const IP2Region = require('ip2region').default;
import IP2Region from "ip2region";
const query = new IP2Region();
const res = query.search('120.24.78.68');
console.log(res);
> { country: '中国', province: '广东省', city: '深圳市', isp: '阿里云' }
const res2 = query.search('240e:47d:c20:1627:30a3:ba0d:a5e6:ec19');
console.log(res2);
> { country: "中国", province: "广东省", city: "", isp: "中国电信" }
```

### 配置

- `ipv4db`: ipv4 数据库地址
- `ipv6db`: ipv6 数据库地址
- `disableIpv6`: 关闭 ipv6 查询功能（减少内存占用）

```typescript
import IP2Region from "ip2region";
const query = new IP2Region({
  ipv4db: "/tmp/db4.db",
  ipv6db: "/tmp/db6.db",
  disableIpv6: true,
});
```
