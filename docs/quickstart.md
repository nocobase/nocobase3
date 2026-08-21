# Quickstart

V3 的基本思路：

```text
先开发 App。
需要部署时，再准备 Hub。
```

## 1. 安装 CLI

```bash
npm install -g @nocobase/nb3-cli
```

## 2. 创建本地 App

```bash
nb3 app create crm
cd crm
```

这个目录就是 App 源码目录，可以放在任意位置。

```bash
crm/
  .nb3/
  client/
  server/
  package.json
```

## 3. 本地开发

```bash
nb3 app dev
```

如果只是本地开发，到这里就够了，不需要安装 Hub。

## 4. 准备 Hub

Hub 是用于部署和管理 App 的应用中心。

如果已经有线上或测试环境 Hub，可以直接使用它。

如果需要本地 Hub：

```bash
nb3 hub create my-hub
cd my-hub
nb3 hub start
nb3 hub open
```

## 5. 部署 App

回到 App 目录：

```bash
cd ../crm
```

部署到本地 Hub：

```bash
nb3 app deploy --hub http://localhost:3000
```

部署到远端 Hub：

```bash
nb3 app deploy --hub https://apps.example.com
```

后续如果 App 已经记录了 Hub 地址，可以直接执行：

```bash
nb3 app deploy
```

## 常见问题

### 本地开发必须安装 Hub 吗？

不需要。只有部署或使用应用中心时才需要 Hub。

### Hub 必须在本机吗？

不需要。Hub 可以在本机、测试环境或线上。

### `nb3 app create` 和 `nb3 hub create` 有什么区别？

`nb3 app create` 创建业务 App 源码。

`nb3 hub create` 创建应用中心运行环境。

## 架构介绍

- [应用服务分层架构](./architecture.md)
