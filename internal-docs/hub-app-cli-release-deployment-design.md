---
title: Hub App CLI 发布链路与 Release 部署
description: 打通本地终端或 CI 从 App 构建、上传 Release 到手动或自动 Deployment 的完整链路。
---

# Hub App CLI 发布链路与 Release 部署

## 1. 背景

Hub 已经支持 Release 上传、Deploy 和 Rollback，App 模板也已经支持：

```bash
pnpm build --tar
```

构建后生成 `storage/dist.tar.gz`，其中包含部署所需的 `dist/` 和
`config.example.yml`。

当前发布流程主要依赖 Hub 管理页面：

```text
本地构建
  -> 手动打开 Hub 页面上传
  -> 在页面选择 Release
  -> 手动触发 Deploy
```

本地终端和 CI 还不能通过稳定命令完成发布。现有 Release API 只支持登录
Session，上传时还会用 `readBody()` 把整个 tar.gz 读入内存。

第三阶段打通：

```text
本地终端 / CI
  -> App 构建和打包
  -> App 发布脚本
  -> Hub Release API
  -> 保存 Release
  -> 手动或自动 Deployment
  -> 查询 Operation 结果
```

## 2. 当前现状

### 2.1 App 构建

App 模板已经完成构建、依赖整理、native binary 处理和 tar.gz 打包。构建命令
和制品格式已经确定，本阶段主要补齐上传和部署入口。

当前制品契约为：

```text
dist.tar.gz
├── config.example.yml
└── dist/
    ├── cli/
    ├── client/
    ├── node_modules/
    ├── server/
    ├── package.json
    └── pnpm-workspace.yaml
```

`dist/package.json` 是部署时使用的 manifest，`config.example.yml` 是部署时可选
的配置模板。制品解压后应直接得到这两个相对路径，不能把 `dist/` 下的内容散落
到归档根目录。

### 2.2 Hub Release API

当前接口为：

```http
POST /api/hub/apps/:appId/releases
```

当前行为：

- 使用登录 Session 和 Hub ACL 鉴权；
- 要求 `upload-release` 权限；
- 请求体是整个 tar.gz；
- 最大制品大小为 `256 MiB`；
- Hub 从制品中读取版本、manifest 和配置模板，并在 Hub 侧计算 checksum；
- 上传完成后保存 artifact，并创建 `hubAppReleases` 记录；
- Release 上传和 Deployment 分开处理。

当前 Hub 已兼容从 `dist/package.json` 或归档根目录读取 manifest。第三阶段需要
固化以 `dist/package.json` 为主的制品契约，并补充两种结构的兼容测试；新生成的
App 制品统一使用 `dist/package.json`，不再把根目录 `package.json` 作为默认格式。
根目录 manifest 只作为已有制品的兼容格式，不作为新的构建约定。

### 2.3 CLI

`@nocobase/nb3-cli` 已支持 App 在 `app` topic 下注册命令，例如：

```bash
pnpm nocobase app info
pnpm nocobase app migrate
```

目前还没有发布 Release 和触发 Hub Deployment 的命令。

## 3. 要解决的问题

本阶段解决以下问题：

1. 本地终端和 CI 可以使用同一条命令上传 App 制品；
2. CI 不依赖浏览器 Session，可以使用 API Key 调用 Hub；
3. 大制品上传不再一次性读入 Hub 内存；
4. 同一个制品或同一次 CI 重试不会重复创建 Release；
5. Release 上传和 Deployment 可以独立执行，也可以组合执行；
6. 新 Release 可以按 App 配置选择手动部署或自动部署；
7. CLI 可以拿到 `releaseId`、`operationId` 并查询已有 Operation 结果。

这里需要明确三个对象的职责：

| 对象 | 职责 | 是否可变 |
| --- | --- | --- |
| Artifact | 实际上传的 `tar.gz` 制品 | 不可覆盖 |
| Release | 某个 App 的不可变制品版本和元数据 | 创建后不可修改 |
| Deployment/Operation | 将某个 Release 应用到 App 的一次业务记录和执行记录 | 状态可推进，目标不可改 |

同一个 Release 可以被多次 Deployment；一次 Deployment 只能指向一个 Release。
Deployment 失败不删除 Release，也不修改此前成功的 Release。

版本号是发布者提供的展示标签，不是制品的唯一身份。同一个 App 可以存在多个
相同版本但 checksum 不同的 Release；CLI 和页面应使用 `releaseId` 或 checksum
区分它们。

## 4. 目标和边界

### 4.1 本阶段包含

