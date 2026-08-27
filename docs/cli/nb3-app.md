---
title: 'APP 管理脚本'
description: '使用 APP 项目自带的 pnpm scripts 同步源码、创建 Release、部署和查看状态。'
keywords: 'pnpm scripts,APP,Hub,源码同步,Release,部署,NocoBase 3'
---

# APP 管理脚本

NocoBase APP 创建后，项目的 `package.json` 已经带上连接 Hub 所需的脚本。日常开发不需要全局安装额外工具。

`nb3` 可执行入口仍然保留，已有的 `nb3 app` 和 `nb3 hub` 命令可以继续使用。下面介绍的是 APP 项目内的新脚本入口。

## 可用脚本

```text
pnpm run pull         拉取 Hub 的最新源码快照
pnpm run push         把当前源码快照推送到 Hub
pnpm run release      同步源码并创建 Release，不部署
pnpm run deploy       完整部署，或操作一个已有 Release
pnpm run status       查看 Repository、Release、Deployment 和 Runtime 状态
pnpm run hub:login    登录 Hub 并保存 Agent credential
pnpm run hub:logout   撤销并删除本地 credential
```

每个脚本都有独立的 `--help` 和可复制的 Examples：

```bash
pnpm run pull --help
pnpm run release --help
pnpm run deploy --help
```

## 获取 Hub 中已有的 APP

APP scripts 存放在 APP 自己的 `package.json` 中，所以首次获取源码时使用 `pnpm create`。下面的命令把 Hub 中 `sales` 的最新源码快照下载到本地 `crm` 目录：

```bash
pnpm create @nocobase/app crm \
  --hub https://hub.example.com/hub \
  --app sales
cd crm
```

命令会记录 Hub URL、APP ID、slug 和最近一次同步的源码版本，并默认为本地开发配置 SQLite。需要其他数据库时可以增加 `--db-dialect postgres` 或 `--db-dialect mysql`。依赖安装完成后，可以直接启动本地开发环境：

```bash
pnpm dev
```

## 拉取和推送源码

在已有工作副本中拉取 Hub 的最新源码：

```bash
pnpm run pull
```

开发完成后，把当前源码推送回 Hub：

```bash
pnpm run push
```

Hub 同步的是源码快照，不是本地 Git 仓库。快照不会包含：

- 本地 Git 历史
- `node_modules` 等依赖
- `dist`、测试报告等构建产物
- `.env`、`.npmrc`、credential 等 secret
- 本地 Hub 关联信息和运行数据

`pull` 只会在能够安全更新时写入本地目录。如果本地源码已经修改，同时 Hub 也有更新，命令会停止，避免覆盖本地修改。`push` 发现 Hub 已经出现更新时同样会停止，需要先处理远端更新。

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

`release` 会先把当前源码快照同步到 Hub，然后构建、上传并创建一个不可变 Release。它只创建 Release，不会部署：

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

`--version` 和 `--bump patch|minor|major` 二选一。`--dry-run` 只验证发布计划，不推送源码、不构建、不上传。如果操作中断，使用错误输出中的 `--operation-id` 恢复同一个操作。

## 部署 APP

不带 Release 参数的 `deploy` 是从本地源码到运行状态的完整入口：

```bash
pnpm run deploy --hub https://hub.example.com/hub
```

它会依次完成：

1. 首次使用时关联已有 APP，或在 Hub 中创建 APP
2. 推送当前源码快照
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
- 源码快照不会包含这两类本地状态

## 给 Coding Agent 的常用指令

首次获取已有 APP：

```text
请执行 pnpm create @nocobase/app crm --hub https://hub.example.com/hub --app sales，
然后进入 crm 目录并运行 pnpm dev。开发前先执行 pnpm run pull；
开发完成后执行 pnpm run push。需要发布但不部署时执行 pnpm run release --bump patch；
需要直接部署时执行 pnpm run deploy。
```

## 相关链接

- [Quickstart](../quickstart.md) — 创建 APP、本地开发和部署的基本流程
- [Hub 应用管理 API](../design/hub-application-management-api.md) — APP scripts 调用的 Hub API 契约
- [连接 Hub](./nb3-hub.md) — Device Authorization 和 credential 的使用方式
