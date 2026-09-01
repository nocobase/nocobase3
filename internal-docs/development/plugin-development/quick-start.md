---
title: 创建并接入插件
description: 在 NocoBase source workspace 中按显式 capability 创建 App 插件，完成具体实现、注册和验证。
---

# 创建并接入插件

`plugin:create` 不猜测插件类型，也不生成需要事后裁剪的完整示例。Agent 先把需求映射为 capability，再由生成器确定性地生成对应文件、Client/Server declaration、exports、依赖、测试和发布配置。

第一版只在 NocoBase source workspace 的 `packages/plugins/` 下创建插件，不创建 standalone 插件工程。

## 创建前检查

1. 读取适用的 `AGENTS.md`，运行 `git status --short` 并保留已有修改。
2. 确认插件短名为小写 kebab-case，且目标目录和 npm 包名没有冲突。
3. 确认目标 App；未指定时通常使用 `app-template-default`。
4. 将需求映射为下面一个或多个 capability。

## Capability 目录

| Capability                 | 选择时表示什么                                                 |
| -------------------------- | -------------------------------------------------------------- |
| `database`                 | Database 能力；内部包含 migrations 和 seeds 结构               |
| `server.service-providers` | Server Provider 能力；内部包含 ServiceProvider、Service、Token |
| `server.routes`            | Server Route contribution；支持 API Routes 和 Root Routes      |
| `server.jobs`              | Queue Jobs                                                     |
| `server.locales`           | Server 翻译资源声明                                            |
| `client.routes`            | Client Route contribution；支持 App Routes 和 Settings Routes  |
| `client.components`        | 插件拥有的 React components                                    |
| `client.service-providers` | Client Service、生命周期和启动期初始化                         |
| `client.react-providers`   | React Context/Wrapper contribution                             |
| `client.locales`           | Client 翻译资源声明                                            |
| `registry`                 | 安装后归 App 所有的可编辑 Registry source                      |
| `skills`                   | 插件提供给 App Agent 的能力和集成指南                          |

这些 capability 不继续细分成 CLI 参数。选择 `server.routes` 不代表同时生成 API Route 和 Root Route 的虚假业务示例；选择 `client.routes` 也不代表同时生成普通页面和 Settings 页面。Agent 在业务实现阶段按[Route 插件开发](./routes.md)选择实际 API。

## 先预览生成计划

以同时提供页面、Server API、业务 Service 和 App Agent 使用说明的 `system-info` 插件为例：

```bash
pnpm plugin:create system-info \
  --with client.routes \
  --with client.components \
  --with server.service-providers \
  --with server.routes \
  --with skills \
  --dry-run \
  --json
```

Agent 应检查结构化结果中的：

- `ok` 是否为 `true`；失败时从 `error.code`、`error.message` 和 `error.suggestions` 恢复；
- `requestedCapabilities` 是否准确表达需求；
- `capabilities` 是否与选择一致；
- `files` 是否只包含所需结构；
- Client 和 Server plugin entry 是否按需要派生；
- `writes` 和 `commands` 在 dry-run 中是否都为空。

使用 `--json` 时，成功和失败都输出一个 JSON document。失败仍返回非零退出码，
但不会再混入普通 usage 文本；Agent 不应只按自然语言解析错误。

只创建 package foundation 时必须显式使用：

```bash
pnpm plugin:create plugin-core --empty --dry-run --json
```

省略 capability 和 `--empty` 会失败，不会隐式生成某种插件。

## 创建插件

确认计划后，以相同 capability 去掉 dry-run：

```bash
pnpm plugin:create system-info \
  --with client.routes \
  --with client.components \
  --with server.service-providers \
  --with server.routes \
  --with skills \
  --no-install
```

`--with` 可以重复；重复 capability 会去重。`--no-install` 让创建步骤不更新 lockfile，后续注册时统一运行一次安装。

生成结果必须只包含明确选择的 capability。生成器可以自动派生必要结构，例如任意 Server capability 会产生 `server/plugin.ts`，但不能擅自添加 `server.service-providers`、`server.routes` 等未选择的业务能力。

生成器还会根据所选 capability 选择共享开发配置：纯 Client 插件使用
`client-library` TypeScript preset，不声明 Node runtime；纯 Server 插件使用
`server-library` 和 Node ESLint 配置；全栈插件使用 `server-library` 并补充 DOM/JSX，
同时由 Client ESLint 配置为 `server/` 文件提供限定范围的 Node globals。Agent 不应在创建后
从其他包复制整份配置来覆盖这些结果。

