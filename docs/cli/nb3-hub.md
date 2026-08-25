---
title: 'nb3 hub'
description: '使用 nb3 登录、创建、启动和管理本地 NocoBase 3 Hub。'
keywords: 'nb3,CLI,Hub,Agent credential,NocoBase 3'
---

# nb3 hub

`nb3 hub` 用来创建和运行本地 Hub，也负责 Coding Agent 的设备登录。Hub 是 APP 的管理入口，保存源码仓库、Release、部署、权限和审计信息。

## 命令

```text
nb3 hub login     登录 Hub 并保存 Agent credential
nb3 hub logout    撤销并删除本地 credential
nb3 hub create    创建本地 Hub
nb3 hub start     启动 Hub
nb3 hub dev       开发模式启动 Hub
nb3 hub stop      停止 Hub
nb3 hub restart   重启 Hub
nb3 hub status    查看 Hub 进程状态
nb3 hub open      打开应用管理页面
nb3 hub logs      查看 Hub 日志
```

## 登录远程或本地 Hub

APP 的创建、拉取、发布和部署需要 Agent credential。首次使用时执行：

```bash
nb3 hub login --hub http://127.0.0.1:13000/hub
```

CLI 会显示浏览器授权地址和一次性 code。批准后，credential 保存在本机的 `~/.nb3/` 目录，不会写入 APP 源码。

不再使用某个 Hub 时可以撤销 credential：

```bash
nb3 hub logout --hub http://127.0.0.1:13000/hub
```

## 创建本地 Hub

```bash
nb3 hub create my-hub
cd my-hub
pnpm install
nb3 hub start
```

Hub 从发布包创建，运行数据和部署产物保存在项目自己的目录中。可以指定监听地址或本地 Hub 包：

```bash
nb3 hub create my-hub --port 3100
nb3 hub create my-hub --host 0.0.0.0
nb3 hub create my-hub --template ./packages/hub
```

配置记录在 `.nb3/hub.json`。Hub 第一次启动时会初始化默认 APP 的源码仓库、初始 Release 和首次 Deployment。

## 启动 Hub

```bash
nb3 hub start
```

Hub 默认在后台运行。想在当前终端直接查看服务输出，可以使用：

```bash
nb3 hub start --foreground
```

启动后打开应用管理页面：

```bash
nb3 hub open
nb3 hub open --print
```

`--print` 只输出 URL，不调用系统浏览器。

## 开发模式

开发 Hub 本身时使用：

```bash
nb3 hub dev
```

命令会停留在当前终端，可以直接看到热更新输出。也可以调整目录和监听地址：

```bash
nb3 hub dev --port 3100
nb3 hub dev --host 0.0.0.0
nb3 hub dev --hub-dir ./my-hub --portals-dir ./my-hub/app-dist
```

## 查看状态和日志

```bash
nb3 hub status
nb3 hub status --json
nb3 hub logs
nb3 hub logs --tail 200
nb3 hub logs --follow
```

`nb3 hub status` 显示 Hub 是否运行、进程号、访问地址和已部署 APP 数量。

## 停止或重启

```bash
nb3 hub stop
nb3 hub restart
```

停止命令会终止 Hub 的整个进程组，并清理失效的进程记录。

## 和 nb3 app 的关系

`nb3 hub` 管理 Hub 进程和 Agent 登录，`nb3 app` 管理业务 APP 的开发和生命周期。

```bash
nb3 app create crm \
  --hub http://127.0.0.1:13000/hub \
  --non-interactive
cd crm
pnpm install
nb3 app dev
nb3 app publish --bump patch --deploy --non-interactive
```
