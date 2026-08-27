---
title: NocoBase 3 Hub 使用说明书
description: NocoBase 3 Hub 的 App 创建、部署令牌、Release 发布、审批、回滚、运行资源和常见问题说明。
keywords:
  - NocoBase 3
  - Hub
  - App Host
  - Release
  - 发布管理
---

# NocoBase 3 Hub 使用说明书

NocoBase 3 Hub 用来创建和管理 App。你可以在这里预留一个空 App、获取部署令牌、查看运行状态、启动或停止 App、审批 Release、执行上线和回滚，并查看运行资源的生效状态。

这份说明适合三类读者：通过 Hub 打开业务 App 的使用者、负责审批和运行维护的 Hub 管理员，以及负责生成 Release 的 App 开发者或 Agent。只想使用业务 App 时，阅读「使用应用中心」即可；只有负责部署时，才需要了解 Release 目录和 App Host。

Hub 会创建 App 记录，不过不会在开发者电脑上创建源码目录或在线编辑源码。一次完整发布由四个部分协作完成：

```text
Hub 创建空 App 并生成可直接执行的部署命令
        │
        ▼
App 项目内置脚本在开发者电脑上构建并上传 App Release
        │
        ▼
Hub 接收 Release、提交审批并记录发布流程
        │
        ▼
App Host 保存产物、启动候选版本、执行健康检查并切换流量
        │
        ▼
浏览器通过 Hub 的同源地址打开 App
```

:::warning 注意

Hub 目前处于预览阶段。本说明只覆盖当前源码中已经接通的能力。文件存储配置、多环境发布、成员和角色管理等页面还没有开放，不应按生产完备能力使用。

:::

## 当前可以做什么

| 需求                                            | 当前入口                   | 能力状态                        |
| ----------------------------------------------- | -------------------------- | ------------------------------- |
| 创建空 App 并复制完整部署命令                   | 「应用中心 / 创建应用」    | 可用                            |
| 使用 `pnpm run deploy --hub ...` 构建并上传 App | 本地 App                   | 可用，会自动提交管理员审批      |
| 查看所有 App 和运行状态                         | 「应用中心」               | 可用                            |
| 打开、启动、停止或重启 App                      | 「应用中心」或 App「概览」 | 可用                            |
| 审批 Release 并上线                             | 「版本与发布」             | 可用                            |
| 将 App 回滚到历史 Release                       | 「版本与发布」             | 可用                            |
| 查看数据库等运行资源的生效状态                  | App「运行资源」            | 只读预览                        |
| 查看 Hub、App Host 和发布数据的运行状态         | `/hub/settings`            | 只读页面，主导航暂未提供入口    |
| 在 Hub 中配置数据库、文件存储、缓存或运行参数   | 无                         | 页面入口未开放                  |
| 在测试、预发布和生产环境间晋级                  | 无                         | 未实现，当前只有单环境受控发布  |
| 使用 Worker、独立进程或外部服务运行 App         | 无                         | 未实现，当前只支持 `in-process` |

## 启动和维护 Hub

### 使用 CLI 创建 Hub

安装 NocoBase 3 CLI：

```bash
npm install -g @nocobase/nb3-cli@beta \
  --registry https://npm.nocobase.ai
```

创建一个本地 Hub：

```bash
nb3 hub create my-hub
cd my-hub
pnpm install
```

`nb3 hub create` 会生成 Hub 工程、`.nb3/hub.json` 和 `app-dist/`。默认监听地址是 `127.0.0.1:3000`，可以在创建时修改：

```bash
nb3 hub create my-hub --host 0.0.0.0 --port 3100
```

`nb3 hub start` 使用生产模式，所以首次启动前需要在 Hub 目录的 `.env.local` 中提供认证配置。下面以默认 `3000` 端口为例：

```env
APP_NAME=hub
APP_BASE_PATH=/hub
AUTH_SECRET=<高强度随机值>
NOCOBASE_AUTH_URL=http://127.0.0.1:3000/hub/api/auth

APP_HOST_CONTROL_URL=http://127.0.0.1:13200
APP_HOST_GATEWAY_URL=http://127.0.0.1:13200
APP_HOST_CONTROL_TOKEN=replace-with-a-strong-token
```

如果修改了 Hub 的域名、协议或端口，需要同步修改 `NOCOBASE_AUTH_URL`。生产环境应使用外部可访问的 HTTPS 地址。

当前 CLI 不会安装或管理 App Host。可以在 Hub 工程里安装预览版 App Host，并在另一个终端启动它：

```bash
pnpm add -D @nocobase/app-host@beta \
  --registry https://npm.nocobase.ai

APP_DIST_DIR="$PWD/app-dist" \
APP_HOST_PORT=13200 \
APP_HOST_CONTROL_TOKEN='replace-with-a-strong-token' \
pnpm exec app-host
```

