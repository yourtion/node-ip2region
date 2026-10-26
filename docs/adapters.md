# 自定义数据源契约

自定义接入统一通过 `source` 参数。最简单的数据源是查询函数；需要状态、能力声明或资源清理时，
使用对象或类实例。无需继承、注册，也不会由库猜测构造参数。

| 数据源          | 客户端                           | 必需方法                             | 可选清理                      | 返回值                 |
| --------------- | -------------------------------- | ------------------------------------ | ----------------------------- | ---------------------- |
| 同步函数 / 对象 | `new IP2Region({ source })`      | 函数本身或 `lookup(ip, parsed)`      | `close(): void`               | 记录或 `null`          |
| 异步函数 / 对象 | `new AsyncIP2Region({ source })` | 函数本身或 `lookupAsync(ip, parsed)` | `closeAsync(): Promise<void>` | `Promise<记录或 null>` |

以上两个类均从 `ip2region` 导入，该入口不会依赖文件系统。运行时入口 `ip2region/node`、
`ip2region/bun`、`ip2region/deno` 的 `IP2Region` 也接受同步 `source`，并额外支持数据库配置。
根入口的 `IP2Region` 必须提供 `source`；运行时入口省略参数时加载内置数据。
`source` 与 `database`、`databases`、`families` 配置互斥，文件格式与读取选项见[格式说明](formats.md)。

## 输入与返回值

函数签名和接口从公开入口导入：

```ts
import type { Adapter, AsyncAdapter, LookupFunction, AsyncLookupFunction, LookupResult, ParsedIP } from "ip2region";
```

- `ip: string` 是校验后的规范化地址。例如 `2001:0DB8:0:0:0:0:0:1` 会变为 `2001:db8::1`。
- `parsed: ParsedIP` 包含 `address`、`family: 4 | 6`、网络序 `bytes: Uint8Array`、
  完整无符号 `value: bigint` 和可选的 `mappedIPv4`。每次查询使用独立上下文，不应修改其内容。
- IPv4-mapped IPv6 默认保持 IPv6 身份；配置 `mappedIPv6: "ipv4"` 后，传给来源的是对应 IPv4 地址和上下文。
- 无效地址在调用来源前以 `INVALID_IP` 拒绝。完整 IPv6 的低 64 位不会被丢弃。
- 命中返回 `LookupResult` 或其扩展类型；未命中**只返回 `null`**。`{}` 仍是一条命中记录。
- `country`、`city`、`subdivisions` 等标准字段结构见 README。供应商数据应在来源中映射成标准字段；
  未知字段可放到类型化 `extensions`，缺失字段省略。
- 不返回 `undefined`、字符串、数组或错误占位记录。同步来源返回 Promise、异步来源直接返回普通值，
  都会产生 `CONTRACT_ERROR`。
- 标准结果及嵌套扩展应保持 JSON 兼容；不要包含 bigint、函数、循环引用或非有限数值。
  类型定义和示例测试检查这项契约，查询热路径只检查顶层返回值，不深度遍历或复制结果。
  若返回共享对象，来源和应用需自行协调修改行为。

对象方法调用保留 `this`。来源可自行拥有索引、连接或缓存；库不会构造外部类，也不会推断其运行时兼容性。

## 能力、元数据与错误

对象可选提供只读属性 `capabilities` 和 `metadata`：

| 属性                     | 契约                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `capabilities.families`  | 非空、不重复的 `[4]`、`[6]` 或双栈列表；查询其他地址族在调用来源前抛出 `UNSUPPORTED_FAMILY`                        |
| `capabilities.fields`    | 不重复、非空的字段名；空数组表示不提供标准字段                                                                     |
| `capabilities.languages` | 不重复、非空的语言名；具体语言选择由读取器处理                                                                     |
| `metadata`               | 提供时必须包含非空 `id`；可选记录 `format`、`dataVersion`、`builtAt`、`loadedAt`、`attribution`、`url`、`datasets` |

能力和元数据均为属性，不是必需方法。未声明能力表示未知，不自动推断，也不补充支持范围。
这些声明在创建实例时校验，实例使用期间应保持不变。元数据其余字段由提供方保证准确；
字段和语言声明不会代替读取器自身的解码与校验。

