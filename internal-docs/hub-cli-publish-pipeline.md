---
title: Hub App CLI 发布链路与 Release 部署
description: 第三阶段实施方案。打通本地终端与 CI 通过命令把 App 制品发布到 Hub 并触发部署的链路
---

# Hub App CLI 发布链路与 Release 部署

> 状态：实施方案。基线是 develop 当前代码，不依赖第二阶段（Deploy/Rollback Operation）是否合入。
>
> 每条「代码事实」都对应具体文件和行，是方案形状的依据；实现与之不符时先更新本文。

目标链路：

```text
本地终端 / CI
  -> pnpm build --target <platform> --tar
  -> pnpm nocobase app upload
  -> Hub Release API（API Key 鉴权、流式接收）
  -> 保存不可变 Release
  -> 手动或自动 Deployment
  -> 查询部署结果
```

## 1. 基线：develop 上已经有什么

| 能力          | 位置                                                                                      | 状态           |
| ------------- | ----------------------------------------------------------------------------------------- | -------------- |
| App 打包      | `pnpm build --tar` 产出 `storage/dist.tar.gz`                                             | 可用           |
| 制品契约      | `dist.tar.gz` 内含 `config.example.yml` 和 `dist/`                                        | 可用           |
| manifest 读取 | `services/hub.ts:68` 的 `ARTIFACT_MANIFEST_PATHS = ['dist/package.json', 'package.json']` | 双路径兼容     |
| Release 上传  | `POST /apps/:appId/releases`，`routes/index.ts:166`                                       | 一次性读入内存 |
| 上传大小上限  | `routes/index.ts:34` 的 `MAX_ARTIFACT_SIZE = 256 MiB`                                     | 可用           |
| 制品存储      | `services/hub.ts:397` 的 `this.disk.put(artifactKey, bytes)`                              | 缓冲写入       |
| 部署          | `POST /apps/:appId/deploy`、`deploy()`、`createDeploymentRecord()`、`schedule()`          | 可用           |
| 部署记录      | `hubAppDeployments`，状态 `queued / deploying / succeeded / failed / cancelled`           | 可用           |
| 权限          | `authorization.ts` 的 `HUB_APP_ACTIONS`，含 `upload-release`、`deploy`、`read-deployment` | 可用           |
| CLI 装配      | `@nocobase/nb3-cli` 的 topic 机制，模板 `cli/commands/` 已有 info、migrate、seed          | 可用           |

缺的：

- **没有任何 API Key 设施**。全仓搜不到，Hub 路由在 `routes/index.ts:47` 统一挂了 `authentication.required()` 和 `authorization.middleware()`，无 Session 的请求进不来。
- **上传不是流式**。`readBody()` 在 `routes/index.ts:380` 把整个 tar.gz 读进 `Uint8Array`。
- **没有上传幂等和制品去重**。`hubAppReleases` 上 `checksum` 只是普通索引，唯一的是 `artifactKey`（migration `202609010001`）。
- **没有发布命令**。三个模板的 `cli/commands/` 都只有 info、migrate、seed、i18n-check。
- **没有自动部署**。`hubApps` 有 `startupMode`，没有 `deploymentMode`。

## 2. 与第二阶段的关系

第二阶段引入 `hubAppOperations`、`appInstanceId`、`controlRevision`、fingerprint 和 Host Operation Store。**第三阶段不等它**，做法是：

- **对外契约先按 Operation 命名**。CLI 和 HTTP 返回 `operationId`，今天它等于 `deploymentId`，与第二阶段「第一版 `operationId === deploymentId`」的约定一致。第二阶段合入后，字段含义收紧，CLI 和 API 不用改。
- **查询接口用 `GET /apps/:appId/deployments/:deploymentId`**，它已经存在。第二阶段再加 `/operations/:operationId` 作为别名或替换。
- **幂等键落在自己的表上**，不碰 `hubAppDeployments` 的既有列，第二阶段的 Operation 幂等是另一套键（部署幂等），互不冲突。

两阶段都要改的只有一处：Deploy 的接纳路径。谁先合谁定形状，后合的一方做合并。**建议第三阶段的自动部署走和手动部署完全相同的入口**（见 5.3），这样第二阶段把接纳逻辑换成事务 + 条件更新时，只改一个地方。

