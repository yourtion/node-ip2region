# npm 发布

`main` 使用 `.github/workflows/release.yml`，只在推送 `v*` tag 时触发发布。
普通 `main` 提交、PR 和 GitHub Release 页面操作都不会触发发包。
版本由 `package.json` 指定；仅提交 workflow 不会发布 npm 版本。
旧 `v2` 分支不使用这套流程。

## 首次发布前配置 npm

在 npm 的 `ip2region` 包 Settings → Trusted publishing 中添加 GitHub Actions：

| 配置项               | 值                             |
| -------------------- | ------------------------------ |
| Organization or user | `yourtion`                     |
| Repository           | `node-ip2region`               |
| Workflow filename    | `release.yml`（仅文件名）      |
| Environment name     | 留空；job 没有配置 environment |
| Allowed actions      | 允许直接 `npm publish`         |

这套流程直接发布，不使用 `npm stage publish`；只允许暂存的 publisher 不适用。
无需添加 `NPM_TOKEN` 或 `NODE_AUTH_TOKEN`，也无需授予独立的 `npm dist-tag` 权限。
Publishing access 中限制传统 token 的选项与 OIDC publisher 的 Allowed actions 是不同设置。

**代码接入不等于 npm 后台已绑定，也不等于 OIDC 已验证。** 实际验证以 Release 工作流和 npm 发布记录为准。
按 [npm 官方文档](https://docs.npmjs.com/trusted-publishers/)，新 publisher 配置需在创建后
两天内完成首次成功发布，否则会过期。因此准备首发时再完成或核实绑定，不为验证配置提前发包。
公开仓库、公开包通过 OIDC 发布会自动生成 npm provenance；这里不提供 GitHub 附件
attestation，也没有 Release 二进制附件。

## 流程与验证

发布使用 GitHub 托管 Ubuntu、Node 24，日志检查 npm 至少为 11.5.1；库本身的最低
Node 版本仍为 22.12.0。pnpm 固定为 9.15.9，只负责冻结锁文件安装，npm CLI 负责打包和发布。

1. 安装项目依赖前校验严格的 `v<SemVer>`、`package.json` 版本和 tag 实际提交。
   tag 提交必须属于远端 `main` 历史；轻量 tag 与 annotated tag 均支持。不接受 `+build`。
2. 运行类型检查、构建、核心/参考测试和无网络发布 helper 测试。
3. 用 `npm pack --ignore-scripts` 生成 `.tgz`，核对名称、版本、所有公开入口和类型文件。
4. 对同一个 `.tgz` 运行 Node、Bun 1.2.0、Deno 2.0.0 消费者测试，包括 ESM/CJS、原生加载、
   权限失败、纯内存模式、双栈数据库 SHA-256 和来源许可，并确认压缩包未被测试修改。
5. 发布已检查的 `.tgz`，不会重新打包。`prepublishOnly` 所需构建与消费者检查已显式执行；
   pack/publish 使用 `--ignore-scripts`，避免再次运行生命周期改写产物。
6. npm 成功后才创建 GitHub Release，或将已有 draft 完成。稳定版走 `latest`，
   预发布走 `next` 并标记 GitHub prerelease。

普通 CI 也运行 helper 测试和 actionlint。helper 测试模拟 registry 错误、首次发布、
npm 成功后 GitHub 失败及重跑，不调用真实发布 API。这些测试不能证明 npm OIDC 认证成功。

可以在本地仅验证，不创建 tag、不联网发布：

```sh
pnpm install --frozen-lockfile --ignore-scripts
npm run typecheck
npm test
node scripts/npm-release.mjs pack v3.0.0 /tmp/ip2region-release
IP2REGION_BUN=bun IP2REGION_DENO=deno npm run test:packed -- /tmp/ip2region-release/ip2region-3.0.0.tgz
```

`pack` 的版本参数必须匹配当次 `package.json`。常规 `npm run test:package` 仍会自行打包测试。

## 正式发版与重跑

只有决定实际发布后，才执行以下流程：

1. 修改 `package.json` 和 CHANGELOG；预发布使用例如 `3.0.0-rc.1`。将改动提交到 `main`，
   等跨平台 CI 通过，确认 npm Trusted Publisher 配置有效。
2. 在确认过的提交上创建对应 tag，例如 `git tag -a v3.0.0 -m "Release 3.0.0"`，
   再执行 `git push origin v3.0.0`。**推 tag 会真实发包。**
3. 在 Actions 的 Release 工作流中检查 npm 发布和 GitHub Release 结果。

失败时在 Actions 重跑原 tag 的失败 job。helper 查询精确的包版本：已存在就跳过 npm，
只有结构化 `E404` 才判定未发布；认证、网络、限流和无效响应直接失败。
npm 已成功而 GitHub 失败时，重跑只补 GitHub Release。已有 Release 会更新 draft/prerelease
状态；分页查询失败不会被误当成不存在。不要删除已发版本或移动 tag 来重试。
代码变化需要新的 npm 版本和新 tag；重跑不会改写已发布版本或重新调整其 dist-tag。

发布并发组跨版本串行且不会中断正在发布的任务，但 GitHub concurrency 不保证顺序，
也只保留一个 pending。一次发一个版本，等完成后再推下一个 tag；不要倒序发布稳定版，
避免 `latest` 回退。

此实现依据 [npm-trusted-publish skill](https://github.com/yourtion/skills/tree/e07da20166fb746ff515164b5823c6decc3ff12c/skills/npm-trusted-publish)
适配，保留本项目的单包、双模块与三运行时产物检查。
