---
title: 开发一个完整插件
description: 将业务需求拆分为 NocoBase 插件的 Client、Server、Database、Queue、I18n 和 Plugin Skills 能力，按依赖顺序实现、注册并验证完整业务闭环。
---

# 开发一个完整插件

本页是 Agent 收到真实插件需求后的编排流程。它不替代各能力的实现细节，而是规定如何从需求得到最小、可验证的插件交付物。

## 1. 明确目标和边界

先记录目标 App、插件短名、用户角色、核心业务对象、主要操作、是否需要持久化，以及插件与 App 各自拥有的内容。第一版 Create Plugin 只在 source workspace 的 `packages/` 下创建插件。

不要一开始就在 App Template 中实现领域逻辑。先判断该逻辑是否随插件发布、是否被多个 App 复用；若是，应由插件包拥有。

修改已有插件时，先检查其 `package.json`、Client/Server 声明、目标 App composition roots 和测试，避免重复创建已经存在的能力。新插件才进入 Create Plugin 流程。

## 2. 把需求映射到能力

| 需求信息                     | 判断           | 主要位置                             |
| ---------------------------- | -------------- | ------------------------------------ |
| 插件保存自己的持久数据       | Migration      | `database/migrations/`               |
| App 必须创建业务 collection  | App 前置条件   | Plugin Skills                        |
| 多模块调用稳定服务           | ServiceToken   | `server/tokens.ts`                   |
| Browser 调用服务端           | API Route      | `server/routes/`                     |
| 用户需要独立页面             | App Route      | `client/routes.ts`                   |
| 管理员配置插件               | Settings Route | `client/routes.ts`                   |
| 可复用 UI 构件               | Component      | `client/components/`                 |
| 页面共享状态                 | Provider       | `client/providers.ts`                |
| 命令式 Client 初始化         | Bootstrap      | `client/bootstrap.ts`                |
| 操作异步执行                 | Queue Job      | `server/jobs/`                       |
| Client/Server 文案或外发消息 | I18n           | `client/locales/`、`server/locales/` |
| App Agent 需要组合插件能力   | Plugin Skills  | `skills/`                            |
| 安装可编辑 Client 源码       | Registry       | `registry/`                          |

创建新插件时，把这些判断直接映射为一个或多个 `plugin:create --with <capability>`。Client 文案选择 `client.locales`，Server/API/外发消息文案选择 `server.locales`；两侧都需要时分别选择，不能依靠其他 Client 或 Server capability 隐式生成。
先运行 `--dry-run --json` 检查文件、依赖和派生的 Client/Server entry。生成器只创建
显式选择的能力，不要先生成完整模板再依靠事后删除确定插件结构。

## 3. 先定义公共契约

在写实现前决定哪些入口由 App 或其他插件使用：Client factory/options、Server ServiceToken、Route/API、Registry item，以及对应的权限、错误和版本边界。具体规则见[设计插件公共契约](./public-contracts.md)。

先写下最小契约表，避免实现过程中不断扩大 API：

| 调用方              | 入口                   | 输入              | 输出或可观察结果    | 权限与错误            |
| ------------------- | ---------------------- | ----------------- | ------------------- | --------------------- |
| App Client          | Client option 或 route | typed value       | 页面或 contribution | access 与加载错误     |
| App Server/其他插件 | ServiceToken           | typed request     | typed result        | domain error          |
| Browser             | API Route              | validated request | documented response | identity、ACL、status |
| App Agent           | Plugin Skill           | App task          | 可验证集成结果      | 前置条件与边界        |

## 4. 按依赖顺序实现

推荐顺序：

```text
数据模型和 Migration / Seed
→ Service contract / Token / implementation / Provider
→ API Route / Root Route / Queue Job
→ Client components / routes / providers / bootstrap
→ Client / Server locale resources
→ Registry（只有 App 需要拥有可编辑源码时）
→ App-facing Plugin Skills
→ App 注册和集成
```

这样每一层都能依赖已经定义的稳定契约。Service 保持领域逻辑，Route 只处理 HTTP 边界，Job 只编排异步执行；默认 Job factory 不注入 ServiceContainer，需要共享领域能力时使用明确依赖或插件拥有的 adapter。Settings 页面不能代替服务端授权。

## 5. 同步更新声明和包契约

每次添加或删除能力，都同时检查 `client/plugin.ts`、`server/plugin.ts`、`package.json` 的 source/publish exports、dependencies、`files`、测试和 README。增加翻译时还要检查两侧实际使用的 `locales` loader、namespace、lazy chunks 和非默认语言行为。Client/Server 运行时必须由 App 的 `client/plugins.ts` 和 `server/plugins.ts` 显式注册。

## 6. 编写 Plugin Skills

Skill 面向使用插件的 App Agent，描述真实公共能力、前置数据模型、集成顺序、所有权、权限、约束、验证和诊断。源文件位于 `<plugin>/skills/`，注册后同步到 App 的 `.agents/skills/`。不要把插件源码开发步骤或私有 API 写入 Skill。

## 7. 测试和分层验证

在插件根目录 `tests/` 添加行为级测试：Service/Provider、Routes、Jobs、Client modules、Migration/Seed、Registry 和 Skill 机械检查。随后运行插件的 lint、typecheck、test、build，再运行目标 App 的 typecheck、test、build，并按风险启动 App 验证真实闭环。Inspector 不是固定验证步骤；只有注册或 composition 变化，或者需要诊断声明为何不可用时，才用对应命令查看只读装配快照。它不替代任何模块行为测试，也不作为完成标准。

验证顺序用于定位失败层级：

```text
unit behavior
→ plugin declaration and exports
→ target App composition
→ build/package resolution
→ runtime user workflow
→ App Agent discovers synchronized Skills
```

## 8. 交付前检查

- 所有请求行为由正确插件包拥有；
- 没有残留模板示例、占位符或失效 exports；
- App 与 Plugin 的所有权边界明确；
- 公共契约有行为测试并在 Plugin Skills 中可发现；
- Database、Queue、权限和错误边界已验证；
- 插件源与 App 注册、同步副本一致；
- 最终报告列出修改、命令结果、未执行项和剩余限制。

## 相关专题

- [创建并接入插件](./quick-start.md)
- [Database 模块选择](./database.md)
- [Server 模块选择](./server.md)
- [Client 模块选择](./client.md)
- [插件国际化](./i18n.md)
- [Plugin Registry](./registry.md)
- [描述插件提供给 App 的能力](./skills.md)
- [测试和验证插件](./testing.md)