## 3. 范围

### 3.1 本阶段包含

- App CLI 的 `publish` 和 `deploy` 命令，参数与环境变量。
- Hub App API Key：创建、列表、禁用、删除、鉴权。
- Release 流式上传，SHA-256 校验，制品去重与上传幂等。
- `deploymentMode`：`manual` 与 `auto`。
- CLI 查询部署结果、`--wait`、`--json`、退出码。

### 3.2 本阶段不包含

- 配置文件 diff、merge 和 secret 合并。
- Hub 或 Host 重启后的结果确认与恢复处置（`unknown`、`needs-attention`、Retry、Close）。
- 通用认证插件的 API Key 能力。API Key 只服务于 Hub 的 CI 调用。
- 独立的发布中心或新的 npm 包。
- Runtime、ArtifactResolver、DeploymentCatalog 重构。

### 3.3 明确的已知缺陷，本阶段不修

`restoreDesiredState()`（`services/hub.ts:714`）在 Hub 启动时把所有 `queued/deploying` 的部署一律标记为失败，原因写作「Deployment was interrupted by a Hub restart」。

这意味着：**auto 模式下，Release 保存后到 Host 真正开始执行之间如果 Hub 重启，这次自动部署会被判失败，且不会重试**。这是第二阶段 Coordinator 要解决的问题。本阶段的处理是：

- 文档和 CLI 输出都不承诺「自动部署一定会执行」，只承诺「已接纳」。
- `--wait` 看到这条失败记录会如实返回失败退出码，不会静默成功。

不要在本阶段自行加一个派发扫描循环，那是第二阶段 Coordinator 的职责，两套实现合并时冲突面很大。

## 4. 对象模型

| 对象       | 职责                                 | 可变性                 |
| ---------- | ------------------------------------ | ---------------------- |
| Artifact   | 实际存储的 tar.gz                    | 不可覆盖               |
| Release    | 某个 App 的一个不可变制品版本        | 创建后不可修改         |
| Deployment | 把某个 Release 应用到 App 的一次执行 | 状态可推进，目标不可改 |

一个 Release 可被多次 Deployment；一次 Deployment 只指向一个 Release。Deployment 失败不删除 Release。

**版本号是展示标签，不是身份。** 同一个 App 允许存在多个版本号相同但 checksum 不同的 Release，列表和选择器必须展示 releaseId 或 checksum，不能只展示版本号。

## 5. 技术方案

### 5.1 API Key

每个 Key 绑定一个 App，scope 是固定枚举：

```text
upload-release    -> upload-release
read-release      -> read-release
deploy            -> deploy
read-operation    -> read-deployment
```

左侧是对外命名，右侧是 `HUB_APP_ACTIONS` 里已有的 action，不新增服务端权限资源。管理接口用新的 `manage-api-keys` action，需要同时加进 `HUB_APP_ACTIONS` 和权限集 migration；**默认只给 `hub-administrator`**。创建者还必须自己拥有所请求 scope 对应的权限，不能靠建 Key 提权。

Key 规则：

- 数据库只存 SHA-256 hash 和展示前缀，明文只在创建成功时返回一次。Key 是高熵随机串，用确定性哈希而不是 bcrypt，因为要按 hash 查找。
- 禁用或删除后立即失效；删除 App 时一并失效其所有 Key。
- 不支持跨 App 的全局 Key。
- 明文不进日志、错误响应和任何持久化记录。

**路由必须拆组。** 今天 `routes.use('*', authentication.required(), authorization.middleware())` 会把没有 Session 的 CI 请求直接拦掉。做法是把 Release 上传、Deploy 和部署查询挪到一个支持双凭证的子路由：Session 请求走现有链路，Bearer 请求走 Hub 自己的凭证解析（查 Key、校验 App 归属、校验 scope、记录 lastUsedAt 和安全日志），然后两条路进同一个 Hub Service。API Key 管理接口本身只保留 Session。

API Key 不改 `@nocobase/app-plugin-authentication` 的身份模型，也不把 Key 伪装成用户。

### 5.2 流式上传与幂等

`readBody()` 换成临时文件 + 流式处理。flydrive 的 Disk 有 `putStream(key, Readable)`（`flydrive@2.1.0`），`drive.use('artifact')` 拿到的就是它，不需要给 `@nocobase/drive` 加抽象。

