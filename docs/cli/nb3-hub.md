# nb3 hub

`nb3 hub` 用来管理本地 Hub。

Hub 是用于部署和管理 App 的应用中心。只有需要部署 App、管理多个 App，或本地完整体验应用中心时，才需要 Hub。

## 命令

```text
nb3 hub create    创建本地 Hub
nb3 hub start     启动 Hub
nb3 hub dev       开发模式启动 Hub
nb3 hub stop      停止 Hub
nb3 hub restart   重启 Hub
nb3 hub status    查看 Hub 状态
nb3 hub open      打开 App Console
nb3 hub logs      查看 Hub 日志
```

## 创建 Hub

```bash
nb3 hub create my-hub
cd my-hub
```

和 `nb3 app create` 一样，Hub 也是下载模板包生成一个本地项目：

```text
my-hub/
  .nb3/
    hub.json
    logs/
    cache/
  app-dist/
  package.json
  ...
```

创建完成后安装依赖并启动：

```bash
cd my-hub
pnpm install
nb3 hub start
```

可以指定监听地址和模板来源：

```bash
nb3 hub create my-hub --port 3100
nb3 hub create my-hub --host 0.0.0.0
nb3 hub create my-hub --template ./packages/hub
```

配置记录在 `.nb3/hub.json`。App 部署后落在 `app-dist/`。

## 启动 Hub

```bash
nb3 hub start
```

Hub 在后台运行，命令返回后仍继续服务。想在当前终端直接看输出，可以用：

```bash
nb3 hub start --foreground
```

启动后可以打开 App Console：

```bash
nb3 hub open
nb3 hub open --print   # 只打印地址，不打开浏览器
```

App Console 用于创建、查看、配置和管理 App。

## 开发模式

开发 Hub 本身时使用：

```bash
nb3 hub dev
```

和 `nb3 hub start` 的区别是它停留在当前终端，可以直接看到热更新输出。

默认从 Hub 目录下的 `app-dist/` 发现已部署的 App。可以通过参数调整：

```bash
nb3 hub dev --port 3100
nb3 hub dev --host 0.0.0.0
nb3 hub dev --hub-dir ./my-hub --portals-dir ./my-hub/app-dist
```

## 查看状态

```bash
nb3 hub status
nb3 hub status --json
```

可以查看当前 Hub 是否正在运行、进程号、访问地址和已部署 App 数量。

## 查看日志

```bash
nb3 hub logs
nb3 hub logs --tail 200
```

持续查看日志：

```bash
nb3 hub logs --follow
```

## 停止或重启

```bash
nb3 hub stop
nb3 hub restart
```

## 和 nb3 app 的关系

`nb3 hub` 管应用中心。

`nb3 app` 管业务 App。

本地开发 App 不一定需要 Hub：

```bash
nb3 app create crm
cd crm
nb3 app dev
```

需要部署时，再指定目标 Hub：

```bash
nb3 app deploy --hub http://localhost:3000
```
