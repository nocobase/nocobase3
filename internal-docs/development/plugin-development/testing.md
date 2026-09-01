---
title: 测试和验证插件
description: 根据 NocoBase 插件的 Client、Server、Database、Queue、I18n、Skills 和 package exports 变化选择行为级测试，并完成插件与目标 App 的分层验证。
---

# 测试和验证插件

测试统一放在插件根目录 `tests/`，文件名使用 `*.test.ts` 或 `*.test.tsx`。测试目录可按 unit、integration 或能力拆分，但不能把测试放在 `src` 或实现文件旁。

## 按变化选择测试

| 变化                      | 最少测试                                                     |
| ------------------------- | ------------------------------------------------------------ |
| Client descriptor/options | factory 解析后的 entries 和 options                          |
| App/Settings Routes       | parent、path、navigation、access、component loader           |
| Client Component          | props、交互、公共 export 和目标 App 渲染                     |
| Client React Provider     | descriptor、Context 行为、顺序和 cleanup                     |
| Client ServiceProvider    | Service/Refine 注册、options、lifecycle、失败清理和副作用    |
| Service/Provider          | Token、惰性单例、生命周期、错误清理                          |
| API/Root Route            | 真实 router 请求、状态码、响应、权限、base path              |
| Server plugin             | serviceProviders/routes/database/queue composition           |
| Migration/Seed            | 真实数据库的 schema、metadata、up/down、数据结果             |
| Queue Job                 | handler、payload、Service、重试/幂等和可观察结果             |
| Plugin I18n               | key 结构、namespace、双语言渲染、请求/外发语言和 lazy chunks |
| Registry                  | config、build、materialize、App typecheck/build              |
| Plugin Skills             | 结构、同步和语义检查                                         |
| exports/publish           | source export、dist export、tarball 内容和 declarations      |

## Client 测试

不要只断言模块存在。Components 测试 props、交互和正式 public export；Routes 测试 descriptor 并实际调用 component loaders；React Provider 分别测试 declaration、组合顺序和 Context 行为；ServiceProvider 使用独立 Client Application 或最小 fixture 验证 Container binding、Refine 注册、options、完整 lifecycle、异步失败和逆序清理。详细边界见 [Client 模块选择](./client.md)。

## Server 测试

用独立 `ServiceContainer` 验证原始 Token、Provider 注册、惰性单例和完整生命周期。简单 Route 直接用
production contribution 的 `createRouter()` 创建 router，注入测试 Token 后发出真实
请求；不要为了测试导出 `registerXxxRoutes(router, ...): void`。复杂业务域可以分别测试
返回 `Hono` 的 `createXxxRoutes(options)` 子 router，以及 production contribution 的
Token 解析、安全 wiring 和挂载。目标 App integration test 再验证 `/api` 或 root
前缀、public base path、多个 contributions、真实登录和权限。完整示例见
[Server Route 最佳实践示例](./server-routes-examples.md)。Plugin test 应确保
`server/plugin.ts` 只声明当前仍存在的 contributions。

## Client Route 测试

Plugin test 验证 App/Settings descriptor、auth/access/navigation 和实际
`componentLoader()`；需要确认注册或 composition 时，再用 `client:inspect --json` 查看目标 App 的
composition 快照；目标 App
测试验证导航、access、override、Provider 和页面行为。页面调用 Server API 时，还要
完成真实页面到 API 的 full-stack 闭环。完整示例见
[Client Route 最佳实践示例](./client-routes-examples.md)。

## Database 和 Queue 测试

Migration 使用真实测试数据库验证物理 schema 和 metadata，执行 `up`，可逆时执行 `down`。Seed 验证已有数据和重复执行策略。Queue 测试不要只断言 job 文件被发现；应执行 handler，验证 payload、服务调用、重试/失败和持久结果。

## Registry 测试

验证 `registry.config.json`、item roots、入口和公开 imports，再运行 Registry build。将 item materialize 到临时或目标 App，验证文件、source extension、typecheck、test 和 build。App-owned 副本不是插件测试的 canonical source，升级策略也不能只靠快照证明。

## I18n 测试

以 `en-US` 为 key 结构的 source of truth，运行 `pnpm i18n:check` 并用类型检查发现其他语言的遗漏或多余 key。Client 至少在两种语言下渲染真实文本；公共组件还要放入 App-owned render tree，确认它显式使用插件 namespace。Server 用真实请求验证 session/header/default locale resolution，并验证结构化 error 经目标 App HTTP error handler 输出稳定 `code/ns/key/params` 和翻译后的 `message`。

