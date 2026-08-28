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

## 3. 准备 Hub

Hub 是用于部署和管理 APP 的应用中心。如果已经有线上或测试环境 Hub，可以直接使用它。

如果需要本地 Hub：

```bash
pnpm create @nocobase/hub my-hub
cd my-hub
pnpm start
```

## 4. 发布或部署 APP

Hub 会预创建一个名为 `default` 的空 APP。它没有 Release，也不会自动运行。回到 APP 目录，首次将本地源码构建并部署到本地 Hub 的默认 APP：

```bash
cd ../crm
pnpm run deploy --hub http://127.0.0.1:13000/hub --app default
```

部署到远端 Hub 的默认 APP：

```bash
pnpm run deploy --hub https://hub.example.com/hub --app default
```

不带 Release 参数的 `deploy` 会在本地构建、上传产物、创建下一个 patch Release，并部署这个 Release。显式指定 `--app default` 后，第一个 Release 和 Deployment 都属于预创建的默认 APP。后续已经记录 Hub 地址和 APP 关联时，可以直接执行：

```bash
pnpm run deploy
```

如果要绑定 Hub 中其他已有 APP，首次发布或部署时也用 `--app` 明确指定：

```bash
pnpm run deploy \
  --hub https://hub.example.com/hub \
  --app sales
```

首次部署时省略 `--app`，script 会在 Hub 中创建另一个 APP，不会自动绑定到默认 APP。

绑定信息保存在本地 `.nocobase/config.json`。Hub 不保存源码，因此需要在持有真实源码的本地目录中执行这个命令。

如果只想创建 Release，暂时不部署：

```bash
pnpm run release --bump patch
```

## 常见问题

### 本地开发必须安装 Hub 吗？

不需要。只有发布产物、部署或使用应用中心时才需要 Hub。

### Hub 必须在本机吗？

不需要。Hub 可以在本机、测试环境或线上。

### Hub 会保存 APP 源码吗？

不会。当前阶段源码只保存在开发者本地。Hub 只保存构建产物，并管理 Release、Deployment 和 Runtime。请使用 Git 或其他本地团队已有的方式自行备份源码。

### `pnpm create @nocobase/app` 和 `pnpm create @nocobase/hub` 有什么区别？

- `pnpm create @nocobase/app` 根据默认模板创建本地 APP 源码
- `pnpm create @nocobase/hub` 创建应用中心运行环境

## 架构介绍

- [应用服务分层架构](./architecture.md)

## 插件开发

- [插件开发快速开始](./plugin-development-quickstart.md)
