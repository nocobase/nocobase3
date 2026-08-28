# Quickstart

V3 的基本思路：

```text
先开发 App。
需要部署时，再准备 Hub。
```

## 0. 配置源

```bash
pnpm config set @nocobase:registry https://npm.nocobase.ai/
```

## 1. 创建本地 App

```bash
pnpm create @nocobase/app crm
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

## 3. 准备 Hub（未实现）

Hub 是用于部署和管理 App 的应用中心。

如果已经有线上或测试环境 Hub，可以直接使用它。

如果需要本地 Hub：

```bash
pnpm create @nocobase/hub my-hub
cd my-hub
pnpm build
pnpm start
```

## 4. 部署 App（未实现）

回到 App 目录：

```bash
cd ../crm
```

部署到本地 Hub（需要 oauth 认证）：

```bash
pnpm deploy --hub http://localhost:3000/crm
```

部署到远端 Hub（需要 oauth 认证）：

```bash
pnpm deploy --hub http://localhost:3000/crm
```

后续如果 App 已经记录了 Hub 地址，可以直接执行：

```bash
pnpm deploy
```

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