## 实现具体业务

脚手架只建立安全、可检查的 wiring，不虚构业务页面、API、权限或数据结构。Agent 根据任务继续实现：

- `client.routes`：决定使用 `defineAppRoutes()`、`defineSettingsRoutes()` 或两者；
- `server.routes`：决定使用 `defineApiRoutes()`、`defineRootRoutes()` 或两者；
- 每个具体 Server Route 自己拥有并测试 authentication/authorization 边界，不能依赖 contribution order；
- `server.service-providers`：把领域逻辑放在 Service，由 Provider 注册 Token；
- `client.service-providers`：在 Client Application Container 中注册 Service，并用 lifecycle 管理启动和清理；
- `client.react-providers`：声明为 React tree 提供 Context 或 UI 能力的 Provider；
- `database`：把 `.ts.example` 改成任务需要的显式、自包含 migration/seed，删除不需要的示例；
- `skills`：把开发 draft 替换成插件真实提供给 App Agent 的公共能力、集成流程、权限、约束和验证方式。

实现变化时保持以下状态面一致：

```text
implementation
→ client/plugin.ts or server/plugin.ts
→ source and publish exports
→ dependencies and files
→ tests
→ README
→ Plugin Skills
```

## 检查并注册

先运行插件自己的检查：

```bash
pnpm --filter @nocobase/app-plugin-system-info lint
pnpm --filter @nocobase/app-plugin-system-info typecheck
pnpm --filter @nocobase/app-plugin-system-info test
pnpm --filter @nocobase/app-plugin-system-info build
```

然后注册到目标 App：

```bash
pnpm plugin:register system-info --app app-template-default
```

如果需要机器可读的注册快照，或注册结果与预期不一致，可用只读命令查看 dependency、metadata、Client/Server composition root 和 Skills 副本状态：

```bash
pnpm plugin:inspect system-info --app app-template-default --json
```

读取 `result.consistent` 和 `result.issues`，不要只根据 `ok` 判断命令结果。该检查不运行插件代码，也不验证插件接线之外的实现、Route 权限、测试或构建；它不是快速开始的完成门槛。

注册命令根据真实 exports 独立判断 Client 和 Server entry，并同步插件顶层 `skills/` 到 App
本地的 `.agents/skills/`。整个 `.agents/` 是被 Git 忽略的生成产物；不要编辑或提交同步
副本。提交插件的 `skills/` 源文件，以及 Agent 按 Skill 完成的 App 正式源码。

Client 或 Server composition 发生变化，或者需要排查 contribution 为什么不可用时，可以按变化范围查看对应的只读快照。不要默认把两个命令都运行一遍。JSON 模式先读取 `ok` 和 `status`，再读取 `result.consistent`、`result.issues`；不要把 inspection 成功解释为 ServiceProvider lifecycle、页面、React Provider、Route 或浏览器行为已经验证：

```bash
pnpm --filter @nocobase/app-template-default client:inspect --json
pnpm --filter @nocobase/app-template-default server:inspect --json
```

只运行与变化或诊断目标匹配的 Inspector；没有 composition 变化时可以全部跳过。
`client:inspect` 和 `server:inspect` 会显示 locales 声明是否进入最终 composition，但不会执行 locale loader，也不会读取语言列表、key 或翻译内容。检查 `server:inspect` 的 `issues`，并继续用 `i18n:check --strict` 与行为测试验证翻译、Provider、Route 权限、Database 和 Job 的运行时行为。

最后运行目标 App 的相关 typecheck、test、build 和按风险选择的运行时验证。

## 完成条件

- capability 选择准确，没有生成或残留未请求的能力；
- 具体业务实现没有保留虚假示例或 draft Skill；
- Client/Server declarations、exports、依赖和发布文件一致；
- 每个具体 Server Route 拥有自己的安全边界；
- 插件 lint、typecheck、test、build 通过；
- 目标 App 注册、Skills 同步和相关验证通过。

## 下一步

- [开发一个完整插件](./development-workflow.md)
- [插件结构和文件所有权](./plugin-structure.md)
- [声明 Client 和 Server 插件](./plugin-declaration.md)
- [安装和注册插件](./plugin-registration.md)
- [Plugin Skills](./skills.md)
- [CLI 命令参考](../../cli/README.md)
