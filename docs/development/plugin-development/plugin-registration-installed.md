---
title: 独立 App 安装与升级插件
description: 在独立 NocoBase App 中安装、禁用、升级和同步已经发布的 v3 插件包。
---

# 独立 App 安装与升级插件

本页只适用于从 package registry 获取已经发布插件的独立 App。第一版 `plugin:create` 不在独立 App 中创建插件。

## 安装并注册

从独立 App 根目录执行：

```bash
pnpm plugin:register audit-log
```

指定版本：

```bash
pnpm plugin:register audit-log --version 1.2.0
```

独立 App 记录实际 registry 版本范围，不使用 `workspace:^`。命令仍根据 `./client` 和 `./server` exports 分别处理 Client 与 Server composition root。

安装但暂不启用：

```bash
pnpm plugin:register audit-log --disabled
```

Skills 默认仍会同步；明确不需要时增加 `--no-skills`。

## 升级

升级全部已经登记的插件：

```bash
pnpm plugin:update
```

只升级一个插件：

```bash
pnpm plugin:update --plugin audit-log
```

升级成功后同步 Plugin Skills。升级失败时不能继续同步；升级成功但 Skills 同步失败时，应分别报告两个阶段，不要把旧副本描述为已更新。

Source workspace 中的本地插件由 workspace 源码和 lockfile 管理，通常不使用这套 registry update 流程。

## 单独同步 Skills

```bash
pnpm plugin:skills:sync
pnpm plugin:skills:sync --plugin audit-log
```

插件包中的 `skills/` 是源，App `.agents/skills/` 是本地生成结果，不应直接修改或提交。

## 升级后的验证

升级插件包不等于行为已经兼容。至少确认：

- 安装版本符合请求；
- package exports 与 Client/Server composition roots 一致；
- App 传入的 plugin options 仍符合公开类型；
- Plugin Skills 已同步到新版本；
- 数据库变更按插件规定执行；
- App 的相关 typecheck、test、build 和运行时行为通过。

Registry item 是 App-owned 源码，升级插件不会自动覆盖已经 materialize 的副本。此类升级继续阅读[Registry 升级与移除](./registry-upgrades.md)。

## 相关内容

- [插件注册](./plugin-registration.md)
- [解除注册与删除](./plugin-removal.md)
- [Plugin Skills](./skills.md)
- [测试与验证](./testing.md)
