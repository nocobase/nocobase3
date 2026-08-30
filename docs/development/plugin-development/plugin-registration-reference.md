---
title: 插件注册深入参考
description: NocoBase v3 插件生命周期命令、JSON 状态、静态诊断和常见不一致的完整参考。
---

# 插件注册深入参考

本页保留完整命令、JSON envelope 和不一致诊断参考，不是普通注册任务的起点。首先阅读[插件注册](./plugin-registration.md)，再进入 [source workspace](./plugin-registration-workspace.md)、[独立 App](./plugin-registration-installed.md) 或[解除注册与删除](./plugin-removal.md)流程。

插件注册不是一个布尔字段，而是多个显式状态面的组合。Agent 必须检查最终状态，不应只根据命令退出码或 `nocobase.plugins.enabled` 判断插件已经正确运行。

## 两种环境

| 环境             | 插件来源                           | 依赖范围         | 命令执行位置            |
| ---------------- | ---------------------------------- | ---------------- | ----------------------- |
| Source workspace | `packages/` 中的 workspace package | `workspace:^`    | source workspace 根目录 |
| 独立 App         | package registry 中的已发布插件    | 实际安装版本范围 | App 根目录              |

第一版 Create Plugin 只创建 source workspace 插件。独立 App 可以安装、配置、升级和移除已发布插件。

## 注册状态面

| 状态面        | 位置                                  | 作用                                      |
| ------------- | ------------------------------------- | ----------------------------------------- |
| 包已安装      | `dependencies` 或 `devDependencies`   | 模块可以被解析                            |
| 插件已登记    | `package.json#nocobase.plugins`       | CLI、构建、监听和 Skills 管理 metadata    |
| Client 已启用 | `client/plugins.ts`                   | Browser runtime 加载 Client contributions |
| Server 已启用 | `server/plugins.ts`                   | Server runtime 加载 Server contributions  |
| Skills 已同步 | `.agents/skills/`（本地生成，不提交） | App Agent 可发现插件能力和集成指南        |

完整注册流程：

```text
resolve/install package
→ write dependency
→ write nocobase.plugins metadata
→ register Client if exports["./client"] exists
→ register Server if exports["./server/plugin"] exists
→ synchronize plugin Skills
```

Client 和 Server 分别判断。纯 Client、纯 Server 和全栈插件使用同一条命令。

## 在 source workspace 注册

从 source workspace 根目录执行：

```bash
pnpm plugin:register audit-log --app app-template-default
```

`--app` 接受 workspace App 的目录名或完整包名。省略时默认选择 `app-template-default`。

预览而不写文件：

```bash
pnpm plugin:register audit-log \
  --app app-template-default \
  --dry-run
```

如果创建时已经运行 install，但只想写注册：

```bash
pnpm plugin:register audit-log \
  --app app-template-default \
  --no-install
```

连续创建和注册时，推荐只安装一次：

```bash
pnpm plugin:create audit-log \
  --with server.providers \
  --with server.routes \
  --no-install
pnpm plugin:register audit-log --app app-template-default
```

## 在独立 App 安装并注册

从独立 App 根目录执行：

```bash
pnpm plugin:register audit-log
```

指定版本：

```bash
pnpm plugin:register audit-log --version 1.2.0
```

独立 App 从 package registry 安装插件，记录实际安装版本范围，不使用 `workspace:^`。第一版不在独立 App 中运行 Create Plugin。

## 注册产生的状态

### App dependency 和管理 metadata

```json
{
  "devDependencies": {
    "@nocobase/app-plugin-audit-log": "workspace:^"
  },
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-audit-log": {
        "enabled": true
      }
    }
  }
}
```

Source workspace 默认记录 `workspace:^`。独立 App 记录 registry 版本。

### Client composition root

插件提供 `exports["./client"]` 时：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/client';

const clientPlugins: AppClientPlugins = defineClientPlugins([auditLog()]);
```

Client 数组顺序是 bootstrap 顺序。注册命令把新插件追加到数组末尾，不自动排序。只有调整顺序或给插件传 options 时才需要手工修改注册项。

### Server composition root

插件提供 `exports["./server/plugin"]` 时：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/server/plugin';

const serverPlugins: AppServerPlugins<AppConfig> =
  defineServerPlugins<AppConfig>([auditLog]);
```

Server 注册 definition 本身，不调用它。

