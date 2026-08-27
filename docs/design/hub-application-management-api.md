---
title: Hub 应用管理 API 设计
description: NocoBase 3 Hub 的 APP、Release、Deployment、Runtime、权限和审计 API 设计。
keywords: NocoBase 3,Hub,Application Management,API,Release,Deployment,Runtime
---

# Hub 应用管理 API 设计

Hub 是 NocoBase 3 的 APP 管理入口。开发者在本地创建和修改源码，构建后把产物上传到 Hub。Hub 保存不可变的 Release，并负责部署、回滚、Runtime 控制、成员权限和审计。

```text
本地 APP 源码 → 本地构建 → Release 产物 → Hub
                                      ↓
                               Deployment
                                      ↓
                              App Host Runtime
```

Hub 不保存 APP 源码，不提供源码下载、同步或 Git 服务。`Release` 只描述可以运行的构建产物，不记录源码位置或源码版本。

## API 基础约定

### 根路径

管理 API 的根路径为：

```text
<APP_BASE_PATH>/api
```

默认安装下为 `/hub/api`。当前契约不增加 `/v1` 版本段。

浏览器管理界面和本地 APP scripts 使用同一组 API：

| 调用方                          | 认证方式            | 主要用途                     |
| ------------------------------- | ------------------- | ---------------------------- |
| 浏览器                          | Hub Session Cookie  | 页面管理操作                 |
| 本地 APP scripts / Coding Agent | Bearer access token | 上传 Release、部署和查询状态 |

### 响应格式

JSON 成功响应使用统一包装：

```json
{
  "data": {},
  "meta": {},
  "requestId": "2f178b0e-f4c0-44d4-a29e-e55788ff1234"
}
```

列表接口把分页信息放在 `meta` 中：

```json
{
  "data": [],
  "meta": {
    "total": 36,
    "limit": 20,
    "offset": 0
  },
  "requestId": "2f178b0e-f4c0-44d4-a29e-e55788ff1234"
}
```