这里的 `APP_HOST_CONTROL_TOKEN` 必须跟 Hub `.env.local` 中的值一致。App Host 会持续占用当前终端，生产环境应交给进程管理器运行。

启动并打开 Hub：

```bash
nb3 hub start
nb3 hub open --print
```

当前 CLI 输出的是 Hub 的监听地址。默认模板还需要加上 `/hub/` 才是管理页面，比如 `http://127.0.0.1:3000/hub/`。`nb3 hub open` 会直接打开监听地址；如果浏览器显示 `404`，在地址后补上 `/hub/`。

常用维护命令如下：

| 命令                      | 用途                             |
| ------------------------- | -------------------------------- |
| `nb3 hub status`          | 查看进程、地址和 App 目录数量    |
| `nb3 hub status --json`   | 以 JSON 输出状态                 |
| `nb3 hub logs --tail 200` | 查看最近 200 行日志              |
| `nb3 hub logs --follow`   | 持续查看日志                     |
| `nb3 hub restart`         | 重启 Hub                         |
| `nb3 hub stop`            | 停止 Hub                         |
| `nb3 hub open --print`    | 只输出监听地址，不自动打开浏览器 |

:::warning 注意

当前预览版的 `nb3 hub start` 和 `nb3 hub dev` 只启动 Hub，不会一并启动 App Host。App Host 需要由部署环境单独运行，并读取这个 Hub 使用的 `app-dist/`。没有 App Host 时，登录页仍可访问，不过 App 清单、发布和运行控制不可用。

`nb3 hub status` 中的 App 数量来自对 `app-dist` 一级目录的扫描，只能说明目录存在，不能证明 App Host 或 App Runtime 正常。

:::

### 在本仓库中运行

#### 运行要求

- Node.js 24 或更高版本
- pnpm 11.7.0
- 已安装仓库依赖
- 一个可供 App Host 读取的 `app-dist` 目录

以下命令都在仓库根目录执行：

```bash
pnpm install
```

#### 1. 配置 Hub

新环境可以先复制示例配置：

```bash
cp packages/hub/.env.example packages/hub/.env.local
```

本地开发所需的核心配置如下：

```env
APP_NAME=hub
APP_BASE_PATH=/hub
APP_SERVER_PORT=13001

APP_HOST_CONTROL_URL=http://127.0.0.1:13200
APP_HOST_GATEWAY_URL=http://127.0.0.1:13200
APP_HOST_CONTROL_TOKEN=local-release-demo
```

其中：

- `APP_HOST_CONTROL_URL` 是 Hub 服务端访问 App Host 控制接口的内部地址
- `APP_HOST_GATEWAY_URL` 是 Hub 将 App 请求转发给 App Host 的内部地址，未配置时跟 `APP_HOST_CONTROL_URL` 相同
- `APP_HOST_CONTROL_TOKEN` 必须跟 App Host 使用同一个值
- `HUB_ADMIN_EMAILS` 可以指定一个或多个管理员邮箱，多个邮箱用逗号分隔

:::warning 注意

不要把 `AUTH_SECRET`、`APP_HOST_CONTROL_TOKEN`、`HUB_SETTINGS_ENCRYPTION_KEY` 或其他 API 凭证提交到 Git。App Host 控制地址只应供 Hub 服务端访问，不要直接暴露给浏览器。

:::

#### 2. 启动 App Host

先构建 App Host：

```bash
pnpm --filter @nocobase/app-host build
```

然后让它读取仓库根目录下的 `app-dist`：

```bash
APP_DIST_DIR="$PWD/app-dist" \
APP_HOST_PORT=13200 \
APP_HOST_CONTROL_TOKEN=local-release-demo \
pnpm --filter @nocobase/app-host start
```

App Host 默认绑定本机地址。浏览器不需要访问 `13200` 端口，业务 App 会通过 Hub 的同源地址打开，比如 `http://127.0.0.1:13001/main/`。

#### 3. 启动 Hub

另开一个终端运行：

```bash
pnpm --filter @nocobase/hub dev
```

打开：

```text
http://127.0.0.1:13001/hub/
```

Hub 开发服务会在 `13001` 端口提供页面和 API。Vite 默认从 `5173` 端口开始查找空闲端口。

#### 4. 生产模式的必要配置

生产环境除了 App Host 连接信息，还必须配置：

```env
AUTH_SECRET=<高强度随机值>
NOCOBASE_AUTH_URL=https://hub.example.com/hub/api/auth
```

先分别完成构建：

```bash
pnpm --filter @nocobase/app-host build
pnpm --filter @nocobase/hub build
```