- App CLI 的 `publish` 和 `deploy` 命令；
- Hub URL、API Key 和 App ID 的参数及环境变量配置；
- Hub App API Key 的创建、禁用和删除；
- Release API 的流式上传；
- SHA-256 checksum、制品校验和上传幂等；
- `manual`、`auto` 两种 Deployment 模式；
- 按 `deploymentMode` 创建 Deployment/Operation，并由 Coordinator 可靠派发；
- 使用第二阶段已有的 Operation 执行和查询能力。

### 4.2 本阶段不包含

- 配置文件 diff、merge 和冲突处理；
- Hub/Host 重启后的结果确认；
- `unknown`、`needs-attention`、Retry、Close 等恢复处置；
- Runtime、ArtifactResolver、DeploymentCatalog 重构；
- 通用认证插件的 API Key 能力；
- 独立的发布中心或新的 npm 包。

API Key 只服务于 Hub 的 CI/CD 调用，不扩展成全局 NocoBase 认证体系。

### 4.3 本阶段完成后的用户路径

首次配置：

```text
Hub 用户登录
  -> 在 App 设置中创建 API Key
  -> 将 API Key 保存到本地 Secret 或 CI Secret
```

发布：

```text
本地终端 / CI
  -> pnpm build --target ... --tar
  -> pnpm nocobase app publish
  -> Hub 保存不可变 Release
```

部署：

```text
manual
  -> 用户在页面或 CLI 选择 Release
  -> 创建 Deployment/Operation

auto
  -> Release 保存成功
  -> Hub 自动创建 Deployment/Operation
  -> Coordinator 异步提交 Host
```

无论从页面还是 CLI 发起，最终都进入同一套 Release、Deployment 和 Operation
Service，不能为 CI 另外实现一套旁路部署逻辑。第三阶段只保证已接纳 Operation
能够被持续派发；Host 已执行但 Hub 尚未确认的结果，仍属于后续恢复阶段。

## 5. 技术方案

### 5.1 整体流程

标准发布：

```text
pnpm build --tar
  -> storage/dist.tar.gz
  -> pnpm nocobase app publish
  -> Hub 校验 API Key
  -> 流式接收并校验制品
  -> 保存 Release
  -> 返回 releaseId
```

发布并部署：

```text
publish
  -> 创建或返回 Release
  -> 以 releaseId 调用 Deploy API
  -> 创建 Deployment/Operation
  -> 返回 operationId
  -> 可选等待 Operation 结果
```

上传和部署保持两个独立动作。`--deploy` 只是 CLI 的组合选项，不能把两者放入
同一个数据库事务，也不能因为 Deployment 失败删除已经保存的 Release。

自动 Deployment 的持久化流程：

```text
Release 校验和 artifact 保存
  -> 事务写入 Release、Deployment、Operation
  -> Operation.status = queued
  -> 事务提交
  -> Coordinator 扫描 queued Operation
  -> 提交 Host
```

`queued` Operation 同时承担可靠派发记录的职责，不新增通用消息队列或独立
outbox 表。Coordinator 在以下时机扫描未终局的 queued Operation：

- Hub 启动完成后；
- Host 变为 ready 后；
- 定时轮询；
- 新 Operation 提交后立即触发一次异步扫描。

Coordinator 只负责“尚未提交 Host”的派发恢复，不判断 Host 已执行但结果未确认
的 Operation。Hub 在扫描时必须使用 Operation 的幂等提交协议；同一个 Operation
重复 submit 不能重复切换 Runtime。派发失败保留 `queued` 状态和错误摘要，按
退避策略再次尝试，不能因为 Hub 进程退出或 Host 暂不可用丢失自动部署。

### 5.2 App CLI

复用现有 App CLI 的 `app` topic，不恢复已经删除的旧 `hub *` 命令。

```bash
pnpm build --target linux-x64 --tar

pnpm nocobase app publish \
  --hub https://hub.example.com \
  --app-id crm \
  --api-key "$HUB_API_KEY" \
  --file storage/dist.tar.gz
```

组合部署：

```bash
pnpm nocobase app publish \
  --hub https://hub.example.com \
  --app-id crm \
  --api-key "$HUB_API_KEY" \
  --file storage/dist.tar.gz \
  --deploy
```

已有 Release 单独部署：

```bash
pnpm nocobase app deploy \
  --hub https://hub.example.com \
  --app-id crm \
  --api-key "$HUB_API_KEY" \
  --release-id <releaseId>
```

参数规则：

- `--hub`、`--api-key`、`--app-id` 优先于对应环境变量
  `HUB_URL`、`HUB_API_KEY`、`HUB_APP_ID`；