JSON 错误响应使用以下格式：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "name is required.",
    "retryable": false,
    "issues": [
      {
        "path": "name",
        "code": "required",
        "message": "name is required."
      }
    ]
  },
  "requestId": "2f178b0e-f4c0-44d4-a29e-e55788ff1234"
}
```

常用状态码：

| 状态码 | 含义                                      |
| ------ | ----------------------------------------- |
| `200`  | 查询或幂等重放成功                        |
| `201`  | 资源创建成功                              |
| `202`  | 异步操作已接受                            |
| `204`  | 二进制内容上传成功，无响应体              |
| `400`  | 请求头或请求格式错误                      |
| `401`  | 未认证或凭证已失效                        |
| `403`  | 缺少权限、scope 或来源校验失败            |
| `404`  | 资源不存在，或调用方无权知道资源存在      |
| `409`  | 版本、状态或并发操作冲突                  |
| `411`  | 上传没有合法的 `Content-Length`           |
| `413`  | 上传文件超过限制                          |
| `415`  | `Content-Type` 或压缩格式不支持           |
| `422`  | 字段校验失败                              |
| `428`  | 缺少 `If-Match`                           |
| `429`  | 请求过于频繁                              |
| `503`  | Release 存储、Runtime 或 Agent 认证未配置 |

服务端生成的 `requestId` 会出现在成功和失败响应中。调用方也可以发送 `X-Request-Id`，方便把 CLI 输出、审计记录和服务端日志关联起来。

### 分页、筛选和排序

列表接口统一使用 `limit/offset` 分页：

- `limit` 默认为 `20`，范围为 `1` 到 `100`
- `offset` 默认为 `0`，必须是非负整数
- `query` 用于当前资源支持的文本搜索
- `sort` 使用字段名表示升序，前缀 `-` 表示降序，比如 `-createdAt`
- 可重复的筛选参数可以出现多次，比如 `status=failed&status=cancelled`

CSV 导出不接受 `limit/offset`。审计和部署记录每次最多导出 `10000` 条，并带有请求频率限制。

### 幂等与并发控制

创建类和高风险操作使用 `Idempotency-Key`。它必须是 1 到 255 个可打印 ASCII 字符。相同调用方、端点、资源范围和请求内容重复提交时，Hub 返回原结果，并在 `meta.idempotent` 中标记幂等重放。

以下接口要求 `Idempotency-Key`：

- `POST /setup/default-app/retry`
- `POST /apps`
- `POST /invitations`
- `POST /apps/:id/release-uploads`
- `POST /apps/:id/deployments`
- `POST /apps/:id/runtime/restart`
- `POST /apps/:id/runtime-secret/rotate`

可编辑资源使用 ETag 乐观锁。先读取资源响应中的 `ETag: "rev-<revision>"`，修改时再发送：

```http
If-Match: "rev-3"
```

APP 信息、归档/恢复、成员状态、成员权限、APP 权限和 Hub 设置都使用这个机制。revision 已变化时返回 `409`，缺少 `If-Match` 时返回 `428`。

### Mutation 请求安全

除 Release 二进制上传外，写请求使用：

```http
Content-Type: application/json
```

浏览器写请求必须来自 Hub 的可信 Origin。Bearer 请求通过 access token 认证，不依赖 Cookie。Release 二进制上传使用 `application/gzip` 或 `application/x-gzip`，并必须发送准确的 `Content-Length`。

## 认证与当前身份

### 首次设置

| 方法   | 路径                       | 认证               | 说明                            |
| ------ | -------------------------- | ------------------ | ------------------------------- |
| `GET`  | `/healthz`                 | 无                 | Hub 和本地 Host 可用性          |
| `GET`  | `/setup/status`            | 无                 | 首次设置和默认 APP 准备状态     |
| `POST` | `/setup/owner`             | 无，仅首次设置阶段 | 创建第一个 Owner 并返回 Session |
| `POST` | `/setup/default-app/retry` | Session            | 重试可恢复的默认 APP 初始化失败 |

`POST /setup/owner` 接收 `email`、`password`、`name` 和可选的 `username`。Owner 创建完成后，公开注册入口保持关闭。

默认 APP 状态为 `preparing`、`ready` 或 `failed`。初始化会准备系统默认 APP、默认模板初始 Release 和首次 Deployment。重试接口在已有状态为 `ready` 时直接返回幂等成功。

### 登录与 Session

`GET/POST /auth/*` 由认证模块处理，包括登录、登出和 Session。Hub 会拒绝公开的 sign-up 路由，成员只能由 Owner/Admin 邀请后创建账户。

当前调用方信息通过以下接口读取：

```http
GET /me
```

浏览器响应包含 `user`、全局 `roles` 和 capability。Agent 响应另外包含当前 credential、granted scopes、APP 范围，以及 scope 与成员权限相交后的 capability。

## Agent Device Authorization

本地 APP scripts 使用 Device Authorization 获取 access token。token 由本地凭证管理器保存，不写入 APP 项目配置。

### Agent scopes

| Scope                  | 对应能力                 |
| ---------------------- | ------------------------ |
| `profile`              | 读取当前身份             |
| `apps:create`          | 创建 APP                 |
| `apps:read`            | 读取有权访问的 APP       |
| `releases:read`        | 读取 Release             |
| `releases:publish`     | 上传并创建 Release       |
| `deployments:read`     | 读取 Deployment          |
| `deployments:deploy`   | 普通部署                 |
| `deployments:rollback` | 回滚                     |
| `deployments:redeploy` | 重新部署当前 Release     |
| `runtime:read`         | 读取 Runtime 状态        |
| `runtime:control`      | 启动、停止和重启 Runtime |

Agent 还要选择 APP 范围：

```json
{ "mode": "selected", "applicationIds": ["app-id"] }
```

或：

```json
{ "mode": "all-authorized" }
```

最终授权始终取「请求的 scope」「批准人的 capability」「批准的 APP 范围」三者交集。

### 端点

| 方法     | 路径                                | 说明                                       |
| -------- | ----------------------------------- | ------------------------------------------ |
| `POST`   | `/agent-auth/device`                | 创建 device authorization                  |
| `POST`   | `/agent-auth/token`                 | 用 device code 或 refresh token 换取 token |
| `POST`   | `/agent-auth/revoke`                | 使用 refresh token 撤销凭证                |
| `POST`   | `/agent-authorizations/resolve`     | 浏览器根据 user code 读取待批准请求        |
| `POST`   | `/agent-authorizations/:id/approve` | 批准 scope 和 APP 范围                     |
| `POST`   | `/agent-authorizations/:id/deny`    | 拒绝请求                                   |
| `GET`    | `/agent-credentials`                | 查看当前用户授权过的 Agent 凭证            |
| `DELETE` | `/agent-credentials/:id`            | 撤销指定 Agent 凭证                        |

创建 device authorization 的请求示例：

```json
{
  "clientId": "nocobase-app-scripts",
  "clientName": "Alice's MacBook",
  "scopes": [
    "profile",
    "apps:read",
    "releases:read",
    "releases:publish",
    "deployments:read",
    "deployments:deploy"
  ],
  "applicationScope": {
    "mode": "selected",
    "applicationIds": ["app-id"]
  }
}
```

token 响应使用 `Cache-Control: no-store`，包含 access token、refresh token、过期时间、scope 和 APP 范围。

## 权限模型

Hub 使用内置角色，不提供自定义角色 CRUD：

| 角色        | 范围       | 主要能力                                                       |
| ----------- | ---------- | -------------------------------------------------------------- |
| `owner`     | 全局       | 所有能力；只有 Owner 可以授予或转移 Owner                      |
| `admin`     | 全局       | APP、Release、Deployment、Runtime、成员、权限、审计和设置管理  |
| `developer` | 全局或 APP | 读取 APP，创建/读取 Release，读取 Deployment、Runtime 和审计   |
| `deployer`  | 全局或 APP | 读取 APP/Release，部署、回滚、重新部署，控制 Runtime，读取审计 |
| `viewer`    | 全局或 APP | 只读 APP、Release、Deployment、Runtime 和审计                  |

权限资源与 action：

| 资源                | Actions                                          |
| ------------------- | ------------------------------------------------ |
| `hub.app`           | `create`, `read`, `update`, `archive`, `restore` |
| `hub.release`       | `create`, `read`, `update`                       |
| `hub.deployment`    | `read`, `deploy`, `rollback`, `redeploy`         |
| `hub.runtime`       | `read`, `control`                                |
| `hub.runtimeSecret` | `read`, `rotate`                                 |
| `hub.auditLog`      | `read`, `export`                                 |
| `hub.member`        | `create`, `read`, `update`, `delete`             |
| `hub.permission`    | `read`, `assign`                                 |
| `hub.setting`       | `read`, `update`                                 |

`GET /roles` 返回角色范围、国际化说明 key 和分组后的 capability。无权访问某个 APP 的调用方读取 APP、Release、Deployment 或审计记录时，接口返回 `404`，避免暴露资源是否存在。

## APP 管理

### 数据结构

```json
{
  "id": "app-id",
  "slug": "sales",
  "name": "Sales",
  "description": "Sales application",
  "status": "active",
  "isDefault": false,
  "revision": 3,
  "defaultEnvironmentId": "default",
  "latestRelease": {
    "id": "release-id",
    "version": "1.4.0",
    "createdAt": "2026-08-27T08:00:00.000Z"
  },
  "activeRelease": {
    "id": "release-id",
    "version": "1.3.0",
    "createdAt": "2026-08-26T08:00:00.000Z"
  },
  "runtime": {},
  "links": {
    "self": "/hub/api/apps/app-id",
    "open": "https://apps.example.com/sales/"
  },
  "createdBy": "user-id",
  "createdAt": "2026-08-25T08:00:00.000Z",
  "updatedAt": "2026-08-27T08:00:00.000Z"
}
```

`latestRelease` 表示最近创建的 Release，`activeRelease` 表示当前部署成功的 Release，两者可以不同。调用方缺少 Release 或 Runtime 读取权限时，对应嵌套字段不会出现在响应中。

只有 APP 处于 `active`、期望状态为 `running` 且已有 active Release 时，`links.open` 才返回可访问地址；其他状态为 `null`。

### 端点

| 方法    | 路径                | 能力              | 说明                              |
| ------- | ------------------- | ----------------- | --------------------------------- |
| `GET`   | `/apps`             | `hub.app:read`    | APP 列表                          |
| `POST`  | `/apps`             | `hub.app:create`  | 创建 APP                          |
| `GET`   | `/apps/:id`         | `hub.app:read`    | APP 详情                          |
| `PATCH` | `/apps/:id`         | `hub.app:update`  | 修改名称和描述                    |
| `POST`  | `/apps/:id/archive` | `hub.app:archive` | 归档并从 Host 注销 APP            |
| `POST`  | `/apps/:id/restore` | `hub.app:restore` | 恢复 APP 及其 active Release 配置 |

列表支持：

- `query`
- 可重复的 `status=active|archived`
- `sort=name|-name|slug|-slug|createdAt|-createdAt|updatedAt|-updatedAt`
- `limit` 和 `offset`

创建请求只接受：

```json
{
  "slug": "sales",
  "name": "Sales",
  "description": "Sales application"
}
```

`slug` 全局唯一，且不能使用 `api`、`auth`、`hub`、`__apps`、`__health` 或 `default`。Hub 会同时创建 APP 独立的 Runtime Secret，并从默认模板产物创建一个初始 Release。因此新 APP 创建完成后可以直接选择这个 Release 部署。

`PATCH /apps/:id` 只接受 `name` 和 `description`。归档与恢复的请求体均为 `{}`，并要求 `If-Match`。

Hub 不提供永久删除 APP 的 API。归档不会删除 Release、Deployment 或审计记录。

## Release 与产物上传

### Release 数据结构

```json
{
  "id": "release-id",
  "applicationId": "app-id",
  "version": "1.4.0",
  "checksum": "sha256:...",
  "manifest": {
    "schemaVersion": 1,
    "basePath": "/sales",
    "client": { "rootDir": "dist/client" },
    "server": {
      "entrypoint": "dist/server/embedded.js",
      "healthPath": "/api/healthz"
    }
  },
  "sizeBytes": 24100542,
  "verificationStatus": "verified",
  "createdBy": "user-id",
  "createdAt": "2026-08-27T08:00:00.000Z",
  "retention": {
    "pinned": false,
    "pinnedBy": null,
    "pinnedAt": null
  }
}
```

Release 是不可变资源。同一个 APP 内 `version` 唯一。更新只发生在 retention 元数据上，不能替换已经验证的产物内容。

### 上传流程

发布由三个步骤组成：

```text
创建上传会话 → PUT tar.gz → 完成并验证 → Release
```

#### 1. 创建上传会话

```http
POST /apps/:id/release-uploads
Idempotency-Key: <operation-id>
Content-Type: application/json
```

```json
{
  "version": "1.4.0",
  "checksum": "sha256:<解压后产物摘要>",
  "sizeBytes": 24100542,
  "archiveChecksum": "sha256:<tar.gz 摘要>",
  "archiveSizeBytes": 7123456,
  "archiveFormat": "tar.gz",
  "manifest": {
    "schemaVersion": 1,
    "basePath": "/sales",
    "client": { "rootDir": "dist/client" },
    "server": {
      "entrypoint": "dist/server/embedded.js",
      "healthPath": "/api/healthz"
    }
  }
}
```

响应包含上传状态和服务端生成的上传地址：

```json
{
  "id": "upload-id",
  "applicationId": "app-id",
  "status": "created",
  "version": "1.4.0",
  "expiresAt": "2026-08-27T10:00:00.000Z",
  "failure": null,
  "release": null,
  "upload": {
    "method": "PUT",
    "url": "https://hub.example.com/hub/api/release-uploads/upload-id/content",
    "auth": { "mode": "hub-bearer" },
    "headers": { "Content-Type": "application/gzip" }
  }
}
```

#### 2. 上传二进制内容

```http
PUT /release-uploads/:uploadId/content
Authorization: Bearer <access-token>
Content-Type: application/gzip
Content-Length: <archive-size>

<tar.gz bytes>
```

成功返回 `204`。服务端拒绝路径穿越、符号链接、特殊文件、文件数量超限、解压尺寸超限、声明大小不一致和 checksum 不一致的包。

#### 3. 完成验证

```http
POST /release-uploads/:uploadId/complete
Content-Type: application/json

{}
```

验证尚未结束时返回 `202`。调用方通过 `GET /release-uploads/:uploadId` 轮询，直到状态为 `completed` 或 `failed`。成功时 `release` 包含新建的 verified Release。

上传状态为：

```text
created → uploaded → verifying → completed
                              ↘ failed
created/uploaded → cancelled
created/uploaded → expired
```

上传会话还支持：

| 方法     | 路径                         | 说明             |
| -------- | ---------------------------- | ---------------- |
| `GET`    | `/release-uploads/:uploadId` | 查询上传状态     |
| `DELETE` | `/release-uploads/:uploadId` | 取消未完成的上传 |

### Release 查询与保留

| 方法   | 路径                                  | 能力                 | 说明                   |
| ------ | ------------------------------------- | -------------------- | ---------------------- |
| `GET`  | `/apps/:id/releases`                  | `hub.release:read`   | Release 列表           |
| `GET`  | `/apps/:id/releases/:releaseId`       | `hub.release:read`   | Release 详情           |
| `POST` | `/apps/:id/releases/:releaseId/pin`   | `hub.release:update` | 固定 Release，避免清理 |
| `POST` | `/apps/:id/releases/:releaseId/unpin` | `hub.release:update` | 取消固定               |

列表支持 `query`、`sort=version|-version|createdAt|-createdAt`、`limit` 和 `offset`。

## Deployment

Deployment 表示一次对不可变 Release 的切换操作。部署、回滚和重新部署都创建新的 Deployment 记录，不会修改历史记录。

### 创建 Deployment

```http
POST /apps/:id/deployments
Idempotency-Key: <operation-id>
Content-Type: application/json
```

```json
{
  "targetReleaseId": "release-id",
  "type": "deploy"
}
```

`type` 可以是：

| 类型       | 含义                           |
| ---------- | ------------------------------ |
| `deploy`   | 部署指定 Release               |
| `rollback` | 回滚到以前成功使用过的 Release |
| `redeploy` | 重新部署当前 active Release    |

新请求通常返回 `202`。Deployment 在后台执行，调用方轮询详情，或者先通过列表查询当前状态。

```json
{
  "id": "deployment-id",
  "applicationId": "app-id",
  "environmentId": "default",
  "targetReleaseId": "release-id",
  "previousReleaseId": "previous-release-id",
  "type": "deploy",
  "status": "activating",
  "requestedBy": "user-id",
  "startedAt": "2026-08-27T08:01:00.000Z",
  "finishedAt": null,
  "failure": null,
  "createdAt": "2026-08-27T08:01:00.000Z"
}
```

状态包括：

```text
queued → preparing → activating → checking → switching → draining → succeeded
                                                                   ↘ failed
                                                                   ↘ cancelled
```

Host 返回前会完成候选 Runtime 的 readiness 检查和切换。成功后，Hub 才更新 APP 的 active Release。失败时保留原 active Release，并在 `failure` 中返回稳定错误码和公开错误信息。

### 查询与导出

| 方法  | 路径                      | 说明                            |
| ----- | ------------------------- | ------------------------------- |
| `GET` | `/apps/:id/deployments`   | 指定 APP 的 Deployment 列表     |
| `GET` | `/deployments`            | 当前调用方可见的全部 Deployment |
| `GET` | `/deployments/:id`        | Deployment 详情                 |
| `GET` | `/deployments/:id/events` | 按 sequence 排序的阶段事件      |
| `GET` | `/deployments.csv`        | 按当前筛选导出 CSV              |

列表和 CSV 支持：

- `applicationId`（仅全局列表）
- 可重复的 `status`
- 可重复的 `type`
- `requestedBy`
- `from` 和 `to`（ISO 8601 时间）
- `query`
- `sort=createdAt|-createdAt|startedAt|-startedAt|finishedAt|-finishedAt`
- `limit` 和 `offset`（CSV 除外）

同一 APP 同一时间只执行一个 Deployment 或 Runtime 控制操作。冲突返回可重试的 `409`。

## Runtime

Runtime 是 active Release 的运行实例，与 Release 和 Deployment 分开建模。APP 已配置为运行，但当前没有实例时，状态可以是 `idle`；停止状态为 `stopped`。

```json
{
  "applicationId": "app-id",
  "environmentId": "default",
  "runtimeId": "sales:42",
  "state": "running",
  "health": "healthy",
  "releaseId": "release-id",
  "url": "https://apps.example.com/sales/",
  "startedAt": "2026-08-27T08:01:00.000Z",
  "lastSeenAt": "2026-08-27T08:05:00.000Z",
  "lastCheckedAt": "2026-08-27T08:05:00.000Z",
  "activeRequests": 2,
  "failure": null
}
```

| 方法   | 路径                        | 能力                  | 说明                     |
| ------ | --------------------------- | --------------------- | ------------------------ |
| `GET`  | `/apps/:id/runtime`         | `hub.runtime:read`    | Runtime 当前状态         |
| `POST` | `/apps/:id/runtime/start`   | `hub.runtime:control` | 启动 active Release      |
| `POST` | `/apps/:id/runtime/stop`    | `hub.runtime:control` | 停止服务并禁止 APP 访问  |
| `POST` | `/apps/:id/runtime/restart` | `hub.runtime:control` | 使用 active Release 重启 |

三个写接口的请求体都是 `{}`。`restart` 要求 `Idempotency-Key`。`start` 和 `stop` 在目标状态已经满足时返回 `meta.idempotent: true`。

停止表示服务不可访问。Hub 会保留 APP、Release 和 Deployment 数据，后续可以再次启动。普通的空闲实例回收不改变期望状态，仍允许下一次访问重新激活。

### 每个 APP 的 Runtime Secret

每个 APP 使用独立的 Runtime Secret。公开 API 只返回状态和版本，永远不返回 secret 明文：

```json
{
  "configured": true,
  "version": 2,
  "createdAt": "2026-08-25T08:00:00.000Z",
  "rotatedAt": "2026-08-27T08:00:00.000Z",
  "lastInjectedAt": "2026-08-27T08:01:00.000Z"
}
```

| 方法   | 路径                              | 能力                       | 说明                         |
| ------ | --------------------------------- | -------------------------- | ---------------------------- |
| `GET`  | `/apps/:id/runtime-secret`        | `hub.runtimeSecret:read`   | 读取 Secret 摘要             |
| `POST` | `/apps/:id/runtime-secret/rotate` | `hub.runtimeSecret:rotate` | 生成新版本并安全注入 Runtime |

轮换请求体为 `{}`，并要求 `Idempotency-Key`。如果 APP 正在运行，Hub 会用新 Secret 重启 Runtime；如果 APP 未运行，则更新下次启动使用的私有配置。轮换失败不会返回 secret，也会写入审计记录。

## 成员、邀请和 APP 权限

### 邀请成员

| 方法     | 路径                             | 认证                | 说明                   |
| -------- | -------------------------------- | ------------------- | ---------------------- |
| `GET`    | `/invitations`                   | `hub.member:read`   | 邀请列表               |
| `POST`   | `/invitations`                   | `hub.member:create` | 创建邀请               |
| `DELETE` | `/invitations/:id`               | `hub.member:delete` | 撤销邀请               |
| `POST`   | `/invitation-acceptance/resolve` | 无                  | 用 token 查看邀请摘要  |
| `POST`   | `/invitation-acceptance/accept`  | 无                  | 创建成员账户并接受邀请 |

创建邀请请求示例：

```json
{
  "email": "alice@example.com",
  "expiresInDays": 7,
  "access": {
    "globalRoles": [],
    "applications": [
      {
        "applicationId": "app-id",
        "roles": ["developer"]
      }
    ]
  }
}
```

只有首次创建成功的响应会包含 `inviteUrl`；幂等重放不会再次暴露 token。`expiresInDays` 的范围为 `1` 到 `30`。邀请状态为 `pending`、`accepted`、`expired` 或 `revoked`。列表支持 `query`、`status`、`sort=createdAt|-createdAt|expiresAt|-expiresAt` 和分页。

接受邀请时提交 `token`、`name`、`username` 和 `password`。账户、角色和 APP 权限在同一事务中创建，邀请同时变为已接受。

### 成员

| 方法    | 路径           | 说明                        |
| ------- | -------------- | --------------------------- |
| `GET`   | `/members`     | 成员列表                    |
| `GET`   | `/members/:id` | 成员详情和 ETag             |
| `PATCH` | `/members/:id` | 设置 `active` 或 `disabled` |

成员列表支持 `query`、`status`、`role`、`applicationId`、`sort=name|-name|createdAt|-createdAt|lastActiveAt|-lastActiveAt` 和分页。最后一个有效 Owner 不能被禁用。

### 权限分配

| 方法  | 路径                         | 说明                        |
| ----- | ---------------------------- | --------------------------- |
| `GET` | `/roles`                     | 内置角色和 capability       |
| `GET` | `/members/:id/access`        | 从成员视角读取全部权限      |
| `PUT` | `/members/:id/access`        | 原子替换成员的全部权限      |
| `GET` | `/apps/:id/access`           | 从 APP 视角分页读取成员权限 |
| `PUT` | `/apps/:id/access/:memberId` | 替换成员在指定 APP 的角色   |

替换成员全部权限的请求：

```json
{
  "globalRoles": [],
  "applications": [
    {
      "applicationId": "app-id",
      "roles": ["developer", "deployer"]
    }
  ]
}
```

APP 级角色只允许 `developer`、`deployer` 和 `viewer`。Owner/Admin 是全局角色。权限读写使用 revision ETag，避免两个管理员互相覆盖修改。

## 审计日志

审计日志记录浏览器、Agent 和系统触发的管理操作。Release 发布记录产物和版本信息，Deployment 记录目标 Release，凭证授权记录 scope 与 APP 范围，但不会记录密码、access token、refresh token、邀请 token 或 Runtime Secret。

```json
{
  "id": "audit-id",
  "actorId": "user-id",
  "applicationId": "app-id",
  "action": "deployment.requested",
  "resource": "deployment",
  "resourceId": "deployment-id",
  "result": "success",
  "source": "agent",
  "client": {
    "credentialId": "credential-id",
    "name": "Alice's MacBook",
    "ip": null
  },
  "failureCode": null,
  "details": {
    "type": "deploy",
    "targetReleaseId": "release-id"
  },
  "requestId": "2f178b0e-f4c0-44d4-a29e-e55788ff1234",
  "createdAt": "2026-08-27T08:01:00.000Z"
}
```

| 方法  | 路径              | 说明                 |
| ----- | ----------------- | -------------------- |
| `GET` | `/audit-logs`     | 权限裁剪后的审计列表 |
| `GET` | `/audit-logs/:id` | 审计详情             |
| `GET` | `/audit-logs.csv` | 按当前筛选导出 CSV   |

列表和 CSV 支持 `applicationId`、`actorId`、可重复的 `action`、`resource`、`resourceId`、`result=success|failure|denied`、`source=web|agent|system`、`query`、`from`、`to` 和 `sort=createdAt|-createdAt`。列表另外支持分页。

## 设置、系统信息和存储

### Hub 设置

| 方法    | 路径        | 说明                          |
| ------- | ----------- | ----------------------------- |
| `GET`   | `/settings` | 读取设置、只读部署信息和 ETag |
| `PATCH` | `/settings` | 使用 `If-Match` 更新设置      |

设置结构：

```json
{
  "releaseRetention": {
    "automaticCleanupEnabled": false,
    "keepPerApplication": 10,
    "minimumAgeDays": 30
  },
  "audit": {
    "recordDeniedMutations": true,
    "retentionDays": 365
  },
  "confirmation": {
    "rollback": true,
    "archiveApplication": true,
    "rotateRuntimeSecret": true
  },
  "revision": 4,
  "updatedAt": "2026-08-27T08:00:00.000Z",
  "readOnly": {
    "releaseStorage": "local",
    "hostMode": "in-process",
    "environmentCount": 1
  }
}
```

`readOnly` 只在读取响应中出现，不能通过 PATCH 修改。当前 `automaticCleanupEnabled` 固定为 `false`，Hub 只计算清理计划，不会自动删除 Release。确认设置用于管理界面的二次确认行为，不绕过服务端权限和状态校验。

### 系统信息

```http
GET /system-info
```

返回 Hub 标识、Node.js 版本、数据库类型、Host 模式、Host 可用性、公开 base path、启动时间和配置警告。

### 存储使用情况

```http
GET /storage
```

返回文件系统容量、已用空间、可用空间、Hub 已知用量和测量时间。分类包括：

| key                    | 内容                            | 可回收量                            |
| ---------------------- | ------------------------------- | ----------------------------------- |
| `releaseArtifacts`     | 已完成的不可变 Release 产物     | `0`，是否可清理由 cleanup plan 判断 |
| `temporaryUploads`     | 未完成上传和临时文件            | 当前全部大小                        |
| `runtimeData`          | 本地 Runtime 运行数据           | `0`                                 |
| `logs`                 | Hub 管理的日志目录              | `0`                                 |
| `otherFilesystemUsage` | 同一文件系统中 Hub 未管理的用量 | `null`                              |

```http
GET /storage/cleanup-plan?limit=20&offset=0
```

该接口只生成清理计划，不执行删除。响应列出超出保留窗口的 Release 候选、预计可回收字节数，以及因为 active Release、Deployment 引用或 pin 而受到保护的数量。

## 本地 APP scripts 工作流

APP 源码一直留在开发者本地。`pnpm create @nocobase/app` 从 npm 或本地模板创建项目，不连接 Hub，也不从 Hub 拉取源码。

模板提供以下 Hub 相关 scripts：

| 命令                             | 作用                                                                      |
| -------------------------------- | ------------------------------------------------------------------------- |
| `pnpm run hub:login --hub <url>` | 完成 Device Authorization 并保存本机凭证                                  |
| `pnpm run hub:logout`            | 撤销或清除本机凭证                                                        |
| `pnpm run release`               | 构建本地 APP，上传产物并创建 verified Release                             |
| `pnpm run deploy`                | 默认构建下一个 patch Release 并部署，也可部署已有 Release、回滚或重新部署 |
| `pnpm run status`                | 查看 APP、Release、Deployment、Runtime 和访问地址                         |

首次发布到已有 APP：

```bash
pnpm run release --hub https://hub.example.com/hub --app sales --bump patch
pnpm run deploy --release 0.0.2
```

首次发布时省略 `--app`，script 会在 Hub 创建一个新 APP，再把 Hub URL、APP ID 和 slug 写入项目内的 `.nocobase/config.json`。如果 Hub 已有同名 APP，则必须显式传入 `--app`，不会静默绑定。

```bash
pnpm run release --hub https://hub.example.com/hub --bump patch
```

已绑定项目不能通过命令参数静默切换 Hub 或 APP。要发布到另一个 APP，需要先明确处理本地关联配置。

没有 Release selector 的 `pnpm run deploy` 会执行：

```text
本地 build → 打包 tar.gz → 创建上传会话 → 上传并验证
           → 创建 Release → 创建 Deployment → 等待完成
```

部署已有 Release、回滚和重新部署：

```bash
pnpm run deploy --release 1.4.0 --non-interactive
pnpm run deploy --release 1.3.0 --rollback --yes --non-interactive
pnpm run deploy --redeploy --non-interactive
```

`--dry-run` 只校验并输出执行计划，不创建远端资源。`--json` 只向 stdout 输出一个 JSON 结果，适合 Coding Agent。`--operation-id` 用于恢复本地 operation journal 中未完成的发布或部署操作。

至此，源码开发和产物管理的边界保持清晰：开发者负责本地源码与构建，Hub 负责从 verified Release 开始的部署和运行生命周期。

## 相关链接

- [APP 管理脚本](../cli/nb3-app.md) — 在本地构建产物、创建 Release、部署和查看状态
- [连接 Hub](../cli/nb3-hub.md) — 使用 Device Authorization 登录 Hub
- [Quickstart](../quickstart.md) — 创建 APP 并完成首次发布和部署