启动两个服务时，需要通过进程环境分别为 App Host 提供 `APP_DIST_DIR`、端口和控制凭证，为 Hub 提供认证、公开地址和 App Host 连接信息。生产部署还需要由进程管理器、反向代理和密钥管理服务负责守护进程、TLS、日志与凭证注入。这些基础设施不由 Hub 页面管理。

### 常用环境变量

Hub 常用配置如下：

| 变量                          | 用途                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `APP_BASE_PATH`               | Hub 的公开路径，默认是 `/hub`                         |
| `APP_SERVER_HOST`             | Hub 监听地址，默认是 `127.0.0.1`                      |
| `APP_SERVER_PORT`             | Hub 监听端口，仓库开发默认是 `13001`                  |
| `AUTH_SECRET`                 | Hub 原生认证密钥，生产环境必填                        |
| `NOCOBASE_AUTH_URL`           | 外部可访问的 Hub 认证地址，生产环境必填               |
| `HUB_ADMIN_EMAILS`            | Hub 管理员邮箱，多个值用逗号分隔                      |
| `APP_HOST_CONTROL_URL`        | Hub 服务端访问 App Host 控制接口的地址                |
| `APP_HOST_GATEWAY_URL`        | Hub 转发 App 请求的 App Host 地址，默认跟控制地址相同 |
| `APP_HOST_CONTROL_TOKEN`      | Hub 访问 App Host 控制接口的 Bearer Token             |
| `HUB_DATABASE_PATH`           | Hub 用户、账号和 Session 使用的 SQLite 文件           |
| `HUB_RELEASE_STORE_PATH`      | 发布、审批和生命周期操作的本地存储前缀                |
| `HUB_SETTINGS_STORE_PATH`     | 设置原型及其审计记录的本地存储文件                    |
| `HUB_SETTINGS_ENCRYPTION_KEY` | 设置原型中 S3 凭证的加密密钥，至少 32 个字符          |

App Host 常用配置如下：

| 变量                       | 用途                                       |
| -------------------------- | ------------------------------------------ |
| `APP_DIST_DIR`             | App、Release 和 App Host 私有状态的根目录  |
| `APP_HOST_BIND`            | App Host 监听地址，默认是 `127.0.0.1`      |
| `APP_HOST_PORT`            | App Host 监听端口，默认是 `3000`           |
| `APP_HOST_CONTROL_TOKEN`   | 控制接口 Bearer Token，必须跟 Hub 配置一致 |
| `APP_HOST_PUBLIC_URL`      | App Host 对外地址跟本地监听地址不同时使用  |
| `MAX_ACTIVE_APPS`          | 允许同时激活的 App 数量                    |
| `APP_IDLE_TTL_MS`          | Runtime 空闲多久后可以被回收               |
| `APP_EVICTION_INTERVAL_MS` | App Host 检查空闲 Runtime 的时间间隔       |

App Host 当前固定限制单个压缩包不超过 512 MiB、解压内容不超过 1 GiB，且文件和目录项合计不超过 100,000。它还会拒绝绝对路径、目录穿越、符号链接、重复条目和契约以外的文件。超过任一上限会返回 `APP_RELEASE_UPLOAD_LIMIT_EXCEEDED`，临时上传目录会自动清理。当前版本没有开放调整这些上限的配置项。

## 注册和登录

未登录访问管理页时，Hub 会跳转到 `/hub/login`。你可以使用用户名或邮箱加密码登录。

第一次使用时：

1. 在登录页点击「Sign up」
2. 填写姓名、用户名、邮箱和密码
3. 点击「Create account」
4. 注册完成后回到 Hub

管理员身份按以下规则确定：

- 配置了 `HUB_ADMIN_EMAILS` 时，只有命中的邮箱是 Hub 管理员
- 未配置 `HUB_ADMIN_EMAILS` 时，最早注册的账号是 bootstrap 管理员
- 普通账号虽然可以登录并看到导航，但读取或操作发布控制面时会收到 `403`

创建 App、审批、拒绝、回滚和 App 生命周期操作都要求 Hub 管理员权限。App 部署令牌只能为绑定的 App 上传 Release 并提交发布审批，不能批准自己的申请，也不能访问其他 App。当前管理员审批没有职责分离，同一个管理员可以提交并批准自己从页面发起的申请。

## 使用应用中心

登录后，点击左侧的「应用中心」进入 `/hub/apps`。

页面顶部显示四个指标：

| 指标     | 含义                            |
| -------- | ------------------------------- |
| 应用总数 | Hub 中预留或已经上传的 App 数量 |
| 已发布   | 已经有在线 Release 的 App 数量  |
| 可用版本 | 所有 App 的 Release 总数        |
| 发布失败 | 状态为发布失败的记录数量        |

每张 App 卡片会显示 App 名称、App ID、运行状态、当前版本、可用版本数和最近操作时间。

### 创建一个空 App

