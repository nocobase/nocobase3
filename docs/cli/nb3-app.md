---
title: 'APP 管理脚本'
description: '使用 APP 项目自带的 pnpm scripts 构建产物、创建 Release、部署和查看状态。'
keywords: 'pnpm scripts,APP,Hub,构建产物,Release,部署,NocoBase 3'
---

# APP 管理脚本

NocoBase APP 创建后，项目的 `package.json` 已经带上连接 Hub 所需的脚本。日常开发不需要全局安装额外工具。

`nb3` 可执行入口仍然保留，已有的 `nb3 app` 和 `nb3 hub` 命令可以继续使用。下面介绍的是 APP 项目内的新脚本入口。

## 可用脚本

```text
pnpm run release      本地构建并创建 Release，不部署
pnpm run deploy       完整部署，或操作一个已有 Release
pnpm run status       查看 APP、Release、Deployment 和 Runtime 状态
pnpm run hub:login    登录 Hub 并保存 Agent credential
pnpm run hub:logout   撤销并删除本地 credential
```

每个脚本都有独立的 `--help` 和可复制的 Examples：

```bash
pnpm run release --help
pnpm run deploy --help
```

## 源码和 Hub 的边界

APP 源码只保存在开发者本地。Hub 不提供源码上传、下载或远程编辑能力，只接收构建产物并管理 Release、Deployment 和 Runtime。

新 APP 从默认模板创建本地源码：

```bash
pnpm create @nocobase/app crm
cd crm
pnpm dev
```

如果需要继续开发已有 APP，请进入之前保存的真实源码目录。Hub 无法从已有 Release 还原源码，因此需要自行使用 Git 或团队已有方式备份源码。

## 登录 Hub

首次连接 Hub 时，在 APP 源码目录中执行：

```bash
pnpm run hub:login --hub http://127.0.0.1:13000/hub
```

脚本会显示浏览器授权地址和一次性 code。批准后，credential 保存在本机，不会写入 APP 源码。如果命令遇到 scope 不足，会返回一条可以直接复制的 `pnpm run hub:login` 重新授权命令。

不再使用某个 Hub 时，可以撤销 credential：

```bash
pnpm run hub:logout --hub http://127.0.0.1:13000/hub
```

## 创建 Release

`release` 会在本地构建、打包并上传产物，然后创建一个不可变 Release。它只创建 Release，不会部署：

```bash
pnpm run release --bump patch --non-interactive
```

也可以指定准确版本：

```bash
pnpm run release \
  --version 1.4.0 \
  --non-interactive \
  --json
```

`--version` 和 `--bump patch|minor|major` 二选一。`--dry-run` 只验证发布计划，不构建、不上传。如果操作中断，使用错误输出中的 `--operation-id` 恢复同一个操作。

首次把本地源码绑定到 Hub 中已有 APP 时，明确传入 Hub 和 APP：

```bash
pnpm run release \
  --hub https://hub.example.com/hub \
  --app sales \
  --bump patch
```

绑定成功后，Hub URL、APP ID 和 slug 会作为一个整体写入 `.nocobase/config.json`。已经绑定的项目不能通过参数静默切换到其他 Hub 或 APP。

## 部署 APP

不带 Release 参数的 `deploy` 是从本地源码到运行状态的完整入口：

```bash
pnpm run deploy --hub https://hub.example.com/hub
```

它会依次完成：

1. 首次使用时关联已有 APP，或在 Hub 中创建 APP
2. 在本地构建并上传产物
3. 创建下一个 patch Release
4. 部署新 Release，并等待 Deployment 进入终态

完成首次关联后，可以直接执行：

```bash
pnpm run deploy
```

部署一个已有 Release：

```bash
pnpm run deploy --release 1.4.0 --non-interactive
```

回滚是高风险操作。自动化环境必须显式确认：

```bash
pnpm run deploy \
  --release 1.3.0 \
  --rollback \
  --non-interactive \
  --yes
```

重新部署当前活动 Release：

```bash
pnpm run deploy --redeploy --non-interactive
```

`--dry-run` 只校验权限、APP 和目标 Release，不创建 Deployment。

## 查看 APP 状态

在已经记录 Hub 信息的 APP 目录中，可以直接查看状态：

```bash
pnpm run status
pnpm run status --json
```

如果本地还没有记录 Hub 和 APP，可以显式传入：

```bash
pnpm run status \
  --app crm \
  --hub http://127.0.0.1:13000/hub \
  --json
```

## 本地状态

- APP 与 Hub 的关联信息保存在项目的 `.nocobase/config.json`
- credential 和可恢复操作记录保存在用户目录的 `~/.nocobase`
- Hub 不保存 APP 源码，这两类本地状态也不会进入 Release 产物

## 给 Coding Agent 的常用指令

开发并发布已有 APP：

```text
请先询问我 APP 的本地源码目录，不要尝试从 Hub 获取源码。进入该目录后运行 pnpm dev；
开发完成后执行 pnpm check。需要发布但不部署时，执行
pnpm run release --hub https://hub.example.com/hub --app sales --bump patch；
需要直接部署时，执行 pnpm run deploy --hub https://hub.example.com/hub --app sales。
只允许向 Hub 上传构建产物，不要上传源码、依赖、本地数据库、secret 或运行数据。
```

## 相关链接

- [Quickstart](../quickstart.md) — 创建 APP、本地开发和部署的基本流程
- [Hub 应用管理 API](../design/hub-application-management-api.md) — APP scripts 调用的 Hub API 契约
- [连接 Hub](./nb3-hub.md) — Device Authorization 和 credential 的使用方式