### Skills 同步

注册复制的是插件向 App 提供的能力与集成指南，不是插件运行时代码。

插件源：

```text
packages/app-plugin-audit-log/
└── skills/
    └── nocobase-app-plugin-audit-log/
        └── SKILL.md
```

App 副本：

```text
packages/app-template-default/
└── .agents/skills/
    └── nocobase-app-plugin-audit-log/
        └── SKILL.md
```

插件源是唯一真相。App Agent 读取同步后的副本；不要直接编辑该副本。

App 必须在 `.gitignore` 中排除整个 `/.agents/`。该目录由注册和同步命令按需重建，不属于
App 模板或业务源码，也不能作为任何 Skill 的版本控制源。需要提交的是插件的 `skills/`
源文件，以及 Agent 按照 Skill 写入 App 正式目录的集成代码。

## 安装但不启用

需要先安装依赖和记录插件，但暂不加入 Client/Server runtime 时：

```bash
pnpm plugin:register audit-log \
  --app app-template-default \
  --disabled
```

预期状态：

```text
dependency                    present
nocobase.plugins              enabled: false
client/plugins.ts             not added
server/plugins.ts             not added
plugin Skills                 synchronized by default
```

`enabled: false` 本身不会在运行时覆盖手工写入的 composition root。如果代码中仍存在注册项，应以 `client/plugins.ts` 和 `server/plugins.ts` 的实际内容为准，并修复状态不一致。

Skills 是 App 使用说明，不是运行时代码，因此 disabled 注册默认仍会同步它们。如果本次安装也不应复制 Skills，显式使用：

```bash
pnpm plugin:register audit-log \
  --app app-template-default \
  --disabled \
  --no-skills
```

## 配置 Client 插件

注册命令默认生成无参数调用：

```ts
auditLog();
```

App 需要配置插件时，手工传入插件公开的 typed options：

```ts
auditLog({
  resourceLabel: 'Audit logs',
});
```

不要通过修改插件同步文件、读取全局环境或复制插件源码来替代公开 options。

## 同步 Skills

插件升级或公开能力变化后，可以单独同步：

```bash
pnpm plugin:skills:sync --app app-template-default
pnpm plugin:skills:sync --app app-template-default --plugin audit-log
```

独立 App 中省略 `--app`：

```bash
pnpm plugin:skills:sync
pnpm plugin:skills:sync --plugin audit-log
```

同步规则：

- 插件顶层 `skills/` 是唯一真相；
- 插件拥有与自身前缀匹配的 Skill 目录；
- 每个同步目录整体替换；
- 插件上游已经删除的 Skill 会从 App 清理；
- 不以插件认领前缀命名的 App 自有 Skill 不受影响；
- 同名 Skill 被两个插件提供时同步失败并报告双方包名。
- `.agents/` 是本地生成目录，即使 `plugin:inspect` 读取它，也不应加入 Git 或发布包。

## 升级独立 App 中的插件

升级全部已注册插件：

```bash
pnpm plugin:update
```

升级指定插件：

```bash
pnpm plugin:update --plugin audit-log
```

升级成功后同步插件 Skills。升级失败时不继续同步；升级成功但 Skills 同步失败时，应报告两个阶段的实际结果，不要把旧 Skill 副本误认为已更新。

Source workspace 中的插件版本由 workspace 源码和 lockfile 管理，通常不使用 registry update 工作流升级本地插件。

## 解除注册

Source workspace：

```bash
pnpm plugin:unregister audit-log --app app-template-default
```

独立 App：

```bash
pnpm plugin:unregister audit-log
```

解除注册会清理：

- 插件同步到 App 的 Skills；
- 安装依赖（除非使用 `--no-install`）；
- dependency 和 `nocobase.plugins` 记录；
- `client/plugins.ts` 中的 import 和数组项；
- `server/plugins.ts` 中的 import 和数组项。

只解除接线、不调用包管理器：

```bash
pnpm plugin:unregister audit-log --no-install
```

预览：

```bash
pnpm plugin:unregister audit-log --dry-run
```

## 删除 workspace 插件源码

解除所有 workspace App 的引用后，才可以删除源码：

```bash
pnpm plugin:remove audit-log
```

`plugin:remove` 是 source workspace 专属命令。它会拒绝删除仍被 App dependency、`nocobase.plugins`、Client composition root 或 Server composition root 引用的插件。