- `--file` 默认使用 `storage/dist.tar.gz`；
- `--deploy` 在发布成功后触发 Deployment；
- `--wait` 等待 Operation 终局并根据结果返回退出码；
- `--timeout <seconds>` 设置 `--wait` 的最长等待时间，默认 `600` 秒；
- `--json` 输出 CI 可解析的结果；
- `--idempotency-key` 设置发布请求的幂等键；
- `--deployment-idempotency-key` 设置 `--deploy` 对应 Deployment 的幂等键；
- API Key 不写入日志和错误信息。

第一版命令放在 App 模板的 `cli/commands`，复用
`@nocobase/nb3-cli` 现有的命令装配能力。后续有多个应用需要共享 HTTP 客户端
时，再将无业务的公共部分下沉到 CLI 包。

可部署应用模板的命令入口保持一致：

```text
app-template-default/cli/commands/
app-template-examples/cli/commands/
```

模板之间同步命令协议、HTTP 客户端和结果格式；模板名称、插件组成和页面身份
保持各自独立。CLI 不读取 Hub 数据库，也不直接连接 Host，只通过 Hub API 完成
发布和部署。

`app-template-hub` 是 Hub 控制面模板，不默认加入面向下游 App 的发布命令。只有
明确支持“Hub 自身作为被发布 App”时，才单独把相同命令接入该模板，并补充它的
自发布权限和目标 Hub 配置。

### 5.3 Hub API Key

API Key 由已登录的 Hub 用户在 App 管理页面创建。每个 Key 只绑定一个 App，
范围固定为：

```text
upload-release
read-release
deploy
read-operation
```

API Key 的 scope 是固定枚举，不允许调用方提交任意 action。API Key 管理接口
使用新的 `manage-api-keys` Hub App action；创建者还必须拥有所请求 scope 对应
的用户权限，不能通过创建 Key 提升自己的权限。当前映射为：

| API Key scope | Hub Session action |
| --- | --- |
| `upload-release` | `upload-release` |
| `read-release` | `read-release` |
| `deploy` | `deploy` |
| `read-operation` | `read-deployment` |

`read-operation` 是 CLI/API 对外的命名，服务端权限资源仍可复用第二阶段的
`read-deployment`。如果后续需要把 Operation 查询和 Deployment 历史拆成不同的
权限，再新增独立 action，不在本阶段隐式改变已有角色语义。

CLI 所需 scope：

| 命令 | 最低 scope |
| --- | --- |
| `app publish` | `upload-release` |
| `app publish --deploy`（manual） | `upload-release`、`deploy` |
| `app publish --deploy`（auto） | 不允许，由 Release API 返回 `409` |
| `app deploy --release-id` | `deploy` |
| 任意命令使用 `--wait` | 在上述 scope 之外增加 `read-operation` |
| 查看 Release 或 Operation | 分别需要 `read-release`、`read-operation` |

CLI 使用：

```http
Authorization: Bearer <apiKey>
```

Hub Release/Deployment 路由增加 Hub 内部的凭证解析层，处理 Bearer 请求：

1. 按 Key hash 查询有效 Key；
2. 校验 Key 是否属于当前 App；
3. 校验当前操作是否在 Key scope 内；
4. 记录最后使用时间和安全日志。

Key 规则：

- 数据库只保存 hash，不保存明文；
- 明文只在创建成功时返回一次；
- 禁用或删除后立即失效；
- 日志、错误响应和 Operation snapshot 不记录明文；
- 不支持跨 App 的全局 Key。

API Key 的管理接口和页面仍使用现有 Session 与 Hub ACL。Release、Deploy 和
Operation 查询接口同时支持两种凭证：

- Session 请求继续进入现有 `authentication.required()` 和 Hub ACL；
- API Key 请求由 Hub 凭证层校验 App 归属和 scope 后进入对应 Hub Service，
  不要求创建用户 Session。

当前 Hub 路由上的全局
`authentication.required()` 和 `authorization.middleware()` 不能直接用于
API Key 请求，否则没有 Session 的 CI 请求会先被拦截。实现时需要把 Release、
Deploy 和 Operation 查询拆成支持两种凭证的路由组；API Key 管理接口仍只保留
Session 路由。两种路由最终都必须调用同一套 Hub Service。

API Key 不修改 `@nocobase/app-plugin-authentication` 和
`@nocobase/app-plugin-authorization` 的通用身份模型，也不把 API Key 伪装成
普通用户身份。Hub 路由需要确保两种凭证都不能绕过 App 归属校验。

API Key 管理接口：

