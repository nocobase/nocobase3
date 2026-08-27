---
title: '连接 Hub'
description: '使用 APP 项目自带的 pnpm scripts 登录 NocoBase Hub，并管理本机的 Agent credential。'
keywords: 'pnpm scripts,Hub,Device Authorization,Agent credential,nb3,NocoBase 3'
---

# 连接 Hub

APP 的 Release、部署和状态查询需要 Agent credential。相关脚本已经包含在 APP 项目中，不需要把 token 复制到参数、环境变量或源码文件中。

`nb3` 可执行入口仍然保留，包括已有的 Hub 创建、启动、停止、状态和日志命令。新的 APP 工作流通过下面的项目脚本完成登录和退出。

## 登录

在 APP 源码目录中执行：

```bash
pnpm run hub:login --hub http://127.0.0.1:13000/hub
```

脚本会显示浏览器授权地址和一次性 code。批准后，credential 保存在本机的用户数据目录中，不会写入 APP 源码。

默认权限只覆盖基本资料和 APP 读取。如果需要创建 Release，可以明确申请对应 scope：

```bash
pnpm run hub:login \
  --hub http://127.0.0.1:13000/hub \
  --scope apps:read \
  --scope releases:read \
  --scope releases:publish \
  --non-interactive
```

`--non-interactive` 只表示终端不弹出交互式问题。浏览器中的授权仍然需要用户批准。

## 重新授权

如果创建 Release 或部署时遇到 scope 不足，脚本会输出一条完整的 `pnpm run hub:login` 命令。直接执行该命令并重新批准即可。

## 退出

不再使用某个 Hub 时，撤销远程 credential 并删除本地记录：

```bash
pnpm run hub:logout --hub http://127.0.0.1:13000/hub
```

## 保留的 `nb3` 入口

`nb3` 没有从包中删除。已有工作流仍然可以通过它查看完整命令树：

```bash
nb3 --help
nb3 app --help
nb3 hub --help
```

其中，`nb3 hub create/start/dev/stop/restart/status/open/logs` 继续用于管理本地 Hub 进程。APP 项目内优先使用 `release`、`deploy`、`status`、`hub:login` 和 `hub:logout` scripts。

## 相关链接

- [APP 管理脚本](./nb3-app.md) — Release、部署和状态查询
- [Quickstart](../quickstart.md) — 创建 APP、本地开发和部署的基本流程
- [Hub 应用管理 API](../design/hub-application-management-api.md) — Device Authorization 和 Agent API 契约