第一次发布 App 时，先在 Hub 中预留 App ID：

1. 点击「创建应用」
2. 填写「应用名称」和「App ID」
3. 点击「创建空应用」
4. 复制本地开发命令和部署命令
5. 在本地 App 根目录执行包含 deploy token 的完整部署命令

「应用名称」用于 Hub 中的展示。「App ID」会用于本地项目身份、Release 身份和访问路径，创建后不可更改。它只能包含字母、数字、下划线和连字符，最长 128 个字符；`hub`、`api`、`assets`、`healthz`、`__apps` 和 `__health` 等保留名称不能使用。

Hub 创建的是一个「未发布」App 记录，不会在你的电脑上创建源码目录。创建结果会给出类似下面的本地开发命令：

```bash
pnpm config set @nocobase:registry https://npm.nocobase.ai/
pnpm create @nocobase/app@latest crm
cd crm
pnpm dev
```

本地 App 的 `package.json.name` 必须跟 Hub 中预留的 App ID 一致。部署脚本会读取这个字段作为目标 App ID。

部署命令已经包含当前 App 的 deploy token，可以直接复制到本地 App 根目录执行。Hub 页面会在当前浏览器中记住这个 token，再次点击「开发与部署」时仍会显示完整命令。

:::warning 注意

如果当前浏览器没有保存目标 App 的 deploy token，打开「开发与部署」时，Hub 会生成一个新 token 并写入命令。生成新 token 后，旧 token 会立即失效。每个 token 只绑定一个 App，不能用来部署其他 App。

:::

### App 操作

| 操作         | 结果                                 |
| ------------ | ------------------------------------ |
| 「打开 App」 | 在新窗口中打开业务 App               |
| 「管理」     | 进入该 App 的概览页                  |
| 「重新启动」 | 短暂中断服务，并重新加载当前在线版本 |
| 「停止运行」 | 停止 Runtime，并禁止因访问自动启动   |
| 「启动 App」 | 启动已经发布但处于停止状态的 App     |
| 「刷新状态」 | 重新读取 App Host 和发布记录         |

「停止运行」不会删除 App，也不会删除 Release、数据或配置。

### 运行状态

| 状态                | 含义                                             |
| ------------------- | ------------------------------------------------ |
| 运行中              | App Runtime 正在运行                             |
| 启动中              | Runtime 正在启动，暂时不能重复操作               |
| 停止中              | Runtime 正在停止，暂时不能重复操作               |
| 已停止              | App 被主动停止，不会因访问自动启动               |
| 已发布 · 访问时启动 | 已有在线 Release，Runtime 当前休眠，会按访问启动 |
| 未发布              | App 还没有在线 Release                           |
| 运行异常            | App Host 报告 Runtime 启动或运行失败             |

「未发布」和「已停止」含义不同。前者没有在线 Release，后者仍保留当前在线 Release，只是 Runtime 被禁止运行。

## 查看单个 App

在 App 卡片中点击「管理」，进入 `/hub/apps/:appId`。概览页显示：

- 应用状态
- 当前版本
- 可用版本数
- 最近变更时间
- 「版本与发布」入口
- 「运行资源」入口

你也可以在页面顶部打开、启动、停止或重启 App。如果页面提示「App 不存在或尚未被 App Host 发现」，先检查 App Host 是否连接到了包含该 App 的 `APP_DIST_DIR`。

## 使用 App 项目脚本构建并上传 Release

默认推荐使用 App 项目内置的 `deploy` 脚本。它会在 App 源码目录中完成构建、Release 打包、上传和提交审批，不需要手工写入 App Host 的 `app-dist/`。

从 Hub 的「开发与部署」弹窗复制完整命令，然后在本地 App 根目录中执行：

```bash
pnpm run deploy \
  --hub 'http://127.0.0.1:13001/hub' \
  --token 'nb3_app_...'
```

如果手动省略 `--token`，交互终端仍会提示输入 deploy token，并隐藏输入内容。

部署脚本会依次执行：

1. 读取 `package.json.name` 中的 App ID
2. 运行当前 App `package.json` 中的 `build` 脚本
3. 检查 `package.json` 有非空版本号，且存在 `dist/server/embedded.js`
4. 按稳定顺序计算 `dist/` 的 SHA-256
5. 生成 `app-release.json` 和 Release 专用的 `package.json`
6. 以 tar + gzip 流式上传不可变 Release
7. 使用同一个 App 部署令牌提交发布审批

默认 Release ID 是 `<package-version>-<artifact-hash-prefix>`，比如 `0.1.0-a1b2c3d4e5f6`。也可以显式指定一个新的 ID：

```bash
pnpm run deploy \
  --hub 'https://hub.example.com/hub' \
  --release-id '2026.08.26-1'
```