来源抛出或拒绝普通异常时，客户端报告 `ADAPTER_ERROR`，原异常保存在 `cause`。
抛出 `IP2RegionError` 可保留其稳定错误码和原对象；不要把错误当作国家、城市或未命中返回。
自定义文件格式的解码错误应使用 `INVALID_DATABASE`，可在 `details` 中补充格式、偏移等定位信息。

## 批量查询与生命周期

同步实例只暴露 `lookup`、`lookupMany`、`lookupManySettled`、`close`；
异步实例只暴露对应的 `lookupAsync`、`lookupManyAsync`、`lookupManySettledAsync`、`closeAsync`。
数据库的异步加载 `await IP2Region.open(options)` 得到的仍然是同步查询实例。

批量查询保持输入顺序。普通批量遇到错误会失败；settled 批量逐项返回
`{ ok: true, value }` 或 `{ ok: false, error }`。异步批量默认顺序调用来源，可在单次调用中
显式设置有界并发：

```js
const results = await query.lookupManyAsync(ips, { concurrency: 4 });
const settled = await query.lookupManySettledAsync(ips, { concurrency: 4 });
```

第二个参数的公开类型为 `AsyncBatchOptions`。`concurrency` 必须是正的安全整数，默认 `1`；
无效选项会在获取输入迭代器前以 `INVALID_ARGUMENT` 拒绝。上限针对单次批量调用，
同时发起多个批量时，各调用分别计算并发数。输入接受同步 `Iterable<string>`，按空闲槽位
逐项读取，不会先展开整个输入；返回数组仍会占用与输入数量成正比的内存。

并发任务可以乱序完成，返回结果始终与输入顺序对应。普通异步批量观察到首个失败后停止
读取输入和启动查询，关闭尚未读完的迭代器，并等待已经启动的请求结束后拒绝；不会取消
已发出的外部请求。settled 批量记录每项查询错误并继续处理剩余输入。输入迭代器自身抛错
则两种方法都会停止并等待在途请求结束后拒绝，保留该错误；迭代器清理失败不会覆盖先前错误。
库不会自动重试，也不会为来源增加取消或超时能力。

外部来源默认**借用**：客户端关闭后不可再查询，但不会关闭来源；多个客户端可以共享它。
需要转交清理责任时传入 `ownership: "owned"`，并确保同一来源只有一个所有者。
来源自己的清理方法可选；没有该方法时只关闭客户端。数据库配置创建的读取器由客户端自动拥有。
外部来源的所有权在实例创建成功后转交；构造失败时，调用方仍负责清理自己的来源。

关闭幂等。同步关闭立即标记客户端关闭，然后最多调用一次来源的 `close`。
异步关闭立即拒绝新查询，等待已开始的查询成功或失败后，再最多调用一次 `closeAsync`；
重复调用返回同一个 Promise。清理失败仍保持关闭状态，不会自动重试。
批量查询期间关闭客户端也遵循这一规则：已启动的请求继续完成，剩余项不再调用来源，
尚未启动的查询产生 `CLOSED`。普通批量按首个错误规则失败；settled 批量为这些项记录 `CLOSED`。
不要在来源的在途查询内部等待其所属客户端的关闭，否则会形成相互等待。

## 可运行示例与可复用测试

[examples/custom](../examples/custom/) 提供同步函数、类、异步服务和自定义 JSON 字节格式，
通过公开包入口导入，随 npm 包分发，并在 Node、Bun、Deno 上验证。
文件目录与运行命令见[示例说明](../examples/custom/README.md)。

复用 `contracts.mjs` 时传入测试注册函数、每次创建独立来源的工厂函数，以及 `{ hit, miss, expected }` 样本。
测试注册函数可使用 Node 的 `test`、Bun 的 `test` 或 `Deno.test`。
再为自己的格式或传输补充损坏数据、权限、超时和资源清理测试。
这些测试验证接口与解码行为，地理位置准确性需要单独的可追溯数据样本。
