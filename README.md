[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![David deps][david-image]][david-url]
[![node version][node-image]][node-url]
[![npm download][download-image]][download-url]
[![npm license][license-image]][download-url]
[![Greenkeeper badge](https://badges.greenkeeper.io/yourtion/node-ip2region.svg)](https://greenkeeper.io/)

[npm-image]: https://img.shields.io/npm/v/ip2region.svg?style=flat-square
[npm-url]: https://npmjs.org/package/ip2region
[travis-image]: https://img.shields.io/travis/yourtion/node-ip2region.svg?style=flat-square
[travis-url]: https://travis-ci.org/yourtion/node-ip2region
[coveralls-image]: https://img.shields.io/coveralls/yourtion/node-ip2region.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/yourtion/node-ip2region?branch=master
[david-image]: https://img.shields.io/david/yourtion/node-ip2region.svg?style=flat-square
[david-url]: https://david-dm.org/yourtion/node-ip2region
[node-image]: https://img.shields.io/badge/node.js-%3E=4.0-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/
[download-image]: https://img.shields.io/npm/dm/ip2region.svg?style=flat-square
[download-url]: https://npmjs.org/package/ip2region
[license-image]: https://img.shields.io/npm/l/ip2region.svg

# node-ip2region

IP 地址到区域运营商 IP to region on Node.js 

## 安装使用使用

```bash
$ npm install ip2region --save
```

```javascript
const IP2Region = require('ip2region');
const query = new IP2Region();
const res = query.search('120.24.78.68');
console.log(res);
> { id: 2163, country: '中国', region: '华南', province: '广东省', city: '深圳市', isp: '阿里云' }
```

## 性能

库中实现了四种搜索方法，包括基于内存和基于文件的 `BinarySearch` 与 `BtreeSearch`。

从 benmark 可以看出效果最好的是 `inMemoryBtreeSearch`，所以默认的 search 方法使用这个。

测试结果如下：

```
$ node test/benmark.js

inMemoryBinarySearch x 70,936 ops/sec ±2.50% (81 runs sampled)
inMemoryBtreeSearch x 105,500 ops/sec ±21.11% (58 runs sampled)
binarySearchSync x 15,926 ops/sec ±8.47% (79 runs sampled)
btreeSearchSync x 42,713 ops/sec ±7.10% (74 runs sampled)
Fastest is inMemoryBtreeSearch
```

需要其他方法可以参考 [test/index.js](test/index.js) 调用。