顺序很重要，**去重必须在写正式 artifact 之前**，否则每次幂等重试都会留下孤儿制品：

```text
HTTP body
  -> 校验 Content-Length 与 Content-Type
  -> 按 chunk 写临时文件，同时算 SHA-256 和 size
  -> 超过 256 MiB 立即中断
  -> 校验 tar 路径、dist/package.json、入口文件、配置模板
  -> 查幂等键 / 查 checksum            ← 命中就在这里返回，不落盘
  -> putStream 写入正式 artifact
  -> 创建 Release
  -> 删除临时文件
```

任何一步失败都要清理临时文件。

幂等查找顺序：

1. 按 `(appId, idempotencyKey)` 查映射表；key 与 checksum 都相同返回已有 Release，key 相同但 checksum 不同返回 409。
2. 未命中 key 时按 `(appId, checksum)` 查 Release，命中则返回已有 Release，并在事务中补写这条幂等映射。
3. 都未命中才创建新 Release。

CLI 默认用制品 checksum 作为上传幂等键，`--idempotency-key` 可显式指定。

**幂等键不能做成 Release 上的单值列**：同一个制品可能先被 checksum 命中，再被多个不同的显式 key 重试。用独立映射表 `hubAppReleaseIdempotencies(appId, idempotencyKey, releaseId, checksum, createdAt)`，`(appId, idempotencyKey)` 唯一。

重复上传的四种情形：

| 情形                          | 结果                                  |
| ----------------------------- | ------------------------------------- |
| 同 App、同版本、同 checksum   | 幂等成功，返回已有 Release            |
| 同 App、同版本、不同 checksum | 创建新 Release                        |
| 同 App、不同版本、同 checksum | 返回已有 Release，不存第二份 artifact |
| 不同 App、同 checksum         | 各自创建 Release，归属与权限不同      |

**`(appId, checksum)` 加唯一约束前要先处理存量重复数据。** 今天只有普通索引，同一制品传两次会有两条 Release。migration 要显式写出去重或保留策略，不能直接加约束。按仓库规则这是新 migration，操作全部写死。

并发触发唯一约束冲突时，重新读取并返回已创建的 Release，不能返回半成功或写第二份 artifact。

### 5.3 manual 与 auto

`hubApps` 增加 `deploymentMode: 'manual' | 'auto'`，默认 `manual`。它是发布策略，与 `startupMode`（Host 里 eager 还是 lazy 激活）无关。

- **manual**：上传只创建 Release，由用户在页面或 CLI 选择部署。
- **auto**：Release 保存成功后，Hub 立即调用与手动部署同一个入口创建 Deployment。

**auto 必须复用 `deploy()` 而不是另写一条路径**，这是与第二阶段合并成本最低的形状。

auto 模式下 `publish --deploy` 直接拒绝，因为发布本身已含部署语义，再传会创建第二个 Deployment。为了让拒绝发生在**读取请求体之前**，CLI 在 `--deploy` 时发送 `X-Hub-Deployment-Intent: explicit`，Hub 先查 `deploymentMode`，auto 直接返回 409，不保存任何东西。不能让 CLI 先传完再看响应猜。

行为矩阵：

| deploymentMode | `app upload`                       | `app upload --deploy`               | `app deploy --release-id` |
| -------------- | ---------------------------------- | ----------------------------------- | ------------------------- |
| manual         | 只创建 Release                     | 创建 Release，再创建一个 Deployment | 创建一个 Deployment       |
| auto           | 创建 Release 并自动创建 Deployment | 409，提示去掉 `--deploy`            | 创建一个新 Deployment     |

配置沿用现有规则：已有 App 用当前成功部署的配置，首次部署用 Release 里的模板，本阶段不做 diff 和 merge。**auto 模式下配置准备失败要在创建 Release 之前返回 422**，不能出现「发布成功但没有部署」的模糊结果；需要先保存制品再处理配置问题时，把 App 切回 manual 重新发布。

命中已有 Release 且它没有关联部署时，**不因为重复上传再创建一次部署**，返回 200 并提示改用 `app deploy --release-id`。

### 5.4 接口

上传：

