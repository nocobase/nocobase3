# Quickstart

V3 的基本思路：

```text
先开发 App。
需要部署时，再准备 Hub。
```

## 1. 创建本地 App

```bash
pnpm --config.registry=https://npm.nocobase.ai create @nocobase/app@latest crm
cd crm
```

脚手架会提示选择数据库；快速体验选择 SQLite 即可，不需要额外配置。它会从
`latest` 渠道获取最新模板，生成 `.env.local`，安装依赖，并验证 SQLite
原生驱动可以加载。
生成的项目会在 `.npmrc` 中保留仅作用于 `@nocobase` scope 的 Registry
配置，后续安装依赖和构建 dist 不需要重复添加 Registry 参数。当前 v3
脚手架尚未发布到公共 npm，因此创建命令本身需要显式指定 NocoBase Registry。
如需使用 PostgreSQL 或 MySQL，将 `--db-dialect` 改为 `postgres` 或 `mysql`，
并在启动前填写 `.env.local` 中的实际数据库连接。

这个目录就是 App 源码目录，可以放在任意位置。
源码管理方式由开发团队自行决定；Hub 不作要求，也不托管这份源码。

```text
crm/
  .nb3/config.json
  .env.local
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
npm install -g @nocobase/nb3-cli@beta --registry=https://npm.nocobase.ai
nb3 hub create my-hub
cd my-hub
pnpm build
pnpm start
```

## 4. 部署 App

回到 App 目录：

```bash
cd ../crm
```

生成的 App 自带 `deploy` 脚本。它会调用 `nb3 app deploy`，在本地完成构建，
并将构建产物交给 Hub，不会上传源码。
不需要先在 Hub 登记应用；第一个合法产物上传并完成校验后，Hub 会自动将 App
加入应用清单。
Hub 管理员需要先配置 `HUB_DEPLOY_TOKEN`；CLI 通过
`NOCOBASE_HUB_TOKEN` 或 `--token` 提交同一个部署令牌。令牌不会写入
`.nb3/config.json`。

部署到本地 Hub：

```bash
export NOCOBASE_HUB_TOKEN=YOUR_HUB_DEPLOY_TOKEN
pnpm run deploy --hub http://localhost:3000/crm
```

部署到远端 Hub：

```bash
export NOCOBASE_HUB_TOKEN=YOUR_HUB_DEPLOY_TOKEN
pnpm run deploy --hub https://apps.example.com/crm
```

后续如果 App 已经记录了 Hub 地址，可以直接执行：

```bash
pnpm run deploy
```

这里需要写 `pnpm run deploy`。pnpm 11 自己也有一个同名的内置
`pnpm deploy` 命令，直接省略 `run` 会进入 pnpm 的工作区部署命令，而不是部署
NocoBase App。

## 常见问题

### 本地开发必须安装 Hub 吗？

不需要。只有部署或使用应用中心时才需要 Hub。

### Hub 必须在本机吗？

不需要。Hub 可以在本机、测试环境或线上。

### `pnpm create @nocobase/app@latest` 和 `nb3 hub create` 有什么区别？

`pnpm create @nocobase/app@latest` 使用官方脚手架创建业务 App 源码。

`nb3 hub create` 创建应用中心运行环境。

## 架构介绍

- [应用服务分层架构](./architecture.md)

## 插件开发

- [插件开发快速开始](./plugin-development-quickstart.md)