```http
POST   /api/hub/apps/:appId/api-keys
GET    /api/hub/apps/:appId/api-keys
POST   /api/hub/apps/:appId/api-keys/:keyId/disable
DELETE /api/hub/apps/:appId/api-keys/:keyId
```

创建请求至少包含：

```json
{
  "name": "production-ci",
  "scopes": ["upload-release", "deploy", "read-operation"]
}
```

创建成功只返回一次完整明文，例如 `secret`；列表、禁用和删除接口只返回
`id`、`name`、`prefix`、`scopes`、`status`、`createdAt` 和 `lastUsedAt`，不得
返回或恢复完整 secret。禁用和删除均为幂等操作。删除 App 时一并删除或失效其
所有 API Key。

API Key 数据库只保存随机 secret 的 hash 和展示前缀。安全日志使用
`actorType: "api-key"` 与 `actorId: keyId` 标识调用方，不记录 secret；Session
日志继续使用用户身份。

### 5.4 Release 流式上传

当前 `readBody()` 需要改为临时文件加流式处理：

```text
HTTP Request Body
  -> 校验 Content-Length
  -> 按 chunk 写入临时文件
  -> 同时计算 SHA-256 和 size
  -> 超过限制立即中断
  -> 校验 tar 内容和版本
  -> 使用 Drive.putStream() 保存 artifact
  -> 创建 Release
  -> 清理临时文件
```

处理规则：

- 继续使用 `application/gzip` 或 `application/octet-stream` 原始请求体；
- 最大制品大小继续为 `256 MiB`；
- 同时限制 `Content-Length` 和实际读取大小；
- tar 路径、`dist/package.json`、入口文件和配置模板继续使用现有校验；
- 校验失败不创建 Release；
- 上传中断、超限、校验失败和数据库失败都清理临时文件；
- 使用已有 Drive 的 `putStream()`，不把整个制品重新读入内存。

`createRelease()` 从当前的 `Uint8Array` 输入调整为临时文件或流输入；
`inspectArtifact()` 直接从临时文件读取需要校验的文件。

### 5.5 Release 幂等和制品去重

Release 创建后不可覆盖已有 artifact。上传完成并得到 checksum 后按以下顺序
处理：

1. 按 `appId + idempotencyKey` 查找已有上传请求映射；
2. key 和 checksum 都相同，返回已有 Release；
3. key 相同但 checksum 不同，返回 409；
4. 没有命中 key 时，按 `appId + checksum` 查找已有 Release；
5. 命中相同制品时返回已有 Release；
6. 没有命中时创建新的 Release。

CLI 默认使用制品 checksum 作为上传幂等键，也允许通过
`--idempotency-key` 显式指定。

数据库约束：

- `(appId, checksum)` 唯一；
- `hubAppReleaseIdempotencies` 中 `(appId, idempotencyKey)` 唯一；
- Release 记录写入失败时删除已写入的 artifact；
- 不允许更新已有 Release 的版本、manifest、checksum 或 artifact。
- 并发请求触发唯一约束冲突时，重新读取并返回已经创建的 Release，不能返回
  半成功或创建第二份 artifact。

重复上传要区分：

- 同 App、同版本、同 checksum：幂等成功，返回已有 Release；
- 同 App、同版本、不同 checksum：允许创建新的 Release；
- 同 App、不同版本、同 checksum：返回已有 Release，不保存第二份 artifact；
- 不同 App 即使 checksum 相同，也分别创建 Release，因为归属和权限不同。

幂等键不能只作为 `hubAppReleases.idempotencyKey` 的单值字段：同一个制品可能
先被 checksum 去重命中，再被多个不同的显式幂等键重试。应使用独立映射表保存
`appId`、`idempotencyKey`、`releaseId`、`checksum` 和创建时间。checksum 去重
命中时，在事务中补写该映射；并发插入冲突时重新读取映射并按 checksum 返回已有
Release 或返回 `409`。这样既允许多个幂等键指向同一个 Release，也不会让“同一
幂等键、不同制品”的重试绕过去。

版本相同但 checksum 不同的 Release 必须在列表和 Deployment 选择器中展示
`releaseId`、checksum 或创建时间，不能只展示版本号。

### 5.6 Manual 和 Auto Deployment

在 `hubApps` 增加：

```text
deploymentMode: manual | auto
```

含义：

- `manual`：上传只创建 Release，由用户在页面或 CLI 选择 Release；
- `auto`：保存 Release 时同时建立 Deployment/Operation，提交后自动派发执行。

自动部署：

```text
校验 Release 和配置
  -> 在同一数据库事务中保存 Release 和自动 Deployment/Operation
  -> 事务提交
  -> Coordinator 提交 Host
  -> 复用第二阶段 Operation 流程
  -> 返回 releaseId 和 operationId
```

