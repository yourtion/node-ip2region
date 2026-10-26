# ip2region

离线查询 IPv4 / IPv6 的国家、地区、城市和运营商，支持 Node.js、Bun、Deno，零运行时依赖。
内置双栈 XDB 数据，也可使用自己的 XDB、IP2Location BIN、IPIP IPDB 文件，或接入自定义数据源。

## 安装

| 运行时  | 最低版本 | 安装                          |
| ------- | -------- | ----------------------------- |
| Node.js | 22.12.0  | `npm install ip2region`       |
| Bun     | 1.2.0    | `bun add ip2region`           |
| Deno    | 2.0.0    | 直接导入 `npm:ip2region/deno` |

## 快速开始

```js
import { IP2Region } from "ip2region/node";

const query = new IP2Region();
try {
  console.log(query.lookup("120.24.78.68"));
  // {
  //   country: { name: "中国", code: "CN" },
  //   subdivisions: [{ name: "广东省" }],
  //   city: { name: "深圳市" },
  //   isp: "阿里",
  //   source: "bundled-ip2region",
  //   extensions: { region: "中国|广东省|深圳市|阿里|CN", raw: { ... } }
  // }
  console.log(query.lookup("2001:4860:4860::8888")?.country);
} finally {
  query.close();
}
```

Bun 将导入改为 `ip2region/bun`，运行 `bun app.mjs`；Deno 使用
`npm:ip2region/deno`，运行 `deno run --allow-read app.mjs`。
CommonJS 使用 `const { IP2Region } = require("ip2region/node")`。
核心、格式和 Node 入口提供 ESM/CJS 与 TypeScript 类型；Bun、Deno 入口提供 ESM。

构造器同步读取并校验数据库，返回后即可查询；失败直接抛出错误。
希望异步读取文件时，使用同一套配置：

```js
const query = await IP2Region.open({ families: [4] });
const result = query.lookup("120.24.78.68"); // 加载完成后仍然同步查询
query.close();
```

默认加载合计约 **48.4 MB** 的内置数据库文件；读取和复制还会产生额外内存开销。
建议在应用启动时创建一次并复用，同步构造会阻塞当前线程，异步打开仍需执行解析和校验。
只查询 IPv4 时配置 `families: [4]`（文件约 11.1 MB），只查询 IPv6 时配置 `[6]`（约 37.3 MB）。
查询未加载的地址族会抛出 `UNSUPPORTED_FAMILY`。
模块导入不会读取数据库，查询无需联网，数据不会自动更新。
内置快照的版本、构建时间、许可与 SHA-256 见[数据来源](data/README.md)。

## 查询与结果

| 方法                     | 行为                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `lookup(ip)`             | 命中返回记录，未命中返回 `null`，无效输入抛出错误          |
| `lookupMany(ips)`        | 按输入顺序返回结果，遇到首个错误抛出                       |
| `lookupManySettled(ips)` | 按顺序返回 `{ ok: true, value }` 或 `{ ok: false, error }` |
| `close()`                | 释放实例；重复调用安全，关闭后查询抛出 `CLOSED`            |

结果字段均可缺省，取决于数据库。`country`、`city` 为 `{ code?: string; name?: string }`，
`subdivisions` 为同结构的地区数组；`isp`、`organization`、`source` 为字符串，`asn` 为数字，
`extensions` 保留格式专属的 JSON 兼容原始数据。TypeScript 可从 `ip2region` 导入 `LookupResult` 等类型。
未知字段省略，不填空字符串，也不从地名或组织名推断其他字段。

仅接受完整 IP 字面量，不接受空白、端口、URL、IPv4 前导零或 IPv6 作用域标识。
IPv4-mapped IPv6 默认作为 IPv6 查询；接收映射形式的 IPv4 地址时显式配置：

```js
const query = new IP2Region({ families: [4], mappedIPv6: "ipv4" });
query.lookup("::ffff:120.24.78.68");
query.close();
```

错误可通过 `error.code` 区分，例如 `INVALID_IP`、`UNSUPPORTED_FAMILY`、
`INVALID_DATABASE`、`FILE_NOT_FOUND`、`PERMISSION_DENIED` 和 `CLOSED`；底层异常保存在 `cause`。
定位结果与覆盖范围取决于数据源，测试通过不代表地理位置准确。

## 使用自己的数据库

`database` 配置接受文件路径、`file:` URL 或 `Uint8Array`，构造器和 `IP2Region.open()` 参数一致：

```js
import { IP2Region } from "ip2region/node";

const query = new IP2Region({
  database: { format: "bin", path: "/data/IP2LOCATION.BIN" },
});
try {
  console.log(query.lookup("120.24.78.68"));
} finally {
  query.close();
}
```

| `database.format` | 其他选项与行为                                                   |
| ----------------- | ---------------------------------------------------------------- |
| `"xdb"`           | `fields` 显式指定列名；省略时只返回 `extensions.region` 原始文本 |
| `"bin"`           | 按产品类型读取字段，DB26 可提供 ASN 和组织                       |
| `"ipip"`          | `language` 选择文件内的语言，默认 `"CN"`                         |

XDB 示例：`database: { format: "xdb", path, fields: ["country_name", "region_name", "city_name", "isp", "country_code"] }`。
列顺序必须与文件实际布局一致。已有字节时将 `path` 换为 `data: bytes`，二者互斥。
每份文件支持的地址族由文件头决定；自备数据不会与内置数据自动合并或回退。
相对路径从应用工作目录解析。读取器复制输入字节，自备数据的获取、更新和授权由应用管理。
格式读取器也可单独从 `ip2region/formats/*` 导入，详细支持范围见[格式说明](docs/formats.md)。

