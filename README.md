# ip2region

原生支持 Node、Bun、Deno 的 IP 查询库。内置 ip2region XDB 双栈数据可开箱即用，
也可读取自备数据库，或接入查询函数、对象和类实例。

**`main` 开发 3.0.0，目前尚未发布；`v2` 保留旧版实现。既有 2.x 接口不提供以下新 API，升级请参阅[迁移指南](docs/migration.md)。**

维护者的 npm Trusted Publisher 配置、tag 发版与失败重跑方式见[发布说明](docs/releasing.md)。

## 开箱即用

```js
import { openDefault } from "ip2region/node";

const query = await openDefault();
try {
  console.log(query.lookup("120.24.78.68"));
  // {
  //   country: { name: "中国", code: "CN" },
  //   subdivisions: [{ name: "广东省" }],
  //   city: { name: "深圳市" },
  //   isp: "阿里",
  //   source: "bundled-ip2region",
  //   extensions: { region: "中国|广东省|深圳市|阿里|CN", raw: { /* 按列命名的原始字段 */ } }
  // }
} finally {
  query.close();
}
```

Bun 将入口改为 `ip2region/bun`；Deno 使用 `npm:ip2region/deno`，读取本地文件需要
`--allow-read`。三个入口分别使用 `node:fs/promises`、`Bun.file`、`Deno.readFile`，
共享格式读取器和查询引擎。

