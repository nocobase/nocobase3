# Quickstart

V3 的基本思路：

```text
先开发 App。
需要部署时，再准备 Hub。
```

## 1. 创建本地 App

```bash
pnpm config set @nocobase:registry https://npm.nocobase.ai/
pnpm create @nocobase/app@latest crm
cd crm
```

这个目录就是 App 源码目录，可以放在任意位置。

```bash
crm/
  client/
  server/
  package.json
```

## 2. 本地开发

```bash
pnpm dev
```

如果只是本地开发，到这里就够了，不需要安装 Hub。

## 3. 准备 Hub

Hub 是用于部署和管理 App 的应用中心。

如果已经有线上或测试环境 Hub，可以直接使用它。

如果需要本地 Hub：

```bash
pnpm create @nocobase/hub my-hub
cd my-hub
pnpm build
pnpm start
```

## 4. 部署 App

回到 App 目录：

```bash
cd ../crm
```

先在 Hub 的「应用中心」创建同名 App，再从「开发与部署」弹窗复制包含 deploy token 的完整命令。命令类似于：

```bash
pnpm run deploy \
  --hub http://127.0.0.1:13001/hub \
  --token nb3_app_...
```

这条命令可以直接执行。CI 中也可以通过 `NB3_HUB_TOKEN` 提供 token：

```bash
NB3_HUB_TOKEN="$DEPLOY_TOKEN" \
  pnpm run deploy --hub https://hub.example.com/hub
```

`--hub` 当前必填，地址需要包含 Hub 的挂载路径，比如 `/hub`。部署脚本只在 App 根目录工作，不支持 `--dir`，也不会读取 `.nb3` 中保存的 Hub 地址。

## 常见问题

### 本地开发必须安装 Hub 吗？

不需要。只有部署或使用应用中心时才需要 Hub。

### Hub 必须在本机吗？

不需要。Hub 可以在本机、测试环境或线上。

### `pnpm create @nocobase/app` 和 `pnpm create @nocobase/hub` 有什么区别？

- `pnpm create @nocobase/app` 创建业务 App 源码。
- `pnpm create @nocobase/hub` 创建应用中心运行环境。

## 架构介绍

- [应用服务分层架构](./architecture.md)

## 插件开发

- [插件开发快速开始](./plugin-development-quickstart.md)
