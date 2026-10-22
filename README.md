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

### 自行扩充或替换数据库

可以通过 `ipv4db` / `ipv6db` 加载自行生成的兼容数据库。它们会**替换**对应的内置库，
不会自动合并或在未命中时回退到内置库。本包是只读查询器，不提供向二进制数据库追加记录的 API。
数据库在构造时读入内存；更新文件后需要重新创建实例。

#### IPv4

本包读取 ip2region **1.x 的旧版 `.db` 格式**，不支持 2.x/3.x 的 `.xdb`，
也不能将 CSV、JSON、文本文件或 `.xdb` 改名为 `.db` 后使用。

可使用上游 [v1.9.0 的 Java maker](https://github.com/lionsoul2014/ip2region/tree/v1.9.0/maker/java)
重新生成数据库（需要 Java）：

1. 检出上游 `lionsoul2014/ip2region` 的 `v1.9.0` 标签。
2. 复制该版本的 `data/ip.merge.txt` 为自己的源文件，按需修改或加入 IP 范围。
   每行格式为 `起始IPv4|结束IPv4|国家|区域|省份|城市|ISP`，例如：
   `192.0.2.0|192.0.2.255|测试国|0|测试省|测试市|测试运营商`。
   按 IP 数值升序排列，范围不可重叠；覆盖现有范围时先拆分旧范围，不能直接追加重叠记录。
   需要保留原有查询结果时，保留源文件中的其他范围。未知字段用 `0`。
3. 在上游仓库根目录运行（`-dst` 是已存在的输出目录）：

   ```sh
   mkdir -p custom-data
   java -jar maker/java/dbMaker-1.2.2.jar \
     -src ./my-ip.merge.txt \
     -region ./data/global_region.csv \
     -dst ./custom-data
   ```

   输出为 `custom-data/ip2region.db`。地域 ID 映射使用 `global_region.csv`；
   如需自定义城市 ID，也应按上游格式维护该文件。
4. 将生成的库放在应用自己的数据目录，通过绝对路径加载：

   ```js
   import IP2Region from "ip2region";
   import { resolve } from "path";

   const query = new IP2Region({
     ipv4db: resolve("./custom-data/ip2region.db"),
     disableIpv6: true,
   });
   console.log(query.search("192.0.2.42"));
   ```

未覆盖的 IPv4 地址返回 `null`。不要修改 `node_modules` 内的数据库，以免安装或升级覆盖。
为兼容已有用法，相对数据库路径仍相对于本包实现文件所在目录解析，**不是**应用的工作目录；
推荐如上使用 `resolve()` 明确生成绝对路径。

#### IPv6

`ipv6db` 需要兼容现有 `ipv6wry.db` 的 **IPDB 二进制格式**，它与 IPv4 `.db` 不同，
不能用上面的 IPv4 maker 生成。已有兼容库可通过 `ipv6db: resolve("./custom-data/ipv6wry.db")`
加载；本包不提供 IPv6 数据生成器。IPv4 映射地址等查询使用同一实例的 IPv4 数据库。
只扩充 IPv4 时可省略 `ipv6db` 继续使用内置 IPv6 库，或设置 `disableIpv6: true`。
扩充数据的来源、准确性与再分发许可由使用者自行选择和维护。
