---
title: Source workspace 插件注册
description: 在 NocoBase v3 source workspace 中预览、注册和配置本地插件，并同步插件提供给目标 App 的 Skills。
---

# Source workspace 插件注册

本页适用于当前仓库 `packages/app-plugin-*` 中的插件。执行命令前确认插件包名、目标 App 和工作树状态。

## 最小注册流程

从 source workspace 根目录预览：

```bash
pnpm plugin:register audit-log \
  --app app-template-default \
  --dry-run \
  --json
```

确认计划后应用注册：

```bash
pnpm plugin:register audit-log --app app-template-default
```

`--app` 接受 workspace App 的目录名或完整包名。省略时默认选择 `app-template-default`。Agent 在存在多个候选 App 时应显式传入目标，不要依赖默认值。

## 创建后只安装一次

连续创建和注册时，可以让注册阶段统一执行安装：

```bash
pnpm plugin:create audit-log \
  --with server.service-providers \
  --with server.routes \
  --no-install

pnpm plugin:register audit-log --app app-template-default
```

如果依赖已经安装，只写注册状态：

```bash
pnpm plugin:register audit-log \
  --app app-template-default \
  --no-install
```

## 注册会修改什么

正常启用时，命令根据包的实际 exports 修改相关状态面：

```text
target App package dependency
package.json#nocobase.plugins
client/plugins.ts when ./client exists
server/plugins.ts when ./server exists
.agents/skills when plugin-owned Skills exist
```

Client 注册调用 factory：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/client';

const clientPlugins: AppClientPlugins = defineClientPlugins([auditLog()]);
```

Server 注册 definition 本身，不调用它：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/server';

const serverPlugins: AppServerPlugins = defineServerPlugins([auditLog]);
```

Client 数组顺序也是静态 contribution 和 ServiceProvider lifecycle 的组合顺序。命令默认把新插件追加到末尾；只有确实存在顺序要求或需要传 options 时才手工调整。

## 安装但不启用

需要先记录依赖，但暂不加入 Client/Server runtime：

```bash
pnpm plugin:register audit-log \
  --app app-template-default \
  --disabled
```

此时 dependency 和 `nocobase.plugins` 存在，但 composition roots 不应加入插件。Skills 默认仍会同步，因为它们是 App Agent 使用说明，不是运行时代码。不希望同步时显式增加：

```bash
--no-skills
```

`enabled: false` 不会在运行时覆盖手工残留的 composition root。如果 `client/plugins.ts` 或 `server/plugins.ts` 仍有注册项，运行时仍可能加载插件，必须修复不一致。

## 配置 Client 插件

注册命令生成无参数调用。App 需要配置时，手工传入插件公开的 typed options：

```ts
auditLog({
  resourceLabel: 'Audit logs',
});
```

不要通过修改同步文件、读取隐式全局状态或复制插件源码来代替公开 options。

## Skills 同步

插件能力或说明发生变化后，可以单独同步。这条命令属于 App，在 App 目录下执行——本仓库内即 `packages/app-template-default`：

```bash
pnpm plugin:skills:sync
pnpm plugin:skills:sync --plugin audit-log
```

同步边界：

- 插件顶层 `skills/` 是唯一真相；
- App 的 `.agents/skills/` 是本地生成副本；
- App 必须在 `.gitignore` 中排除整个 `/.agents/`；
- 每个插件拥有与自身前缀匹配的 Skill 目录；
- 同步整体替换该插件拥有的目录，并清理上游已经删除的 Skill；
- 同名 Skill 被两个插件提供时同步失败并报告双方包名。

不要直接编辑、提交或发布 App 中同步出的 `.agents/` 内容。

## 按需诊断

只有注册结果与预期不一致时才运行：

```bash
pnpm plugin:inspect audit-log \
  --app app-template-default \
  --json
```

读取 `result.consistent`、`issues` 和 `suggestions`，不能只看 `ok` 或退出码。Inspector 只提供静态状态快照；行为验证仍按[测试与验证](./testing.md)执行。

## 完成检查

- dry run 计划中的目标 App 和修改文件正确；
- dependency、management metadata 和 composition roots 一致；
- Client factory 与 Server definition 的调用形式正确；
- options 是 App 显式传入的 typed contract；
- Plugin Skills 源与同步结果符合预期；
- 插件包和目标 App 的相关检查通过。

继续阅读[插件注册](./plugin-registration.md)、[解除注册与删除](./plugin-removal.md)或[测试与验证](./testing.md)。
