# nb hub

`nb hub` 用来管理本地 Hub。

Hub 是用于部署和管理 App 的应用中心。只有需要部署 App、管理多个 App，或本地完整体验应用中心时，才需要 Hub。

## 命令

```text
nb hub create    创建本地 Hub
nb hub start     启动 Hub
nb hub dev       源码开发模式启动 Hub
nb hub stop      停止 Hub
nb hub restart   重启 Hub
nb hub status    查看 Hub 状态
nb hub open      打开 App Console
nb hub logs      查看 Hub 日志
```

## 创建 Hub

```bash
nb hub create my-hub
cd my-hub
```

生成一个本地 Hub 运行环境：

```text
my-hub/
  package.json
  .env
  .nocobase/
    config.json
    hub.sqlite
    logs/
    cache/
  app-dist/
    .gitkeep
```

## 启动 Hub

```bash
nb hub start
```

启动后可以打开 App Console：

```bash
nb hub open
```

App Console 用于创建、查看、配置和管理 App。

## 源码开发 Hub

在 NocoBase 源码仓库中开发 Hub 时，可以使用：

```bash
nb hub dev
```

默认使用源码仓库中的开发目录：

```text
playground/hub
```

并从以下目录发现已部署的 App/Portal：

```text
playground/hub/app-dist
```

可以通过参数调整监听地址和开发目录：

```bash
nb hub dev --port 3100
nb hub dev --host 0.0.0.0
nb hub dev --hub-dir ./playground/hub --portals-dir ./playground/hub/app-dist
```

## 查看状态

```bash
nb hub status
```

可以查看当前 Hub 是否正在运行、访问地址、Console 地址和已部署 App 数量。

## 查看日志

```bash
nb hub logs
```

持续查看日志：

```bash
nb hub logs --follow
```

## 停止或重启

```bash
nb hub stop
nb hub restart
```

## 和 nb app 的关系

`nb hub` 管应用中心。

`nb app` 管业务 App。

本地开发 App 不一定需要 Hub：

```bash
nb app create crm
cd crm
nb app dev
```

需要部署时，再指定目标 Hub：

```bash
nb app deploy --hub http://localhost:3000
```