删除源码属于破坏性操作。Agent 必须先确认：

- 用户确实要求删除插件；
- 所有目标 App 已解除注册；
- 插件目录没有需要保留的用户修改；
- 包没有其他 workspace consumer；
- 删除目标解析为明确的单个插件目录。

## 按需检查注册状态

注册结果与预期不一致，或者需要机器可读的静态登记快照时，可以运行：

```bash
pnpm plugin:inspect audit-log --app app-template-default --json
```

该命令只读取静态状态，不会自动修复，也不替代 `client:inspect`、测试或构建。

JSON 结果中的 `result.consistent` 表示本次检查的静态状态面是否一致，`issues` 提供稳定问题代码，`suggestions` 提供结构化后续命令。即使发现不一致，检查本身成功执行时仍为 `ok: true`；Agent 应读取 `consistent`，不能只看退出码。

生命周期命令统一使用以下 JSON envelope：

```json
{
  "schemaVersion": 1,
  "ok": true,
  "operation": "plugin:inspect",
  "status": "success",
  "result": {}
}
```

- `success`：请求完成；
- `success-noop`：目标已经处于请求状态，没有写入；
- `partial-success`：主要操作完成，但有明确的剩余问题或手工步骤；
- `requires-installation`：dry run 需要先安装包，才能计算后续注册计划；
- `failure`：`ok: false`，错误写入 stderr，并保留非零退出码。

Agent 应先判断 `ok`，再按 `status` 分支；失败时读取 `error.code` 和 `error.suggestions`。不要从人类可读文案推断状态。

当前不提供会扩大范围或自动修复的 `plugin:doctor`。诊断注册问题时，Agent 可按以下顺序检查状态：

```text
1. package is installed/resolvable
2. App dependency exists
3. nocobase.plugins record has expected enabled state
4. package exports ./client and/or ./server/plugin as expected
5. client/plugins.ts matches Client export and enabled state
6. server/plugins.ts matches Server export and enabled state
7. when relevant, Client declarations appear in a client:inspect snapshot
8. plugin Skills source exists and App copy is synchronized
9. plugin package checks pass
10. target App checks pass
```

涉及 Client 时：

```bash
pnpm --filter <target-app> client:inspect --json
```

该命令可查看最终 bootstrap 顺序、Routes、Settings、Providers 和 component overrides，但不验证这些能力的运行行为。只有 Client composition 变化或需要诊断时才运行。

## 常见不一致

| 状态                                     | 原因                                            | 修复                                                 |
| ---------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| manifest enabled，但 Client 未加载       | 缺少 `./client` export 或 composition root 注册 | 修复 export 后重新注册                               |
| manifest enabled，但 Server 未加载       | 缺少 `./server/plugin` export 或 Server 注册    | 修复 export 后重新注册                               |
| composition root 有 import，但包无法解析 | dependency 缺失或安装失败                       | 恢复依赖并安装，或解除无效注册                       |
| disabled 但运行时仍加载                  | composition root 中残留手工注册                 | 删除对应 Client/Server 注册项                        |
| Skills 内容过期                          | 包已变化但未重新同步                            | 运行 `plugin:skills:sync`                            |
| Client 注册顺序错误                      | 新插件默认追加到末尾                            | 在 `client/plugins.ts` 中显式调整顺序                |
| 注册命令未自动编辑 composition root      | App 缺少 TypeScript                             | 按命令输出应用精确手工修改，或安装 TypeScript 后重跑 |

## 注册完成条件

注册任务只有在以下条件满足后才算完成：

- 包可从目标 App 解析；
- dependency 和 `nocobase.plugins` 状态正确；
- Client/Server composition roots 与包 exports 和 enabled 状态一致；
- 没有重复注册；
- Skills 已按预期同步，源文件与 App 副本一致；或命令明确使用了 `--no-skills`；
- Client/Server composition 变化时，声明已按预期进入目标 App；Inspector 可用于观察或诊断这一静态事实，但不是注册完成的独立门槛；
- 目标 App 的 typecheck 和 build 通过；
- Agent 报告自动完成、跳过和需要手工处理的各部分。

## 相关内容

- [创建并接入插件](./quick-start.md)
- [插件结构和文件所有权](./plugin-structure.md)
- [声明 Client 和 Server 插件](./plugin-declaration.md)
- [CLI 完整命令参考](../../cli/README.md)