自动 Deployment/Operation 只表示已经建立执行记录，Host 执行仍然是异步的。
Release 和自动 Deployment/Operation 必须在同一数据库事务中建立，避免 Release
已经保存但自动部署触发记录丢失。事务提交后才由 Coordinator 提交 Host。

artifact 存储不参与数据库事务。Hub 先把制品写入临时或正式 artifact key，再
执行数据库事务；事务失败时删除未被引用的 artifact。自动部署执行失败时保留
Release 和 artifact，不回滚之前成功的 Release，后续可以重新部署同一个 Release。

配置处理继续沿用现有规则：

- 已有 App 优先沿用当前成功 Deployment 的配置；
- 第一次部署使用 Release 中的配置模板；
- 本阶段不做配置 diff、merge 和 secret 合并；
- `auto` 发布的配置准备属于接纳前校验；没有可用配置时整个请求失败，不创建
  Release。需要先保存制品、再处理配置问题时，将 App 切换为 `manual` 后重新发布。

`deploymentMode` 与 CLI 参数的行为如下：

| `deploymentMode` | `app publish` | `app publish --deploy` | `app deploy --release-id` |
| --- | --- | --- | --- |
| `manual` | 只创建 Release | 创建 Release，再创建一个 Deployment/Operation | 创建一个 Deployment/Operation |
| `auto` | 创建 Release，并自动接纳一个 Deployment/Operation | 返回 409，提示省略 `--deploy`，避免重复创建 | 创建一个新的 Deployment/Operation |

`--deploy` 不覆盖服务端的 `deploymentMode`。在 `auto` 模式下，发布已经包含自动
部署语义，显式再传 `--deploy` 直接拒绝，不创建第二个 Deployment。需要重新
部署同一个 Release 时，使用 `app deploy --release-id` 并提供新的部署幂等键。

为了让这个拒绝发生在制品保存之前，`publish --deploy` 必须在上传请求中声明
显式 Deployment intent，例如使用 `X-Hub-Deployment-Intent: explicit` 请求头。
Hub 在读取请求体前检查 App 的 `deploymentMode`：`manual` 继续接收 Release，
`auto` 直接返回 `409`，不保存 artifact、Release 或 Operation。不能由 CLI 先
上传，再根据响应猜测是否需要调用 Deploy。

自动模式下，新建 Release 的成功响应必须同时包含已落库的 `operationId`。如果
请求只是命中一个已经存在、且没有关联自动 Operation 的 Release，不因为重复上传
再次创建 Deployment；需要部署该 Release 时使用 `app deploy --release-id`。
自动接纳前的活动 Operation 冲突或配置校验失败，应在创建 Release 前返回错误；
不能返回“发布成功但没有自动部署”的模糊成功结果。

### 5.7 接口约定

上传接口：

```http
POST /api/hub/apps/:appId/releases
Authorization: Bearer <apiKey>
Content-Type: application/gzip
Idempotency-Key: <key>
X-Hub-Deployment-Intent: explicit  # 仅 publish --deploy 发送
```

返回 `releaseId`、版本、checksum 和 size。自动模式下同时返回已经落库的
`operationId`；手动模式下 `operationId` 为空。响应状态约定为：

- 纯 Release 创建或命中已有 Release，返回 `200`；
- 自动模式新建 Release 并接纳 `queued` Operation，返回 `202`；
- 自动模式命中已有 Release 并沿用未终局 Operation 时，返回 `202`；
- 自动模式命中已有 Release 且没有可沿用的 Operation，不创建新的自动
  Deployment，返回 `200`，调用方需要使用 `app deploy --release-id`。

手动部署继续使用：

```http
POST /api/hub/apps/:appId/deploy
```

请求使用 `releaseId`，并通过 `Idempotency-Key` 传递部署幂等键。返回第二阶段
定义的 `operationId`。

Operation 查询继续使用第二阶段的接口和状态模型，不新增第三套执行状态。

Operation 查询接口：

```http
GET /api/hub/apps/:appId/operations/:operationId
Authorization: Bearer <apiKey>
```

Session 请求需要 `read-deployment`；API Key 请求需要 `read-operation`，并且
Operation 必须属于 URL 中的 `appId`。响应至少包含：

```json
{
  "data": {
    "operationId": "operation-uuid",
    "deploymentId": "deployment-uuid",
    "appId": "crm",
    "releaseId": "release-uuid",
    "status": "queued",
    "phase": "queued",
    "error": null,
    "createdAt": "2026-09-12T00:00:00.000Z",
    "startedAt": null,
    "finishedAt": null
  }
}
```