常用选项如下：

| 选项                | 用途                                       |
| ------------------- | ------------------------------------------ |
| `--hub <url>`       | 指定目标 Hub，当前必填，且必须包含挂载路径 |
| `--token <token>`   | 直接提供部署令牌，默认读取 `NB3_HUB_TOKEN` |
| `--release-id <id>` | 指定不可变 Release ID                      |
| `--no-build`        | 跳过 `build`，上传已有的 `dist/`           |
| `--dry-run`         | 只构建和校验，不连接 Hub                   |
| `--json`            | 输出单个机器可读的 JSON 结果               |

部署脚本只在 App 根目录工作，不支持 `--dir`，也不会从 `.nb3` 读取已保存的 Hub 地址。每次部署都要显式传 `--hub`。CI 中通过 `NB3_HUB_TOKEN` 或 `--token` 提供部署令牌。

部署命令成功只表示 Release 已上传且审批已提交。它不会绕过 Hub 的「批准并上线」门禁。命令输出中的发布工作台地址可以交给管理员继续处理。

### Release 产物和不可变规则

CLI 上传后，App Host 会验证压缩包，并把通过校验的 Release 保存为：

```text
app-dist/<appId>/releases/<releaseId>/
  app-release.json
  package.json
  dist/
    client/                 # 可选的客户端产物
    server/
      embedded.js
```

其中：

- `app-release.json` 描述 App、Release、版本、产物校验值和健康检查路径
- `package.json` 描述 App 名称、显示名称和版本
- `dist/server/embedded.js` 是 App Host 要加载的服务端入口
- `dist/client/` 保存可选的客户端构建结果
- CLI 不会把 `dist/` 中的 `.env` 或 `.env.*` 文件放进 Release
- Release 只能包含 `app-release.json`、`package.json` 和 `dist/`，不能包含符号链接或其他文件类型
- 同一个 `releaseId` 的内容必须保持不变；相同内容重复上传会返回 `unchanged`，不同内容复用同一个 ID 会返回 `APP_RELEASE_IMMUTABLE`

不要直接修改 App Host 已保存的 Release。代码或配置变化后，重新构建并使用新的 `releaseId`。

### App Runtime 的认证密钥

App Release 不需要携带 `AUTH_SECRET`。App Host 会在 App 第一次进入候选 Runtime 时，为每个 App 自动生成独立的高强度认证密钥，并通过 Runtime scope 注入 `AUTH_SECRET`。

密钥保存在 `<APP_DIST_DIR>/.app-host/runtime-secrets.json`，文件权限为 `0600`。同一个 App 在 App Host 重启或切换 Release 后会继续使用原密钥；不同 App 不共享密钥。这个值不会写进 `app-release.json`、Release `package.json`、管理 API 响应或 Hub 页面。

:::warning 注意

不要在 Release 中自行写入 `AUTH_SECRET`、数据库密码或其他运行凭证。备份和迁移 `APP_DIST_DIR` 时，需要把 `.app-host/runtime-secrets.json` 当作敏感状态保护；丢失该文件后，App Host 会生成新密钥，已有 Session 将失效。

:::

## 发布一个新版本

主导航中的「版本与发布」对应 `/hub/deliveries`，这是日常发布工作台。标准流程是：

```text
App 构建并上传 → 自动提交审批 → 管理员批准 → 上线前检查 → 切换在线版本
```

### 1. 上传并提交审批

开发者执行 `pnpm run deploy --hub ...` 后，Release 会进入「待审批」状态。一次命令同时完成上传和提交审批，不需要开发者再到 Hub 中点击「提交审批」。

管理员也可以在 Release 仓库中对尚未提交的候选版本点击「提交审批」。这种情况主要用于通过其他受控方式已经存在于 App Host 中的 Release。

### 2. 找到待发布版本

进入「版本与发布」，从「待处理」分类中选择目标 Release。右侧会显示：

- App 和版本号
- Release ID
- 生成时间和来源
- 当前在线版本
- 版本信息完整性
- 审批状态
- 健康检查状态
- 在线版本切换状态
- 失败原因

### 3. 批准并上线

管理员可以选择：

- 「拒绝发布」——记录驳回结果，不影响当前在线版本
- 「批准并上线」——启动候选版本并执行健康检查

批准后，App Host 会校验产物完整性、隔离启动候选版本并访问 manifest 声明的健康检查路径。只有检查通过，App Host 才会记录新的在线 Release 并切换流量。

如果检查失败，候选版本不会接管流量，原在线版本会继续运行。

### 4. 确认结果

发布成功后，Release 会进入「当前在线」。你可以：

1. 点击「打开 App」确认页面可以访问
2. 返回「应用中心」确认当前版本和运行状态
3. 在 App「版本与发布」中查看发布审计时间线
4. 检查是否存在资源异常或 Runtime 错误

