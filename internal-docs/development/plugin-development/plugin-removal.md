---
title: 解除注册与删除插件
description: 安全地区分禁用、解除注册和删除 source workspace 插件源码，并在破坏性操作前验证所有引用。
---

# 解除注册与删除插件

禁用、解除注册和删除源码是三种不同操作。Agent 不得把它们视为可互换命令。

| 操作     | 结果                                                       | 是否破坏源码 |
| -------- | ---------------------------------------------------------- | ------------ |
| 禁用     | 保留依赖与 metadata，不加入 Client/Server runtime          | 否           |
| 解除注册 | 清理目标 App 的依赖、metadata、composition roots 和 Skills | 否           |
| 删除源码 | 删除 source workspace 中的插件包目录                       | 是           |

## 解除注册

Source workspace：

```bash
pnpm plugin:unregister audit-log --app app-template-default --dry-run --json
pnpm plugin:unregister audit-log --app app-template-default
```

独立 App：

```bash
pnpm plugin:unregister audit-log --dry-run --json
pnpm plugin:unregister audit-log
```

只清理接线、不调用包管理器：

```bash
pnpm plugin:unregister audit-log --no-install
```

解除注册按实际状态清理：

- 插件同步到 App 的 Skills；
- dependency 和 `nocobase.plugins` 记录；
- `client/plugins.ts` 中的 import 和数组项；
- `server/plugins.ts` 中的 import 和数组项；
- 安装依赖，除非显式使用 `--no-install`。

应用 dry run 前先阅读 JSON 计划，确认没有移除 App 手工维护的无关代码。

## 删除 workspace 插件源码

只有用户明确要求删除插件，并且所有 workspace App 和其他 consumer 都已经解除引用后，才运行：

```bash
pnpm plugin:remove audit-log
```

`plugin:remove` 是 source workspace 专属的破坏性命令。它会拒绝删除仍被 App dependency、`nocobase.plugins`、Client composition root 或 Server composition root 引用的插件，但 Agent 仍必须在执行前完成只读确认。

## 删除前检查

- 用户明确要求删除的是插件源码，而不只是从某个 App 解除注册；
- 目标解析为一个明确的 `packages/plugins/app-plugin-*` 目录；
- 所有目标 App 已解除注册；
- 没有其他 workspace package 依赖该插件；
- 插件目录没有需要保留或尚未提交的用户修改；
- Plugin Skills、Registry canonical source 和测试没有仍需迁移的内容；
- 删除范围不依赖宽泛 glob、未解析变量或 workspace 根目录。

删除完成后，应报告删除了什么、是否可从 Git 恢复，以及哪些检查已经运行。

## Registry item 的移除不是插件解除注册

App 中 materialize 的 Registry item 归 App 所有。解除插件注册不会自动删除这些源码；删除 Registry item 也不一定需要移除插件。具体边界见[Registry 升级与移除](./registry-upgrades.md)。

## 完成检查

- 目标 App 不再包含该插件的 dependency、metadata 或 composition root 注册；
- 该插件拥有的同步 Skills 已清理；
- App 自有 Skills 和无关依赖未被删除；
- 需要保留的 App-owned Registry 源码仍然存在；
- 相关 App 检查通过；
- 如果删除了源码，已明确报告恢复方式。

返回[插件注册](./plugin-registration.md)或继续阅读[测试与验证](./testing.md)。