自备 IPv4、IPv6 文件可以按地址族显式组合，各自保留字段布局和来源信息：

```js
const query = await IP2Region.open({
  databases: {
    4: { format: "xdb", path: "/data/custom-v4.xdb" },
    6: { format: "xdb", path: "/data/custom-v6.xdb" },
  },
});
try {
  console.log(query.lookup("120.24.78.68")?.extensions);
  console.log(query.lookup("2001:4860:4860::8888")?.extensions);
} finally {
  query.close(); // 统一释放两份读取器
}
```

`databases` 至少配置 `4` 或 `6` 中的一项；指定地址族必须被对应文件支持。
XDB 的 `fields` 规则与单库相同，省略时保留原始文本。组合按地址族路由，不进行命中回退或字段合并。
同步构造也支持此配置；加载任一文件失败会清理此前已创建的读取器。

## 自定义接入

函数、对象或类实例均通过 `source` 传入。同步来源使用 `IP2Region`，异步来源使用
`AsyncIP2Region`，两类实例具有明确不同的方法名和固定的返回类型：

```js
import { IP2Region } from "ip2region";

const records = new Map([["192.0.2.1", { country: { code: "CN" } }]]);
const query = new IP2Region({ source: (ip) => records.get(ip) ?? null });
console.log(query.lookup("192.0.2.1"));
query.close();
```

根入口只处理传入的来源，不依赖文件系统。原生运行时入口也接受相同的同步 `source` 配置。
同步对象实现 `lookup(ip, parsed)` 和可选 `close()`；异步对象实现 `lookupAsync(ip, parsed)` 和
可选 `closeAsync()`。对象方法保留 `this`，无需继承或注册。
异步客户端只暴露 `lookupAsync`、`lookupManyAsync`、`lookupManySettledAsync`、`closeAsync`，均返回 Promise。

外部来源默认借用；需要转交关闭责任时配置 `ownership: "owned"`。
数据库配置创建的读取器由实例自动拥有。`source`、`database`、`databases` 与内置 `families` 配置互斥。
完整输入、返回值、错误、批量和生命周期规则见[自定义接入契约](docs/adapters.md)。
[可运行测试示例](examples/custom/) 包括同步函数、类实例、异步服务和自定义 JSON 字节格式，
使用公开接口并在三个运行时验证，可直接复制到自己的适配器项目。

异步批量默认串行。接入外部服务时可显式设置并发上限，返回值仍按输入顺序排列：

```js
const results = await remote.lookupManyAsync(ips, { concurrency: 4 });
const settled = await remote.lookupManySettledAsync(ips, { concurrency: 4 });
```

这里 `remote` 是 `AsyncIP2Region` 实例，`ips` 是 IP 字符串的可迭代对象。
`concurrency` 必须是正的安全整数。普通批量在观察到错误后停止派发，等待已启动查询结束再抛出错误；
settled 版本保留每项成功或失败的结果并继续查询。并发上限按单次批量调用计算；不表示请求取消或超时。
关闭会拒绝新的查询，并等待已启动查询结束。详细迭代器与关闭规则见[接入契约](docs/adapters.md)。

## 维护内置数据

仓库提供显式的 `data:stage`、`data:validate`、`data:apply` 命令，用于固定 upstream revision、
暂存候选快照、校验两份文件并生成变化报告，再更新数据与元信息。
GitHub Actions 的 `Data updates` 每周日北京时间 00:00（UTC 周六 16:00）检查上游，内容变化且校验通过后
自动创建或更新数据 PR，也可手动运行。PR 合并和 npm 发布仍由维护者决定。
这是仓库维护工具，不会在导入、安装或查询时联网；操作与失败恢复说明见[数据维护](data/README.md)。

## 从 3.x 升级

4.0 统一使用类构造器，并明确区分同步与异步方法。已有 3.x 调用需要调整：

| 3.x                                                    | 4.0                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `createLookup(source, options)`                        | `new IP2Region({ source, ...options })`，从根入口导入                                                           |
| `createAsyncLookup(source, options)`                   | `new AsyncIP2Region({ source, ...options })`                                                                    |
| 原生入口 `openDefault(options)`                        | `await IP2Region.open(options)`                                                                                 |
| 原生入口 `openDatabase(path, factory, options)`        | 内置格式使用 `await IP2Region.open({ database: { format, path }, ...options })`；自定义读取器通过 `source` 接入 |
| 异步客户端 `lookup/lookupMany/lookupManySettled/close` | `lookupAsync/lookupManyAsync/lookupManySettledAsync/closeAsync`                                                 |
| 异步 adapter 的 `close()`                              | `closeAsync()`；`lookupAsync()` 保持不变                                                                        |

同步查询方法不变，外部来源仍默认借用。构造原生客户端时会同步读文件；需要保留异步加载行为，
请使用 `IP2Region.open()`。3.x 类型 `ReaderFactory` 和 `DefaultOptions` 不再导出；原生入口现在提供
`IP2RegionOptions`、`DatabaseOptions`、`DatabasesOptions`，自定义来源使用根入口的 adapter 类型。
运行时最低版本与 3.0 相同，见[安装](#安装)。

代码采用 [MIT](LICENSE) 许可；内置数据许可见[数据来源](data/README.md)。