## Release 状态

| 状态       | 含义                               | 可执行操作                   |
| ---------- | ---------------------------------- | ---------------------------- |
| 待提交审批 | 产物已经被发现，还没有发布申请     | 「提交审批」                 |
| 待审批     | 等待管理员决定                     | 「拒绝发布」或「批准并上线」 |
| 发布中     | 正在检查候选版本并切换流量         | 等待执行完成                 |
| 当前在线   | 正在对外提供服务                   | 「打开 App」                 |
| 已驳回     | 审批没有通过，版本未上线           | 查看驳回结果                 |
| 发布失败   | 完整性检查、健康检查或切换执行失败 | 查看失败原因                 |
| 历史版本   | 曾经上线或已经被新版本替换         | 「回滚到此版本」             |

页面中的「待我处理」目前统计所有待提交和待审批 Release，并不会按当前登录人过滤。

## 回滚到历史版本

在「版本与发布」中选择一个历史 Release，然后点击「回滚到此版本」。

回滚跟新版本上线使用同一套保护流程：

1. 提交回滚审批
2. 管理员批准
3. App Host 校验历史产物完整性
4. 启动候选 Runtime
5. 执行健康检查
6. 检查通过后切换在线版本

历史 Release 没有因为“曾经上线”而跳过检查。如果回滚目标无法通过健康检查，当前在线版本仍会继续运行。

## 使用单 App 发布页

从 App 管理页进入「版本与发布」，URL 为 `/hub/apps/:appId/deployments`。这个页面只展示当前 App，适合查看更完整的发布细节：

- 当前在线 Release
- Release 仓库
- 发布审批队列
- 发布审计时间线
- manifest、审批、隔离启动、健康检查和切流保护链

Release 行中的按钮含义如下：

| 按钮             | 含义                                |
| ---------------- | ----------------------------------- |
| 「已上线」       | 当前 Release 已经在线，按钮不可操作 |
| 「等待审批」     | 已经存在待审批申请，不能重复提交    |
| 「受控发布」     | 为候选 Release 提交发布审批         |
| 「回滚到此版本」 | 为历史 Release 提交回滚审批         |

相同 `releaseId` 的发布请求具有幂等保护。如果目标 Release 已经在线，不会因为重复操作而重启 App。

## 查看运行资源

在 App 管理页点击「运行资源」，进入 `/hub/apps/:appId/resources`。当前页面主要用于查看 Runtime 报告的状态，固定展示：

- 数据库
- 文件存储
- 缓存与队列
- 运行配置

资源状态含义如下：

| 状态       | 含义                                            |
| ---------- | ----------------------------------------------- |
| 暂不可配置 | 对应模块还没有开放配置能力，不代表 App 配置错误 |
| 待配置     | 模块可用，但 App 还没有选择资源                 |
| 应用中     | Runtime 正在应用最新配置                        |
| 已生效     | Runtime 已经确认资源生效                        |
| 需重启     | 配置已经更新，重启 App 后生效                   |
| 异常       | Runtime 应用或检查资源失败                      |

当前页面主要能显示主数据库名称、数据库类型或驱动、更新时间和错误信息。为了避免泄露凭证，Hub 不显示密码、文件路径或连接串。

:::warning 注意

「运行资源」当前是能力预览。页面中的配置入口均未开放，你不能在这里切换数据库、配置文件存储、配置缓存与队列或修改运行参数。

:::

## 查看 Hub 运行总览

`/hub/settings` 当前是只读的「平台运行总览」，主导航暂时没有入口。直接访问这个地址可以查看：

- 受管 App 数
- 已上线 App 数
- 不可变 Release 数
- 历史失败记录
- Hub 原生认证状态
- Hub 控制面数据状态
- App Host 连接状态
- 最近四次发布或回滚结果

这个页面不是设置编辑中心。`/hub/settings/storage` 没有注册到当前路由，旧的 App 设置或存储地址也会跳转到「运行资源」。

## 数据和安全边界

本地预览默认会写入以下数据。表格中的 `<Hub 目录>` 是 Hub 工程根目录，`<APP_DIST_DIR>` 是 App Host 实际读取的产物目录：

