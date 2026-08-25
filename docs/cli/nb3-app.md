---
title: 'nb3 app'
description: '使用 nb3 创建、拉取、开发、发布和部署 NocoBase 3 APP。'
keywords: 'nb3,CLI,APP,Hub,NocoBase 3'
---

# nb3 app

`nb3 app` 用来创建、开发、发布和部署业务 APP。APP 源码可以放在开发者电脑的任意目录，Hub 保存远程 Git 仓库、Release 和部署状态。

## 命令

```text
nb3 app create    创建本地 APP，或在 Hub 中创建后 clone 到本地
nb3 app pull      clone Hub 中已有 APP 的源码
nb3 app dev       启动本地开发环境
nb3 app publish   push 源码并创建 Release，可选直接部署
nb3 app deploy    部署、回滚或重新部署已有 Release
nb3 app status    查看 Repository、Release、Deployment 和 Runtime 状态
nb3 app list      查看有权访问的 APP
nb3 app info      查看本地 APP 信息
nb3 app config    查看或修改本地配置
nb3 app destroy   删除本地 APP 目录
```

每条命令都有独立的 `--help` 和可复制的 Examples：

```bash
nb3 app publish --help
nb3 app deploy --help
```

## 登录 Hub

首次连接 Hub 时，在浏览器中批准设备授权：

```bash
nb3 hub login --hub http://127.0.0.1:13000/hub
```

CLI 会把 Agent credential 保存在本机。APP 命令发现 scope 不足时，会返回一条可复制的 `nb3 hub login` 重新授权命令，不需要把密钥复制到命令行。

## 创建 APP

只在本地创建源码：

```bash
nb3 app create crm
cd crm
pnpm install
nb3 app dev
```

模板通过 npm 下载，只会拉取模板包，不会 clone 整个 NocoBase 仓库。也可以指定模板来源：

```bash
nb3 app create crm --template @nocobase/app-template-default@beta
nb3 app create crm --template ./packages/app-template-default
nb3 app create crm --registry https://registry.npmmirror.com
```

在 Hub 中创建 APP，并把 Hub 初始化的默认模板源码 clone 到本地：

```bash
nb3 app create crm \
  --display-name "Sales CRM" \
  --hub http://127.0.0.1:13000/hub \
  --non-interactive
```

Hub 是源码的远程权威入口，本地目录只是工作副本。如果 clone 在远程 APP 创建后失败，CLI 会返回 APP ID 和可重试的 `nb3 app pull` 命令，不会自动归档已经创建的 APP。

## 拉取已有 APP

通过 APP slug clone Hub 中的源码：

```bash
nb3 app pull crm ./crm \
  --hub http://127.0.0.1:13000/hub \
  --non-interactive
cd crm
pnpm install
nb3 app dev
```

CLI 会在 `.nb3/config.json` 中记录 Hub URL、APP ID 和 slug。后续发布、部署和查看状态时可以直接复用。

## 本地开发

```bash
nb3 app dev
```

命令会用项目自身的包管理器运行 `dev` 脚本。可以从 APP 的任意子目录执行，也可以调整开发服务地址：

```bash
nb3 app dev --port 3100
nb3 app dev --host 0.0.0.0
```

## 发布 Release

开发完成后，先提交源码，确保 Git 工作区没有未提交修改，再发布一个 Release：

```bash
nb3 app publish --bump patch --non-interactive
```

也可以指定准确版本，并在 Release 验证成功后直接部署：

```bash
nb3 app publish \
  --version 1.4.0 \
  --deploy \
  --non-interactive \
  --json
```

`--version` 和 `--bump patch|minor|major` 二选一。`--dry-run` 只验证发布计划，不 push 源码、不构建、不上传。发生中断后，可以使用错误输出中的 `--operation-id` 恢复同一个操作。

## 部署、回滚和重新部署

部署一个已有 Release：

```bash
nb3 app deploy --release 1.4.0 --non-interactive
```

在 APP 目录外执行时，需要明确指定目标 APP 和 Hub：

```bash
nb3 app deploy \
  --app crm \
  --release 1.4.0 \
  --hub http://127.0.0.1:13000/hub \
  --non-interactive
```

回滚是高风险操作。自动化环境必须显式确认：

```bash
nb3 app deploy \
  --release 1.3.0 \
  --rollback \
  --non-interactive \
  --yes
```

重新部署当前活动 Release：

```bash
nb3 app deploy --redeploy --non-interactive
```

`--dry-run` 只校验权限、APP 和目标 Release，不创建 Deployment。

## 查看 APP

查看一个 APP 的完整状态：

```bash
nb3 app status
nb3 app status --app crm --hub http://127.0.0.1:13000/hub --json
```

查看当前凭据有权访问的 APP，并使用服务端分页：

```bash
nb3 app list --hub http://127.0.0.1:13000/hub
nb3 app list --hub http://127.0.0.1:13000/hub --limit 20 --offset 20 --json
```

## 本地信息和配置

```bash
nb3 app info
nb3 app info --json
nb3 app config
nb3 app config hub
nb3 app config hub http://127.0.0.1:13000/hub
```

可修改的键是 `hub` 和 `name`。模板来源等元数据由 CLI 维护。

## 删除本地目录

```bash
nb3 app destroy ./crm
```

命令只删除本地 APP 根目录，不会删除 Hub 中的 APP。它会要求输入 APP 名称确认；自动化环境必须显式使用 `--yes`。

## 给 Coding Agent 的常用指令

```text
请使用 nb3 开发 Hub http://127.0.0.1:13000/hub 中的 crm APP。
如果尚未登录，先执行 nb3 hub login --hub http://127.0.0.1:13000/hub；
然后执行 nb3 app pull crm ./crm --hub http://127.0.0.1:13000/hub，安装依赖并运行 nb3 app dev。
开发完成并提交源码后，执行 nb3 app publish --bump patch --deploy --non-interactive。
```