第三阶段只使用第二阶段已经定义的 `queued`、`running`、`succeeded` 和 `failed`
状态。`unknown`、`needs-attention`、Retry、Close 属于后续恢复阶段。

建议的响应结构：

```json
{
  "data": {
    "releaseId": "release-uuid",
    "version": "1.2.3",
    "checksum": "sha256...",
    "size": 123456,
    "operationId": null,
    "operationStatus": null
  }
}
```

`operationId` 和 `operationStatus` 在手动模式下为 `null`；自动模式下，新建
Release 成功时只有在 Release、Deployment 和 Operation 已经成功落库后才返回。
命中已有 Release 时沿用已有的 Operation 关联，不创建重复 Deployment。返回
`operationId` 不代表 Host 已经执行成功，只代表 Operation 已被接纳并进入
`queued` 状态。

状态码约定：

| 状态码 | 场景 |
| --- | --- |
| `200` | 查询成功、命中已有 Release 或幂等返回 |
| `202` | Deployment/Operation 已接纳，执行尚未完成 |
| `400` | 参数、Content-Type、幂等键格式错误 |
| `401` | Session 或 API Key 缺失/无效 |
| `403` | 凭证有效但没有对应 App 或 scope 权限 |
| `404` | App、Release 或 Operation 不存在 |
| `409` | 幂等键、活动 Operation、控制版本或请求组合冲突 |
| `413` | 制品超过 `256 MiB` |
| `422` | tar 路径、manifest、入口文件、配置模板或自动部署配置校验失败 |
| `500` | Hub 内部存储或数据库事务失败 |

### 5.8 幂等键和重试语义

Release 上传和 Deployment 接纳使用两套幂等键：

```text
releaseIdempotencyKey
deploymentIdempotencyKey
```

HTTP 层分别通过对应请求的 `Idempotency-Key` 传递。CLI 规则：

- `app publish` 的 `--idempotency-key` 只作用于 Release；
- 未显式指定时，Release 默认使用制品 checksum 作为稳定幂等键；
- `app deploy` 的 `--idempotency-key` 只作用于 Deployment；
- `publish --deploy` 使用 `--deployment-idempotency-key`；未指定时使用
  `publish:<releaseId>:<releaseIdempotencyKey>` 的规范化值；
- `publish --deploy` 同时发送显式 Deployment intent；在 `auto` 模式下由 Release
  API 在读取制品前返回 `409`；
- 同一个 Deployment 幂等键和相同请求 fingerprint 返回原 Operation；
- 同一个 Deployment 幂等键但目标 Release、配置或其他请求内容不同，返回 409；
- 想要重新部署同一个 Release，必须使用新的 Deployment 幂等键。

如果 `publish --deploy` 在收到响应前断开，重试同一个发布幂等键和部署幂等键
会返回已有 Release 和已有 Operation，不会创建第二个 Release 或 Deployment。

### 5.9 CLI 输出和退出码

默认输出面向人工使用，至少包含 App、Release 版本、checksum、Release ID 和
Deployment/Operation 状态。`--json` 输出单个 JSON 对象，不混入 spinner、进度
文本或调试日志，便于 CI 解析。JSON 必须复用现有 CLI envelope：

```json
{
  "schemaVersion": 1,
  "ok": true,
  "operation": "app publish",
  "status": "success",
  "result": {
    "appId": "crm",
    "releaseId": "release-uuid",
    "version": "1.2.3",
    "checksum": "sha256...",
    "operationId": "operation-uuid",
    "operationStatus": "queued"
  }
}
```

成功结果写 stdout，失败结果写 stderr，并保持稳定的 `error.code`、
`error.message` 和可选 `error.suggestions` 字段。`status` 使用现有 CLI 约定；
Hub 的 `queued`、`running`、`succeeded`、`failed` 放在 `result.operationStatus`
中，不能覆盖 CLI envelope 的状态字段。

建议退出码：

| 退出码 | 含义 |
| --- | --- |
| `0` | 发布成功，或等待后 Operation 成功 |
| `1` | Hub 返回业务错误、校验失败或 Operation 明确失败 |
| `2` | CLI 参数、环境变量或本地制品文件错误 |
| `3` | 网络错误、超时或 Operation 结果暂时无法确认 |

`publish` 在未传 `--wait` 时，Release 保存成功即可返回 `0`；如果同时创建了
Deployment，只输出已接纳的 `operationId`。传入 `--wait` 后，必须有可等待的
Operation；手动模式下只发布 Release 时，CLI 应在本地参数校验阶段拒绝
`--wait`，避免让用户误以为已经等待了部署。存在 Operation 时，只有它进入
`succeeded` 才返回 `0`。`needs-attention`、超时和无法确认不能当作成功。