| 数据                         | 默认位置                                            | 可配置项                  |
| ---------------------------- | --------------------------------------------------- | ------------------------- |
| Hub 用户、账号和会话         | `<Hub 目录>/data/hub.sqlite`                        | `HUB_DATABASE_PATH`       |
| 发布和回滚记录               | `<Hub 目录>/data/release-management.json`           | `HUB_RELEASE_STORE_PATH`  |
| Hub 创建的 App 和 token 哈希 | `<Hub 目录>/data/release-management.json.apps`      | 跟随发布记录路径          |
| 页面记住的明文 deploy token  | 当前浏览器的 Local Storage                          | 按 Hub 地址和 App ID 隔离 |
| 审批与通知工作流             | `<Hub 目录>/data/release-management.json.workflow`  | 跟随发布记录路径          |
| App 生命周期操作             | `<Hub 目录>/data/release-management.json.lifecycle` | 跟随发布记录路径          |
| 设置原型与设置审计           | `<Hub 目录>/data/settings.json`                     | `HUB_SETTINGS_STORE_PATH` |
| App Host 在线 Release 状态   | `<APP_DIST_DIR>/.app-host/active-releases.json`     | 跟随 `APP_DIST_DIR`       |
| App Host 启停意图            | `<APP_DIST_DIR>/.app-host/app-lifecycle.json`       | 跟随 `APP_DIST_DIR`       |
| 每个 App 的 Runtime 密钥     | `<APP_DIST_DIR>/.app-host/runtime-secrets.json`     | 跟随 `APP_DIST_DIR`       |

需要注意这些边界：

- Release 目录是不可变产物，不能直接修改已经被识别或上线的 Release
- Hub 服务端只持久化 deploy token 的 SHA-256；Hub 页面会把命令所需的明文 token 保存在当前浏览器中
- App Host 重启时会重新校验在线 Release 的 SHA-256，产物被替换后会拒绝恢复
- App Host 自动生成并私密保存每个 App 的 Runtime 认证密钥，不从 Release 读取 `AUTH_SECRET`
- Hub 会阻止浏览器通过同源网关访问 App Host 的 `/__apps` 等控制接口
- 设置文件使用原子写入并创建为 `0600`；S3 凭证需要 `HUB_SETTINGS_ENCRYPTION_KEY` 加密，密钥丢失后无法恢复已有凭证
- 当前审批“通知已送达”只表示记录已写入本地工作流文件，没有发送站内信、邮件或飞书消息
- 当前本地 JSON 存储适合单实例预览，多实例生产部署需要共享数据库支持

## 自动化调用的限制

Hub 现在提供按 App 隔离的部署令牌，供 App 项目内置的部署脚本上传 Release 和提交发布审批。部署令牌不是通用服务账号：它不能创建 App、读取 Hub 控制面、批准或拒绝审批、发起回滚、操作 App 生命周期，也不能访问另一个 App。

创建 App、轮换部署令牌、批准或拒绝审批、回滚和生命周期控制仍要求有效的 Hub 管理员 Session。页面写操作会执行同源保护，Hub 客户端会发送 `X-Requested-With: NocoBase3`。

deploy token 轮换接口是 `POST /hub/api/apps/:appId/deploy-token`。它要求管理员 Session。当前浏览器没有保存目标 App 的 token 时，「开发与部署」弹窗会调用这个接口生成完整命令。轮换成功后，旧 token 会立即失效。

发布申请、回滚申请和 App 生命周期操作还必须提供最长 128 个字符的 `Idempotency-Key`。批准或拒绝审批不要求这个 Header，服务端会按审批 ID 防止冲突决定。

部署脚本使用的上传和提交审批路径分别是：

```text
PUT  /hub/api/apps/:appId/releases/:releaseId
POST /hub/api/release-management/apps/:appId/deployments
```

两次请求都使用 `Authorization: Bearer <deploy-token>`。上传必须使用 `Content-Type: application/vnd.nocobase.release+tar+gzip`，提交审批还必须带 `Idempotency-Key`。默认推荐直接使用 `pnpm run deploy --hub ...`，让部署脚本生成确定性的压缩包、校验值和幂等键。

不要把页面中展示的 `POST /deployments` 简写当成可直接调用的完整地址。管理员批准仍然只能使用管理员 Session，部署令牌不能实现无人值守上线。

## 常见问题

### Hub 页面可以打开，但没有 App

如果还没有创建过 App，点击「应用中心 / 创建应用」预留一个 App ID。如果已经创建过 App 却没有显示，依次确认：

1. 当前账号是否有读取发布控制面的管理员权限
2. Hub 的发布管理数据文件是否可读
3. App Host 进程是否正在运行
4. Hub 的 `APP_HOST_CONTROL_URL` 是否指向实际 App Host
5. Hub 和 App Host 的 `APP_HOST_CONTROL_TOKEN` 是否相同

### `pnpm run deploy` 成功，但 App 还没有上线

部署命令成功只表示 Release 已上传并提交审批。管理员还需要进入「版本与发布」，点击「批准并上线」，并等待完整性检查和健康检查通过。

### 部署提示 `APP_DEPLOY_TOKEN_INVALID` 或返回 `401`

