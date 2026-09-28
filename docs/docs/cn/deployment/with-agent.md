---
title: 用 AI Agent 部署
description: 说明会话位置与所需 Skill、需要提供给 Agent 的信息、各场景的提示词以及验收标准。
---

# 用 AI Agent 部署

部署的每个步骤都可以由 AI Agent 执行。应用创建时已附带部署 Skill，Agent 会自动读取；使用者需要做的是明确部署目标、准备 Agent 无法自行获取的资源，并在完成后验收。

## 会话位置与所需 Skill

| 场景                          | 会话位置                                         | Agent 使用的 Skill                                                                                         |
| ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 发布到 Hub（需要专业版授权）  | 应用源码根目录                                   | 应用自带的 `nocobase-deployment` 和 `nocobase-hub-cli`，位于 `.agents/skills/` 目录                        |
| 用 app-installer 部署到服务器 | 两个会话：在源码根目录构建部署包，在服务器上安装 | 源码侧使用 `nocobase-deployment`；服务器侧使用全局安装的 `nocobase-app-installer`                          |
| 用 Docker 部署                | 在源码根目录构建镜像，在服务器上运行容器         | `nocobase-deployment`                                                                                      |
| 安装 Hub（需要专业版授权）    | 服务器                                           | 全局安装的 `nocobase-app-installer`；以 Docker 安装时，由 Agent 按[手动部署页面](./hub#用-docker-安装)执行 |

`nocobase-hub-cli` Skill 随 `@nocobase/hub-cli` 包提供，默认模板已依赖该包；其他模板需要先执行 `pnpm add -D @nocobase/hub-cli`。

服务器上没有应用项目，因此服务器侧的 Skill 需要全局安装。在服务器上执行一次：

```bash
npx skills add nocobase/nocobase3 --skill nocobase-app-installer -g
```

Agent 可以通过两种方式操作服务器：直接在服务器上开启会话，或由本机的 Agent 通过 SSH 执行命令。前者配置更少，部署包通过 `scp` 复制到服务器即可。

## 需要提供给 Agent 的信息

- **部署方式**：Hub、app-installer 或 Docker。
- **访问地址**：例如 `https://apps.example.com/crm/`。Hub 的地址需要包含其自身的挂载路径，例如 `https://apps.example.com/hub`。
- **运行环境**：服务器的 CPU 架构和 Node 大版本。发布到 Hub 时，说明 Hub 的安装方式；以 Docker 安装的 Hub 固定为 Linux glibc 和 Node 24。
- **数据库**：沿用现有数据库、新建空数据库，或从备份恢复。
- **本次操作**：首次部署、更新版本、回滚或恢复。

凭据不写入对话。数据库密码和 Hub API Key 保存在项目根目录的 `.env` 或服务器的环境变量中，并告知 Agent 其位置。部署 Skill 要求 Agent 不输出密钥，也不将密钥写入代码仓库。

## 提示词

以下提示词按场景替换地址和名称后即可使用。每条提示词都要求 Agent 先说明将要执行的命令，并在完成后提供部署报告，这两项是验收的依据。

### 发布到 Hub

在应用源码根目录，API Key 已写入 `.env`：

```text
把这个应用发布到 Hub。Hub 地址是 https://apps.example.com/hub，应用 ID 是 crm，Hub 是用 Docker 安装的。
这是首次部署，使用 PostgreSQL，数据库已经创建，连接信息在项目根目录的 runtime.yml 里；HUB_API_KEY 在 .env 里。
先告诉我要执行的命令，完成后给我部署报告。
```

更新已在 Hub 上运行的应用：

```text
构建新版本并发布到 Hub 上的 crm 应用，沿用当前运行配置。发布前先确认这次改动是否包含数据库迁移，如果包含，提醒我备份后再继续。完成后给我部署报告。
```

回滚：

```text
crm 应用刚发布的版本有问题，回滚到上一个成功部署的 Release。先列出候选 Release 和它们的部署时间供我确认，再执行。
```

### 用 app-installer 部署到服务器

先在源码根目录构建部署包。以 Linux x64、Node 24 的服务器为例：

```text
为一台 Linux x64、Node 24 的服务器构建这个应用的部署包，数据库使用 PostgreSQL。构建完成后告诉我文件位置，以及用 scp 复制到服务器的命令。
```

将部署包复制到服务器后，在服务器上开启会话：

```text
用 app-installer 把 /tmp/crm.tar.gz 安装到 /srv/nocobase/crm，对外地址是 https://apps.example.com，挂载路径 /crm，端口 13000。
数据库是 PostgreSQL，主机 db.internal，数据库名和用户名都是 crm，密码在环境变量 CRM_DB_PASSWORD 里。
安装完成后告诉我登录地址、初始管理员账号，以及反向代理的配置方法。
```

升级：

```text
用 /tmp/crm.tar.gz 升级 /srv/nocobase/crm 中的应用。先告诉我停机时长和备份范围，等我确认后再执行。
```

### 用 Docker 部署

在应用源码根目录：

```text
用项目自带的 Dockerfile 构建 linux/amd64 镜像，标签 crm:release-001。然后编写 compose.yml：对外地址 https://apps.example.com，挂载路径 /crm，端口仅对本机 127.0.0.1:13000 开放，config.yml 只读挂载，storage 挂载到 ./storage。
```

在服务器上，镜像和部署目录已准备完毕：

```text
在 /srv/nocobase/crm 用 docker compose 启动 crm。启动前先用镜像中的 config check 检查 config.yml，启动后检查健康检查和日志，告诉我结果。
```

### 安装 Hub

在服务器上：

```text
用 app-installer 在这台服务器的 /srv/nocobase/hub 安装最新版 Hub，对外地址 https://apps.example.com，使用 SQLite。安装完成后告诉我登录地址、初始管理员账号，以及 Nginx 的配置方法。
```

## 验收

部署报告需要包含以下内容，缺少的项目应要求 Agent 补充：

- 部署的版本，以及部署包或镜像的标识。
- 数据库迁移和初始化任务的执行结果。
- 健康检查地址 `<挂载路径>/api/healthz` 的响应。
- 以管理员登录、创建一条测试记录并上传一个文件，重启服务后两者仍然存在。
- 跳过的检查项及原因。

进程启动不代表应用可用。收到报告后，应自行打开正式地址登录一次。

## 需要人工介入的操作

部署 Skill 要求 Agent 在以下情况下暂停并等待确认：

- **需要 sudo 权限的操作**：安装全局 pm2、执行 `pm2 startup` 输出的命令、修改 Nginx 配置。Agent 提供命令，由使用者执行。
- **停机确认**：用 app-installer 升级或回滚会停止应用，升级 Hub 还会停止其托管的所有应用。Agent 会先说明影响范围，等待明确同意。
- **外部数据库的备份**：app-installer 仅备份 SQLite。使用 PostgreSQL、MySQL 等数据库时，Agent 会要求先完成备份。
- **凭据**：Agent 不代为创建 Hub API Key，也不推测密码，而是说明创建位置和存放文件。