API Key、请求头、完整 URL 中的凭证部分和 Hub 返回的敏感错误内容不得进入
普通日志、JSON 输出或 CI annotation。

### 5.10 自动部署的触发和失败语义

`deploymentMode` 是 App 的发布策略，不是 Host 的启动策略。它与现有
`startupMode` 独立：

| 字段 | 说明 |
| --- | --- |
| `deploymentMode` | Release 保存后是否自动创建 Deployment |
| `startupMode` | App 在 Host 中采用 eager 还是 lazy 激活 |

自动接纳分为两个边界：

1. 接纳前完成 Release、配置和活动 Operation 校验。App 有活动 Operation 时
   返回 `409`，配置模板缺失或校验失败时返回 `422`；本次请求不创建 Release，
   临时 artifact 也必须清理。
2. 校验通过后，在同一数据库事务中写入 Release、Deployment 和 Operation。
   事务失败时回滚这些数据库记录并清理未被引用的 artifact，返回 `500`。

事务提交后，Host 暂不可用不影响 Release、Deployment 和 Operation 的接纳。
Operation 保持 `queued`，由 Coordinator 在 Host ready 或下一次轮询时继续派发。
之后的派发失败或 Deployment 执行失败都保留 Release 和 artifact；同一个 Release
可以使用新的 Deployment 幂等键重新部署。

Coordinator 的派发记录至少需要能够诊断：

- 最近一次派发时间；
- 派发尝试次数；
- 最近一次派发错误摘要；
- 下一次允许派发的时间。

这些字段可以放在第二阶段 Operation 表中，也可以由 Coordinator 使用等价的
持久化字段实现，但不能只保存在进程内存中。第三阶段不处理 Host 已执行但结果
未知的恢复，这部分仍由后续恢复 PR 负责。

## 6. 数据模型和改动范围

### 6.1 数据模型

`hubApps` 增加：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `deploymentMode` | string | `manual` 或 `auto`，默认 `manual` |

新增 `hubAppApiKeys`：

| 字段 | 说明 |
| --- | --- |
| `id`、`appId`、`name` | Key 身份和归属 |
| `prefix`、`secretHash` | 展示前缀和凭证 hash |
| `scopes`、`status` | 操作范围和启用状态 |
| `createdBy`、`lastUsedAt` | 创建人和最近使用时间 |
| `createdAt`、`updatedAt` | 时间字段 |

新增 `hubAppReleaseIdempotencies`，用于保存上传请求和 Release 的幂等映射：

```text
hubAppReleases:
  (appId, checksum) UNIQUE

hubAppReleaseIdempotencies:
(appId, idempotencyKey) UNIQUE
releaseId -> hubAppReleases.id
```

`hubAppReleases` 本身不保存单个上传幂等键；一个 Release 可以关联多个显式
幂等键。checksum 仍直接存放在 Release 上并按 App 唯一。

自动部署和 CLI 手动部署都复用第二阶段的 `hubAppOperations`，不新增第三套
Operation 表。自动模式下，Release、Deployment 和 Operation 在同一数据库事务
中建立；Host 提交仍在事务提交后异步执行。Operation 需要提供可靠派发所需的
持久化字段，至少包括 `dispatchAttempts`、`lastDispatchError` 和
`nextDispatchAt`，或者提供等价能力。

### 6.2 改动模块

| 模块 | 改动 |
| --- | --- |
| `@nocobase/app-plugin-hub` | API Key、流式 Release 上传、幂等去重、Deployment 模式、自动触发 Operation、接口和 migration |
| `app-template-default` | `app publish`、`app deploy` 命令和发布参数 |
| `app-template-examples` | 同步 App CLI 命令和公共发布流程 |
| `app-template-hub` | 默认不接入下游 App 发布命令；如支持 Hub 自发布，单独增加适配和测试 |
| `@nocobase/nb3-cli` | 第一版只复用现有命令装配，暂不改 CLI 核心 |
| `@nocobase/drive` | 复用已有 `putStream()`，不新增存储抽象 |
| `@nocobase/app-host` | 不改执行协议，继续使用第二阶段 Operation/IPC |
| `@nocobase/app-plugin-authentication` | 不改通用 Session 和认证模型 |
| `@nocobase/app-plugin-authorization` | 不改通用用户 ACL |
| `@nocobase/app-server`、`@nocobase/db` | 不改通用请求和数据库内核 |

主要代码范围：

