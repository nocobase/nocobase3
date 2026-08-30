---
title: 测试和验证插件
description: 根据 NocoBase 插件的 Client、Server、Database、Queue、Skills 和 package exports 变化选择行为级测试，并完成插件与目标 App 的分层验证。
---

# 测试和验证插件

测试统一放在插件根目录 `tests/`，文件名使用 `*.test.ts` 或 `*.test.tsx`。测试目录可按 unit、integration 或能力拆分，但不能把测试放在 `src` 或实现文件旁。

## 按变化选择测试

| 变化                      | 最少测试                                                |
| ------------------------- | ------------------------------------------------------- |
| Client descriptor/options | factory 解析后的 entries 和 options                     |
| App/Settings Routes       | parent、path、navigation、access、component loader      |
| Provider/bootstrap        | Context 行为、顺序、Refine 注册和 cleanup               |
| Service/Provider          | Token、惰性单例、生命周期、错误清理                     |
| API/Root Route            | 真实 router 请求、状态码、响应、权限、base path         |
| Server plugin             | providers/routes/database/queue composition             |
| Migration/Seed            | 真实数据库的 schema、metadata、up/down、数据结果        |
| Queue Job                 | handler、payload、重试/失败和可观察结果                 |
| Plugin Skills             | 结构、同步和语义检查                                    |
| exports/publish           | source export、dist export、tarball 内容和 declarations |

## Client 测试

不要只断言模块存在。测试 `defineAppRoutes()` 和 `defineSettingsRoutes()` 生成的 descriptor，实际调用 component loaders；验证 Settings access/navigation。对 bootstrap 使用最小 Refine stub 验证资源和 options；对 Provider 使用 jsdom/Testing Library 验证 Context 的可见行为。

## Server 测试

用独立 `ServiceContainer` 验证 Provider 注册、惰性实例和生命周期。简单 Route 直接用
production contribution 的 `createRouter()` 创建 router，注入测试 Token 后发出真实
请求；不要为了测试导出 `registerXxxRoutes(router, ...): void`。复杂业务域可以分别测试
返回 `Hono` 的 `createXxxRoutes(options)` 子 router，以及 production contribution 的
Token 解析、安全 wiring 和挂载。目标 App integration test 再验证 `/api` 或 root
前缀、public base path、多个 contributions、真实登录和权限。完整示例见
[Server Route 最佳实践示例](./server-routes-examples.md)。Plugin test 应确保
`server/plugin.ts` 只声明当前仍存在的 contributions。

## Client Route 测试

Plugin test 验证 App/Settings descriptor、auth/access/navigation 和实际
`componentLoader()`；`client:inspect --json` 验证目标 App 的最终 composition；目标 App
测试验证导航、access、override、Provider 和页面行为。页面调用 Server API 时，还要
完成真实页面到 API 的 full-stack 闭环。完整示例见
[Client Route 最佳实践示例](./client-routes-examples.md)。

## Database 和 Queue 测试

Migration 使用真实测试数据库验证物理 schema 和 metadata，执行 `up`，可逆时执行 `down`。Seed 验证已有数据和重复执行策略。Queue 测试不要只断言 job 文件被发现；应执行 handler，验证 payload、服务调用、重试/失败和持久结果。

## Plugin Skills 检查

可以机械验证：

- Skill 目录名归当前插件前缀所有；
- 每个目录存在 `SKILL.md` 且 frontmatter 有效；
- 不含脚手架占位符或示例能力；
- `package.json#files` 包含 `skills`；
- 同步后 App 副本与插件源一致，删除和冲突规则生效。

固定字符串或快照不能证明 Skill 的语义质量。开发 Agent 仍需逐项核对 Skill 描述的公共入口、工作流、权限、约束和验证是否与真实插件一致。

`packages/app-plugin-skills-example` 展示了两层检查如何配合：插件测试核对 exports、Route
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

再运行目标 App：

```bash
pnpm --filter <target-app> client:inspect --json
pnpm --filter <target-app> server:inspect --json
pnpm --filter <target-app> typecheck
pnpm --filter <target-app> test
pnpm --filter <target-app> build
```

最后按风险启动 App，验证真实页面、Settings 导航与 access、HTTP 路径、Migration/Seed、Job 和 Agent 对同步 Skills 的发现。命令成功不等于运行时闭环已验证。

Client-only 插件可以跳过 `server:inspect`，Server-only 插件可以跳过
`client:inspect`。两个 Inspector 的 JSON 都使用 `schemaVersion`、`ok`、`operation`、
`status` 和 `result`。Client inspection 会 import declaration 并执行 routes/providers
factory，但不会运行 bootstrap、页面 component loader 或 Provider；Server inspection
不执行 Route factory。不要把 issues 为空解释为运行时行为已验证；Route
authentication/authorization、Provider lifecycle、Database 和 Job 行为必须继续通过
真实请求、数据库或 handler 测试验证。四类 Route 的测试矩阵见[Route 插件开发](./routes.md)。

## 完成条件

- 测试位于 plugin-root `tests/` 且覆盖变化行为；
- Client、Server、Database、Queue 的 declaration 与实现一致；
- Skills 通过机械检查并由 Agent 完成语义核对；
- package exports、declarations 和发布文件正确；
- 插件及目标 App 的相关检查通过；
- 高风险路径已做运行时验证；
- 最终报告列出执行命令、结果、未执行项和剩余限制。