内置 IPv4、IPv6 XDB 快照来自
[lionsoul2014/ip2region](https://github.com/lionsoul2014/ip2region)，固定到上游提交，
附原始许可、SHA-256 和各文件构建时间，见 [数据来源](data/README.md)。两个文件合计
约 48.4 MB（未压缩）；`openDefault()` 显式加载两份到内存，按地址族路由。
只使用 IPv4 时调用 `openDefault({ families: [4] })`，只使用 IPv6 时传入 `[6]`；
未选择的文件不会读取或分配到内存，查询未加载的地址族会报 `UNSUPPORTED_FAMILY`。不承诺快照的定位准确率或更新频率。
`metadata.datasets` 分别记录文件版本、构建和加载时间。

任何模块的导入都不会读取数据库、联网或安装依赖；只有调用加载函数才会读文件。

## 自备数据库

```js
import { openDatabase } from "ip2region/node";
import { createXDB, IP2REGION_FIELDS } from "ip2region/formats/ip2region-xdb";
import { createBIN } from "ip2region/formats/ip2location-bin";
import { createIPIP } from "ip2region/formats/ipip-ipdb";

// 仅在确认自备文件采用上游这套字段布局时使用该预设。
const xdb = await openDatabase("/data/ip2region_v6.xdb", (bytes) => createXDB(bytes, { fields: IP2REGION_FIELDS }));
const bin = await openDatabase("/data/IP2LOCATION.BIN", createBIN);
const ipdb = await openDatabase("/data/qqwry.ipdb", (bytes) => createIPIP(bytes, { language: "CN" }));
try {
  console.log(bin.lookup("2001:db8::1"));
  console.log(ipdb.lookup("2001:db8::2"));
} finally {
  xdb.close();
  bin.close();
  ipdb.close();
}
```

不依赖文件系统时，可直接传入字节：

```js
import { createLookup } from "ip2region";
import { createBIN } from "ip2region/formats/ip2location-bin";

// bytes 是应用提供的 Uint8Array；读取器复制有效视图，不受后续修改影响。
const query = createLookup(createBIN(bytes), { ownership: "owned" });
console.log(query.lookup("192.0.2.1"));
query.close();
```

| 格式入口                                          | 地址族                     | 标准字段                                             |
| ------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `ip2region/formats/ip2region-xdb` → `createXDB`   | 每份文件 IPv4 或 IPv6      | 显式配置列名后映射国家代码/名称、区域、城市、ISP     |
| `ip2region/formats/ip2location-bin` → `createBIN` | 按文件头声明 IPv4/IPv6     | 国家代码/名称、区域、城市、ISP；DB26 可提供 ASN/组织 |
| `ip2region/formats/ipip-ipdb` → `createIPIP`      | 按 metadata 声明 IPv4/IPv6 | 按字段名和选定语言映射，未知字段保留在扩展记录       |

`createXDB(bytes)` 默认只返回 `extensions.region` 原始文本，`extensions.raw` 为空，
不声明地理字段能力。需要标准字段时显式传入 `fields`；`openDefault()` 已为内置快照
配置已知布局，开箱即用的结果不受影响。

BIN 的 LITE 与商业包字段不同；DB26 是数据产品，不是另一种文件格式，也不代表
本库提供在线 DB26 的数据质量。此处 IPIP IPDB 包括
[nmgliangwei/qqwry.ipdb](https://github.com/nmgliangwei/qqwry.ipdb) 的转换格式，
IPDB 读取器不处理 XDB、CZDB、QQWry DAT 或 ZX IPv6wry。详细边界见 [格式说明](docs/formats.md)。

## 外部扩展

```js
import { createLookup, createAsyncLookup } from "ip2region";

const local = createLookup((ip) => localRecords.get(ip) ?? null);
const remote = createAsyncLookup(async (ip) => await myLookupService(ip));

// 对象或类实例也可直接传入，不要求继承或注册。
const shared = createLookup(new MyReader());
```

最小协议只有查询函数。复杂实现可选提供 `capabilities`、`metadata`、`close`。
查询函数收到规范化地址字符串，以及包含地址族、网络序字节和完整数值的第二参数。
调用对象方法时保留 `this`。第三方实现自行声明支持的运行时；核心跨平台不代表外部
读取器跨平台。见 [适配器协议与契约测试示例](docs/adapters.md)。

## 结果、错误与生命周期

标准结果包含可选的 `country: { code?, name? }`、`subdivisions: [{ code?, name? }]`、
`city: { code?, name? }`、`isp`、`asn`、`organization`、`source` 和类型化 `extensions`。
缺失字段省略，不补空字符串、不翻译或拆分地名、不用组织名代替 ISP，也不推断置信度。
各格式的原始记录结构不同，标准结果及扩展值须保持 JSON 兼容。

- `lookup(ip)`：命中返回记录，未命中返回 `null`；字段全空仍可是一条命中记录。
- `lookupMany(ips)`：保留顺序，遇到首个错误抛出。
- `lookupManySettled(ips)`：逐项返回 `{ ok: true, value }` 或 `{ ok: false, error }`。
- 异步实例的这些方法始终返回 Promise；异步批量查询先按顺序执行。
- 同步实例 `close()` 返回 void；异步实例 `close()` 返回 Promise，并等待已开始的查询。

外部传入的实例默认借用，关闭查询包装器不会关闭共享来源。需要接管时显式传入
`{ ownership: "owned" }`；`openDefault` 和 `openDatabase` 自动拥有其创建的读取器。
关闭幂等，关闭后查询抛出 `CLOSED`；释放失败也不会恢复为可用状态。

错误具有稳定 `code`：`INVALID_IP`、`INVALID_ARGUMENT`、`UNSUPPORTED_FAMILY`、
`UNSUPPORTED_LANGUAGE`、`INVALID_DATABASE`、`FILE_NOT_FOUND`、`PERMISSION_DENIED`、
`IO_ERROR`、`CLOSED`、`CONTRACT_ERROR`、`ADAPTER_ERROR`。底层异常保存在 `cause`，
数据库错误还包含格式和偏移信息，不会作为国家或城市返回。

仅接受完整裸 IP 字面量，不接受空值、空白、前导零 IPv4、作用域标识或带端口包装。
IPv6 保留全部 128 位；默认保留 IPv4-mapped IPv6 的 IPv6 身份。需要查询对应 IPv4 时
使用 `{ mappedIPv6: "ipv4" }`，仅转换精确的 `::ffff:0:0/96` 前缀；不转换 6to4、
Teredo、ISATAP 或 `::/96` 兼容地址。

## 运行时和打包

目标最低版本为 Node 22.12.0、Bun 1.2.0、Deno 2.0.0，均以真实 tarball 验证。
核心、格式入口和 Node 入口提供 ESM/CJS；Bun/Deno 原生加载入口仅提供 ESM。
生产依赖为零；官方 Node 读取器仅作为开发时的独立参考验证，不会装入生产包。

```js
const { createLookup } = require("ip2region");
const { openDefault } = require("ip2region/node");
```

## 迁移和开发

新接口替换旧构造器、`search`、`searchRaw`、`disableIpv6` 和未受约束的深层导入。
旧 `.db`、ZX IPv6wry 数据及其读取器、IPv6 高 64 位分派、地名字符串拆分、安装脚本和自动数据更新脚本已移除。
迁移示例见 [迁移说明](docs/migration.md)。数据的下载、更新和授权由使用者管理。

```sh
pnpm install --frozen-lockfile --ignore-scripts
npm test
npm run test:package
npm run benchmark
```

`test:package` 会打包到临时目录，检查 ESM/CJS、类型声明、导出隔离和 Node 权限。
设置 `IP2REGION_BUN=bun`、`IP2REGION_DENO=deno` 可同时验证原生运行时；
`IP2REGION_NODE` 可指定 Node 消费者版本。共享测试使用合成 fixture，XDB（含固定真实快照）、BIN/IPDB 另与
官方参考读取器交叉验证，无需下载真实商业数据。

性能记录加载时间、内存和查询延迟，与定位质量分开；见 [性能基线](docs/performance.md)。