```text
packages/plugins/app-plugin-hub/server/routes/
packages/plugins/app-plugin-hub/server/services/
packages/plugins/app-plugin-hub/server/tokens.ts
packages/plugins/app-plugin-hub/database/migrations/
packages/templates/app-template-default/cli/commands/
packages/templates/app-template-examples/cli/commands/
```

本阶段不新增独立插件、npm 包或通用消息模块。

API Key 管理页面建议放在 App Settings 中，至少提供：

- 创建 Key，并只在创建成功时展示一次明文；
- 展示名称、前缀、scope、创建时间、最近使用时间和状态；
- 禁用和删除；
- 禁止查看或恢复完整明文；
- 删除 App 时同步失效其所有 Key。

## 7. 测试和验收

- `pnpm build --tar` 生成的制品可以通过 `app publish` 上传；
- CLI 支持参数和环境变量配置，`--json` 输出稳定；
- API Key 只能访问绑定 App，缺少 scope 时返回 403；
- 大制品按流式方式接收，超限和失败会清理临时文件；
- 相同 checksum 或幂等键不会重复创建 Release；
- `manual` 模式只保存 Release，`auto` 模式会创建 Operation；
- `publish --deploy` 和 `app deploy --release-id` 使用同一套 Operation；
- Operation 成功或失败可以通过 CLI 查询，退出码正确；
- API Key 不出现在日志、错误响应和持久化的 Operation 数据中；
- 同版本不同 checksum 可以共存，同 checksum 重试返回已有 Release；
- `auto + --deploy` 被拒绝，不创建重复 Deployment；
- Host 暂不可用时 Auto Deployment 保持 queued，并可在 Host ready 后继续派发；
- `publish --deploy` 的两个幂等键重试不会创建重复 Release 或 Deployment；
- API Key 管理接口遵守创建权限、scope 上限和明文只返回一次；
- `--wait` 超时或结果不明时不会返回成功；
- Session 用户原有 Hub 页面和权限行为不回归。

## 8. PR 拆分

第三阶段拆成三个小闭环，避免把制品处理、认证和部署调度放在同一个 PR。

### PR 3A：Release 制品契约与流式上传

包含：

- 固化 `dist/package.json` 为新制品的主 manifest 契约；
- 为根目录 `package.json` 兼容读取补充测试，不改变新制品格式；
- tar.gz 流式上传；
- checksum、制品大小和内容校验；
- Drive `putStream()`；
- Release checksum 去重和上传幂等；
- 返回 `releaseId`。

完成后可以通过现有 Session 调用 API，跑通：

```text
pnpm build --tar
  -> POST /apps/:appId/releases
  -> Hub 保存 Release
  -> 返回 releaseId
```

### PR 3B：API Key 与 CLI Publish

包含：

- API Key 创建、禁用、删除和鉴权；
- App scope 校验；
- `app publish` 命令；
- Hub URL、API Key、App ID 参数和环境变量；
- `--json` 和发布结果输出；
- CLI 调用 Release API。

完成后可以跑通：

```text
CI
  -> pnpm nocobase app publish
  -> Bearer API Key
  -> Hub 保存 Release
  -> 返回 releaseId
```

### PR 3C：Release 到 Deployment 的触发链路

包含：

- `deploymentMode`；
- manual/auto Deployment；
- `app deploy --release-id`；
- `publish --deploy`；
- Release 提交后创建第二阶段 Operation；
- Coordinator 扫描 `queued` Operation、提交 Host、记录派发失败并按退避策略重试；
- Hub 启动、Host ready 和定时轮询时恢复未派发的 `queued` Operation；
- Operation 查询和 `--wait`；
- 自动部署失败后保留 Release。

完成后可以跑通：

```text
本地终端 / CI
  -> 构建 tar
  -> 上传 Release
  -> 自动或手动创建 Operation
  -> 查询 Deployment 结果
```

配置合并、重启恢复、未知结果处置和人工 Retry/Close 不放入这三个 PR。

## 9. 发布影响

需要新增或更新：

- `@nocobase/app-plugin-hub` migration 和测试；
- `app-template-default`、`app-template-examples` 的 CLI 命令和测试；
- 如果明确支持 Hub 自发布，再增加 `app-template-hub` 的适配和测试；
- Hub API Key、Release 上传和 Deployment 相关 changeset；
- Hub 管理页面中的 API Key 管理和 Deployment 模式配置入口。

本阶段不需要新增 `@nocobase/app-host`、`@nocobase/drive`、
`@nocobase/app-plugin-authentication` 或 `@nocobase/app-plugin-authorization`
的发布变更。