```http
POST /api/hub/apps/:appId/releases
Authorization: Bearer <apiKey>
Content-Type: application/gzip
Idempotency-Key: <key>
X-Hub-Deployment-Intent: explicit   # 仅 publish --deploy 发送
```

返回 `releaseId`、`version`、`checksum`、`size`；auto 模式下同时返回已落库的 `operationId`，manual 为 null。

状态码：

| 码  | 场景                                                         |
| --- | ------------------------------------------------------------ |
| 200 | 查询成功、命中已有 Release、幂等返回                         |
| 202 | 新建 Release 并已创建部署                                    |
| 400 | 参数、Content-Type 或幂等键格式错误                          |
| 401 | Session 或 API Key 缺失、无效                                |
| 403 | 凭证有效但无此 App 或 scope 权限                             |
| 404 | App、Release 或部署不存在                                    |
| 409 | 幂等键冲突、已有进行中的部署、auto 模式下传了 `--deploy`     |
| 413 | 制品超过 256 MiB                                             |
| 422 | tar 路径、manifest、入口文件、配置模板或自动部署配置校验失败 |
| 500 | 存储或数据库失败                                             |

部署沿用 `POST /apps/:appId/deploy`，请求带 `releaseId` 和 `Idempotency-Key`。查询沿用 `GET /apps/:appId/deployments/:deploymentId`，响应里增加 `operationId`（当前等于 `deploymentId`）。

**部署幂等是另一套键**，与上传幂等分开：同一部署 key 加相同请求内容返回原部署；key 相同但目标 Release 或配置不同返回 409；要重新部署同一个 Release 必须换新 key。

### 5.5 CLI

复用模板 `cli/commands/` 和 `@nocobase/nb3-cli` 的 topic 装配，第一版不改 CLI 内核。

```bash
pnpm build --target linux-x64 --tar

pnpm nocobase app upload \
  --hub https://hub.example.com \
  --app-id crm \
  --api-key "$HUB_API_KEY" \
  --file storage/dist.tar.gz
```

参数规则：

- `--hub`、`--api-key`、`--app-id` 优先于 `HUB_URL`、`HUB_API_KEY`、`HUB_APP_ID`。
- `--file` 默认 `storage/dist.tar.gz`。
- `--deploy` 发布成功后触发部署；`--wait` 等待终局；`--timeout` 默认 600 秒。
- `--json` 输出单个 JSON 对象，复用现有 CLI envelope，Hub 的状态放在 `result.operationStatus`，不覆盖 envelope 的 `status`。
- `--idempotency-key` 作用于 Release，`--deployment-idempotency-key` 作用于部署。
- API Key 不进日志、不进 JSON 输出、不进 CI annotation。

退出码：

| 码  | 含义                                 |
| --- | ------------------------------------ |
| 0   | 发布成功，或等待后部署成功           |
| 1   | Hub 业务错误、校验失败或部署确认失败 |
| 2   | CLI 参数、环境变量或本地文件错误     |
| 3   | 网络错误、超时或结果暂时无法确认     |

`--wait` 必须有可等待的对象：manual 模式下只发布不部署时，CLI 在本地参数校验阶段就拒绝 `--wait`，不要让用户以为等过了。超时和结果不明返回 3，不算成功。

命令放在 `app-template-default` 和 `app-template-examples`，两者同步命令协议、HTTP 客户端和输出格式。`app-template-hub` 是控制面模板，**默认不加下游 App 的发布命令**。CLI 只走 Hub HTTP API，不读 Hub 数据库，不直连 Host。

## 6. 数据模型

`hubApps` 增加 `deploymentMode`（string，默认 `manual`）。

新增 `hubAppApiKeys`：`id`、`appId`、`name`、`prefix`、`secretHash`、`scopes`、`status`、`createdBy`、`lastUsedAt`、`createdAt`、`updatedAt`。

新增 `hubAppReleaseIdempotencies`：`(appId, idempotencyKey)` 唯一，`releaseId` 指向 `hubAppReleases.id`，另存 `checksum` 和 `createdAt`。

`hubAppReleases` 增加 `(appId, checksum)` 唯一约束，见 5.2 关于存量数据的说明。

三个 migration 都要按仓库规则写死表、字段、索引和约束，并配可执行 `up` 与 `down` 的测试。

## 7. PR 拆分

拆成四个，每个单独可评审、可验收。

