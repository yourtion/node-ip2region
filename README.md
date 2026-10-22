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

### CommonJS、ESM 和 TypeScript

原生 Node.js ESM（`.mjs` 或 `package.json` 中设置 `"type": "module"`）直接使用
`import IP2Region from "ip2region"`，无需再取 `.default`。旧的 ESM `imported.default` 绕过写法保留为兼容别名，建议新代码直接使用默认导入。
CommonJS 保持原来的 `const IP2Region = require("ip2region").default` 用法。
两种入口使用同一个类和实现。TypeScript 同时提供默认类导出及
`IP2RegionOpts`、`IP2RegionResult` 类型，支持传统 `moduleResolution: "node"`
以及 `Node16`、`NodeNext` 和 `bundler` 模式。

### 开发验证

```sh
pnpm install --frozen-lockfile
npm test -- --runInBand
npm run compile
npm run test:package
```

`test:package` 构建后执行 `npm pack`，在临时目录离线安装 tarball，验证 CommonJS、原生 ESM、
动态导入、TypeScript 类型及编译后的消费者运行行为。发布生命周期不会在该测试中执行。

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