Job、cron、邮件或通知必须覆盖非默认收件人语言，并证明代码先加载资源再取得固定 translator。Build 和 tarball 检查每种支持语言的 dynamic import chunk 都存在。Inspector 只静态报告 locale declaration 是否进入 composition；它不执行 loader、不展开 locale keys，也不验证翻译、fallback 或 language switching。完整规则见[插件国际化](./i18n.md)。

## Plugin Skills 检查

可以机械验证：

- Skill 目录名归当前插件前缀所有；
- 每个目录存在 `SKILL.md` 且 frontmatter 有效；
- 不含脚手架占位符或示例能力；
- `package.json#files` 包含 `skills`；
- 同步后 App 副本与插件源一致，删除和冲突规则生效。

固定字符串或快照不能证明 Skill 的语义质量。开发 Agent 仍需逐项核对 Skill 描述的公共入口、工作流、权限、约束和验证是否与真实插件一致。

`packages/examples/app-plugin-skills-example` 展示了两层检查如何配合：插件测试核对 exports、Route
认证和 Skill 内容；目标 App 测试再通过公开 component export 渲染页面，并对真实 App
Server 发出匿名和已登录请求。只有后者能证明“App Agent 按 Skill 执行后得到可见结果”，
`plugin:inspect` 的 `contentMatches: true` 只能证明同步副本与源文件一致。

## Package 和发布检查

Client/Server 能力变化时同时检查 source `exports` 与 `publishConfig.exports`。构建后确认 declarations 可解析；`files` 只包含预期发布内容，tarball 不含测试和配置源码。发布包保留 `CHANGELOG.md`，变更摘要面向外部读者时使用 English。

## 分层验证

先运行插件：

```bash
pnpm --filter <plugin-package> lint
pnpm --filter <plugin-package> typecheck
pnpm --filter <plugin-package> test
pnpm --filter <plugin-package> build
```

Inspector 是可选的只读装配诊断，不是固定验证阶段。只有注册或 composition 发生变化，或者正在排查声明为什么没有进入目标 App 时，才运行对应命令查看装配快照：

```bash
pnpm plugin:inspect <name> --app <target-app> --json
pnpm --filter <target-app> client:inspect --json # Client changes only
pnpm --filter <target-app> server:inspect --json # Server changes only
```

不要默认把三个 Inspector 全部运行一遍。按变化选择主要验证方式：

| 变化                                        | 主要验证方式                                                      | Inspector 的作用                                |
| ------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| Service、组件、Route handler 或 Job 行为    | 对应模块行为测试                                                  | 通常不需要                                      |
| Route 权限或公开协议边界                    | 匿名、已认证、已授权和拒绝路径的请求测试                          | 不能验证安全性                                  |
| Migration 或 Seed                           | 真实测试数据库上的 schema、metadata、`up`、`down` 和重复执行测试  | 只能在已声明时报告 location                     |
| 翻译文本、fallback 或语言切换               | `i18n:check`、渲染、请求和非默认收件人语言测试                    | 不能验证内容或运行时选择                        |
| 新增、删除或重排 Client/Server contribution | declaration test、目标 App typecheck/test/build，按风险运行时验证 | 可查看声明是否进入 composition 及其顺序         |
| 修改插件登记或 Skills 同步                  | 注册命令结果、源文件和目标 App 状态                               | `plugin:inspect` 可辅助定位静态登记或同步不一致 |

使用 Inspector 时，JSON 先读取 `ok` 和 `status`，进入 `result` 后再读取 `consistent`、`issues` 和 `suggestions`。`consistent: true` 只表示该命令观察到的装配事实没有冲突，不表示插件、业务行为或安全边界正确。

再运行目标 App：

```bash
pnpm --filter <target-app> typecheck
pnpm --filter <target-app> test
pnpm --filter <target-app> build
```

最后按风险启动 App，验证真实页面、Settings 导航与 access、HTTP 路径、Migration/Seed、Job、语言切换和 Agent 对同步 Skills 的发现。命令成功不等于运行时闭环已验证。

Inspector 只提供静态登记和 composition 的局部快照，并报告其检查范围内确定的装配问题。Client inspection 不实例化或运行 ServiceProvider、不加载页面或语言消息、不渲染 React Provider；Server inspection 不执行 ServiceProvider、Route factory、Job 或数据库操作。Agent 通过模块文档、源码、类型、行为测试和目标 App 运行结果理解实现，不根据 Inspector 推断业务正确性，也不把 `consistent: true` 作为完成条件。

## 完成条件

- 测试位于 plugin-root `tests/` 且覆盖变化行为；
- Client、Server、Database、Queue 的 declaration 与实现一致；
- Skills 通过机械检查并由 Agent 完成语义核对；
- package exports、declarations 和发布文件正确；
- 插件及目标 App 的相关检查通过；
- 高风险路径已做运行时验证；
- 最终报告列出执行命令、结果、未执行项和剩余限制。