deploy token 无效、没有完整传入或已经被轮换。回到目标 App 的「开发与部署」弹窗，复制当前浏览器保存的完整命令。如果 token 已在其他浏览器中被轮换，需要清除当前 Hub 页面的 Local Storage，再重新打开弹窗生成命令。不要使用 Hub 登录 token 或 App Host 控制 token 代替 deploy token。

### 部署提示 `APP_DEPLOY_TOKEN_FORBIDDEN` 或返回 `403`

当前部署令牌绑定的是另一个 App。检查本地 `package.json.name` 是否跟 Hub 中预留的 App ID 一致，并改用该 App 自己的部署令牌。

### 上传提示 `APP_RELEASE_UPLOAD_LIMIT_EXCEEDED`

压缩包大小、解压后大小或文件项数量超过 App Host 固定限制。先检查 `dist/` 是否意外包含缓存、Source Map 或其他大文件。当前版本没有开放调整这些上限的配置项。

### 上传提示 `APP_RELEASE_IMMUTABLE`

同一个 `releaseId` 已经存在，但内容不同。不要覆盖原 Release，使用新的 `--release-id` 重新部署。没有显式指定 ID 时，CLI 会根据版本号和产物哈希生成默认 ID。

### 点击发布后显示 `APP_READINESS_FAILED`

候选版本没有通过 manifest 中 `runtime.healthPath` 指定的健康检查。检查 App 日志、数据库连接、必要环境变量和健康检查路由。原在线版本不会被替换。

### 显示 `APP_RELEASE_INTEGRITY_FAILED`

Release 的实际内容跟 `app-release.json` 中的 `artifactSha256` 不一致。不要修改原 Release，重新构建并使用新的 `releaseId` 打包。

### App 显示「已停止」或返回 `APP_STOPPED`

这是主动停止后的预期行为。进入「应用中心」或 App「概览」，点击「启动 App」。单纯访问 App 地址不会自动解除停止状态。

### 页面提示 App Host 不可用

检查 App Host 进程、`APP_HOST_CONTROL_URL`、控制 token 和端口占用。如果 Hub 运行在容器中，`127.0.0.1` 指向 Hub 容器本身，需要换成容器网络中的 App Host 地址。

### 显示 `APP_HOST_UNAUTHORIZED`

Hub 和 App Host 使用的 `APP_HOST_CONTROL_TOKEN` 不一致。修改两个进程的运行环境，让它们使用同一个 token，然后重启服务。不要通过浏览器直接访问 App Host 的控制接口。

### 显示 `RELEASE_TARGET_NOT_FOUND`

App Host 尚未找到目标 Release。确认 CLI 的上传步骤已经成功，Hub 和 App Host 的控制连接正常，并检查 App Host 是否读取了正确的 `APP_DIST_DIR`。

### 登录后操作返回 `403`

当前账号不是 Hub 管理员。检查账号邮箱是否命中 `HUB_ADMIN_EMAILS`。如果没有配置该变量，则只有最早注册的账号是管理员。

### 生产启动提示缺少 `AUTH_SECRET` 或 `NOCOBASE_AUTH_URL`

这两个配置在生产环境中是必填项。为 Hub 生成高强度 `AUTH_SECRET`，并把 `NOCOBASE_AUTH_URL` 配成外部可访问的 Hub 认证地址，比如 `https://hub.example.com/hub/api/auth`。

### `pnpm run deploy` 提示缺少构建脚本或 `embedded.js`

默认部署要求 `package.json` 包含 `build` 脚本，并在构建后生成 `dist/server/embedded.js`。先修复 App 的构建配置；如果已经有完整的 `dist/`，可以使用 `--no-build` 跳过构建，不过 CLI 仍会检查服务端入口。

### `/api/release-management` 返回错误或被当成 App 路径

Hub 挂载在 `/hub` 时，完整 API 前缀是 `/hub/api/release-management`。缺少 `/hub` 的请求可能落到 App 网关，被当成名为 `api` 的 App 路径。

## 发布前检查清单

- App 构建和针对性测试已经通过
- Hub 已创建目标 App，本地 `package.json.name` 跟 App ID 一致
- 部署命令来自目标 App 的「开发与部署」弹窗，并包含正确的 `--token`
- 使用了新的 `releaseId`，或确认默认的版本号 + 产物哈希 ID 符合预期
- `package.json` 包含版本号和 `build` 脚本，构建结果包含 `dist/server/embedded.js`
- `pnpm run deploy --hub <hub-url> --dry-run` 已经通过，或已完成等价的本地构建检查
- App Host 读取了正确的 `APP_DIST_DIR`
- Hub 和 App Host 使用相同的控制 token
- App Host 的上传大小和文件项限制能容纳当前 Release
- 候选版本所需的数据库、缓存和其他外部依赖可用
- 当前在线版本和预期回滚目标已经确认
- 发布后已经检查 App 页面、健康状态和发布审计记录
