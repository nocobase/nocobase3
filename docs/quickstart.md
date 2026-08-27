# Quickstart

V3 的基本思路：

```text
先开发 APP。
需要部署时，再连接 Hub。
```

## 1. 创建本地 APP

```bash
pnpm config set @nocobase:registry https://npm.nocobase.ai/
pnpm create @nocobase/app crm
cd crm
```

这个目录就是 APP 源码目录，可以放在任意位置。

```text
crm/
  client/
  server/
  package.json
```

## 2. 本地开发

```bash
pnpm dev
```

如果只是本地开发，到这里就够了，不需要安装或连接 Hub。

## 3. 获取 Hub 中已有的 APP

如果 APP 已经在 Hub 中，通过 APP slug 把最新源码快照下载到一个新目录：

```bash
pnpm create @nocobase/app crm \
  --hub https://hub.example.com/hub \
  --app sales
cd crm
```

首次连接时，命令会提示你在浏览器中完成设备授权。下载完成后，APP 与 Hub 的关联信息保存在本地，依赖也会自动安装。本地开发数据库默认使用 SQLite；需要 PostgreSQL 或 MySQL 时可以增加 `--db-dialect`。

以后在这个目录中拉取 Hub 的最新源码：

```bash
pnpm run pull
```

开发完成后，把当前源码快照推送回 Hub：

```bash
pnpm run push
```

源码快照只包含 APP 源码，不传输本地 Git 历史、依赖、构建产物、运行数据和 secret。`pull` 或 `push` 检测到两端都有改动时会停止并给出处理提示，不会直接覆盖源码。

## 4. 准备 Hub

Hub 是用于部署和管理 APP 的应用中心。如果已经有线上或测试环境 Hub，可以直接使用它。

如果需要本地 Hub：

```bash
pnpm create @nocobase/hub my-hub
cd my-hub
pnpm build
pnpm start
```

## 5. 部署 APP

回到 APP 目录。首次部署到本地 Hub：

```bash
cd ../crm
pnpm run deploy --hub http://127.0.0.1:13000/hub
```

部署到远端 Hub：

```bash
pnpm run deploy --hub https://hub.example.com/hub
```

不带 Release 参数的 `deploy` 会完成整个流程：首次部署时关联或创建 Hub APP，然后推送源码快照、创建下一个 patch Release，并部署这个 Release。后续已经记录 Hub 地址时，可以直接执行：

```bash
pnpm run deploy
```

如果只想创建 Release，暂时不部署：

```bash
pnpm run release --bump patch
```

## 常见问题

### 本地开发必须安装 Hub 吗？

不需要。只有同步源码、部署或使用应用中心时才需要 Hub。

### Hub 必须在本机吗？

不需要。Hub 可以在本机、测试环境或线上。

### `pnpm create @nocobase/app` 和 `pnpm create @nocobase/hub` 有什么区别？

- `pnpm create @nocobase/app` 创建业务 APP 源码，带 `--hub` 和 `--app` 时也可以获取 Hub 中已有 APP
- `pnpm create @nocobase/hub` 创建应用中心运行环境

## 架构介绍

- [应用服务分层架构](./architecture.md)

## 插件开发

- [插件开发快速开始](./plugin-development-quickstart.md)
