# 自定义接入示例

这些文件既是接入示例，也是库实际执行的契约测试。它们通过 `ip2region` 公开入口导入，
不使用内部模块；实现通过 JSDoc 的 `Adapter` / `AsyncAdapter` 类型检查。
完整输入、返回、错误与生命周期契约见 [适配器指南](../../docs/adapters.md)。

- `readers.mjs`：同步 Map 类、异步服务适配器、自定义 JSON 字节格式。
- `contracts.mjs`：给自己的来源复用的同步和异步契约测试。
- `custom-suite.mjs`：函数与类的接入方式，以及规范化、批量、错误和关闭测试。
- `custom.test.mjs`：独立的 Node 测试入口。

在仓库根目录执行：

```sh
npm run test:examples
```

已安装 npm 包时：

```sh
node --test node_modules/ip2region/examples/custom/custom.test.mjs
```

测试使用合成数据和可注入的异步函数，无需网络、令牌或额外依赖。
Node/Bun/Deno 的完整消费者测试也执行同一套案例。