| PR  | 内容                                                                                    | 依赖   |
| --- | --------------------------------------------------------------------------------------- | ------ |
| 3A  | 流式上传、checksum 校验、制品去重与上传幂等、`(appId, checksum)` 唯一约束及其 migration | 无     |
| 3B  | API Key 表、管理接口与页面、Bearer 凭证层、路由拆组                                     | 无     |
| 3C  | `app upload` / `app deploy` 命令，两个模板同步                                          | 3A、3B |
| 3D  | `deploymentMode`、auto 触发、`X-Hub-Deployment-Intent`、部署幂等、`--wait`              | 3C     |

3A 和 3B 可以并行，且各自都能单独合入而不改变对外行为：3A 完成后现有 Session 上传就不再把制品读进内存，3B 完成后 API Key 可用但还没有命令调用它。

**3D 是与第二阶段唯一的接触面**，放到最后，那时第二阶段的形状应该更清楚。

## 8. 验收

- `pnpm build --tar` 的产物能被 `app upload` 上传，参数与环境变量都生效，`--json` 输出稳定。
- API Key 只能访问绑定的 App，缺 scope 返回 403，明文只返回一次，不出现在任何日志或持久化数据里。
- 大制品流式接收，超限和各类失败都清理临时文件，不留孤儿 artifact。
- 相同 checksum 或相同幂等键不会重复创建 Release；同版本不同 checksum 可以共存。
- manual 只保存 Release，auto 会创建部署，两者走同一个部署入口。
- auto 模式下 `--deploy` 在读取请求体前被拒绝，不保存任何数据。
- `publish --deploy` 断线后用相同的两个幂等键重试，不产生第二个 Release 或第二个部署。
- `--wait` 超时或结果不明不返回成功；manual 只发布时 `--wait` 被本地拒绝。
- 现有 Session 用户的 Hub 页面和权限行为不回归。

## 9. 待确认

- `manage-api-keys` 除 `hub-administrator` 外是否给 `hub-operator`。
- `(appId, checksum)` 唯一约束对存量重复数据的处理策略：保留最早、保留最新，还是要求人工处理。
- auto 模式下 Hub 重启导致自动部署被判失败（见 3.3），第三阶段是否要在页面上给出显式提示，还是完全留给第二阶段。
- `app-template-hub` 是否要支持「Hub 自身作为被发布 App」，这决定它是否接入发布命令。

## 2026-09-16 实现校准

上文保留为原始方案，当前实现以用户后续确认和代码为准：复用独立 API Key 插件；Hub 全局管理 Key，可绑定多个 App 或所有当前及未来 App；只使用现有 `upload-release`、`deploy` 权限点；Hub 自己处理 App 绑定、当前拥有者权限与密钥加密恢复。原方案的单 App Key、额外 read-operation scope 和自建凭证哈希表均不采用。

CLI 上传命令采用 `app upload`，不提供发布别名；Default、Examples 模板提供相同命令。`upload --deploy` 改为一次 HTTP 请求，在同一数据库事务保存 Release 和部署记录，不再依赖两次请求和两份幂等键。`app deploy` 仍支持独立部署及独立幂等。部署结果通过专门的精简状态接口读取，复用 deploy 权限，不返回配置与诊断信息。上传 --wait 必须同时传 --deploy，否则 CLI 在本地直接拒绝。

存量重复 Release 不删除、不修改既有部署引用；新增唯一的 App/checksum 映射，保留最早 Release 作为后续上传的复用对象。用户明确取消自动/手动部署配置及默认值：上传只创建 Release，是否部署由 --deploy 或独立 app deploy 命令决定；CI 自动化由调用方脚本控制。Hub 重启后的协调恢复不在本阶段重做；相关限制保留在包 README 中。

已应用到本地数据库的早期 publishing migration 曾添加 deploymentMode；新增后续 migration 删除该字段，不在运行时代码保留模式分支。

用户进一步确认 `upload`、`deploy` 均支持可选 `--config`，用于首次部署或显式更换运行配置；不传时沿用现有配置。仅 upload 不带 --deploy 时拒绝 --config。配置通过请求正文传输，复用 Hub 现有整份配置与 secret 处理，不写入 Release 制品或模板。已上传制品换配置走独立 deploy；上传重试若显式配置不同则报冲突。
