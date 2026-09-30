# NocoBase 3 HTTP API 规范方案（草案）

> 状态：方案稿，待拍板。本文是给工程师的完整细则，基于 HTTP API 体检报告（develop @ fac3d58f）提出统一规范和落地路径；给决策者的版本见同目录的 `http-api-spec-proposal.html`。文末「决策记录」列出了已确定的取舍。

## 1. 结论

采用 **Google API 设计指南（AIP）的面向资源模型**作为主规范，在三处做本地化裁剪：Repository 查询接口保留为独立的「查询端点」家族；错误体和成功体用更轻的 JSON 信封；分页只保留游标和页码两种模式。OpenAPI 3.1 用 `hono-openapi` + `zod` 从路由定义生成，Repository 路由从 exposure 配置自动生成。

一句话概括规则：**能用标准方法（List/Get/Create/Update/Delete）表达的，就映射到 HTTP 动词；表达不了的，用 `POST /资源/动词` 的自定义方法，而不是发明新的 URL 形状。**

与 AIP 的唯一结构性差异：AIP-136 用冒号分隔自定义方法（`/books/1:archive`），我们用斜杠（`/books/1/archive`）。原因见第 3.3 节。

## 2. 为什么不是纯 RESTful，也不是纯 RPC

report 里列出的接口大致分三类：

| 类型             | 例子                                                            | 纯 REST 的问题                                                                                                       |
| ---------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 标准 CRUD        | users、api-keys、schedules、roles                               | 没问题                                                                                                               |
| 资源上的动作     | 部署、回滚、启停、reveal key、标记已读、发布                    | REST 只能硬塞成 `PATCH /status`、`PUT /active`、`POST /:id {action}`，这正是 report 里「启用/停用有 4 种写法」的来源 |
| 带复杂查询体的读 | Repository 的 `findMany`/`aggregate`/`groupBy`，body 是一棵 AST | GET 不能可靠携带 body，塞进 query string 又放不下                                                                    |

纯 REST 没有「动作」这个一等概念，所以每个插件都各自发明了一种绕法。纯 RPC（全部 `POST /xxx:action`，也就是 NocoBase 2 的风格）对外部调用方不友好：HTTP 缓存、幂等语义、OpenAPI 工具链、网关都依赖动词语义，而且 ai-employee 已经证明「v2 式 resource:action 配 GET/PUT/DELETE」会变成第三种不兼容的方言。

AIP 恰好处在两者之间：标准方法就是 REST，动作用自定义方法显式表达。我们的 Repository 路由本来就是「集合 + 动作」的形状，迁移成本最低。AIP 也是公开、成文、可引用的规范（aip.dev），以后写 Skill 和评审时可以直接说「按 AIP-136 处理」，不需要自己维护全部细节。

我们不照搬 AIP 的部分：gRPC/protobuf 相关的一切、`google.rpc.Status` 的 `@type`/`Any` 包装（语义保留，见第 6 节）、AIP-160 的字符串过滤语法（我们已经有类型化的 Repository filter AST）、字段掩码 `updateMask`、`/v1/` 这种路径版本（现阶段不做版本，见第 9 节）、自定义方法的冒号分隔符（改用斜杠，见第 3.3 节）。

## 3. URL 与资源命名

### 3.1 基本形状

```
/api/{collection}                       集合
/api/{collection}/{id}                  单个资源
/api/{collection}/{id}/{subCollection}  子资源集合（最多两层嵌套）
/api/{collection}/{id}/{verb}           资源上的自定义方法
/api/{collection}/{verb}                集合上的自定义方法（批量、查询等）
```

- URL 里的每一段（集合名、单例名、自定义方法动词、插件命名空间）一律 **camelCase**：`/api/hub/apiKeys`、`/api/ai/mcpServers`、`/api/workflow/workflows/{id}/revisions`。集合名用复数。与 JSON 字段一致，也是 AIP-122 的要求。现存的 kebab（`/api-keys`、`/permission-sets`、`/database-explorer`、`/notifications/in-app`）全部迁移。
- 插件路由挂在 `/api/{插件短名}/` 下；插件的主资源与插件同名时省掉一层（`/api/users/{userId}` 而不是 `/api/users/users/{userId}`）。框架在启动时检测两个插件占用同一地址并报错。
- 路径参数统一叫 `{资源单数}Id`（`appId`、`releaseId`），同一个路由文件里不能一会儿 `:id` 一会儿 `:runId`。
- 单例资源（每个父资源只有一个）用单数：`/api/hub/apps/{appId}/config`、`/api/me`、`/api/i18n/locale`（当前用户的 locale 是单例；可用 locale 列表是集合 `/api/i18n/locales`，两者都保留，但语义要写清楚）。
- 自定义方法动词用 camelCase：`:deploy`、`:rollback`、`:enable`、`:disable`、`:reveal`、`:markRead`、`:batchDelete`。

### 3.2 标准方法映射（AIP-131 ~ 135）

| 方法                | HTTP     | 路径                   | 请求                                 | 成功响应                  |
| ------------------- | -------- | ---------------------- | ------------------------------------ | ------------------------- |
| List                | `GET`    | `/apps`                | query：分页、排序、搜索              | `200 {data: [...], meta}` |
| Get                 | `GET`    | `/apps/{appId}`        | —                                    | `200 {data}`              |
| Create              | `POST`   | `/apps`                | body：资源                           | `201 {data}`              |
| Update              | `PATCH`  | `/apps/{appId}`        | body：要改的字段（未出现的字段不变） | `200 {data}`              |
| Replace（单例配置） | `PUT`    | `/apps/{appId}/config` | body：完整资源                       | `200 {data}`              |
| Delete              | `DELETE` | `/apps/{appId}`        | 无 body                              | `204`，无响应体           |

- `DELETE` 不带 body。需要二次确认的删除（如 `DELETE /users/:id {confirm:true}`）改成 query 参数 `?confirm=true`，或者改成自定义方法 `POST /users/{userId}/delete`。
- `PUT` 只用于单例或客户端指定 id 的完整替换，普通更新一律 `PATCH`。
- 「创建或更新」（upsert）不要伪装成 `create`：要么拆开，要么显式用自定义方法 `/upsert`。

### 3.3 自定义方法（AIP-136，分隔符改为斜杠）

- 一律 `POST`，除非是纯读取且参数能放进 query，此时用 `GET`（如 `GET /apps/{appId}/preview`，很少见）。
- 状态切换统一为两个自定义方法：`POST /workflows/{id}/enable`、`POST /workflows/{id}/disable`。删掉 `PATCH /status`、`PUT /active`、`POST /:id {action}` 等变体。
- 批量操作放在集合上：`POST /notifications/batchDelete {ids}`、`POST /inAppMessages/markAllRead`。
- **`GET` 必须是安全的**：不写库、不派发任务、不写 cookie。report 列出的 `GET /queue-example`、`getMessages?updateRead=true`、`GET /in-app/csrf` 都要改成 `POST` 或拆成独立的自定义方法。

命名规则（AIP-136）：

- 动词或「动词 + 名词」，camelCase：`/deploy`、`/markRead`、`/translateText`。
- 不用标准方法的动词（get / list / create / update / delete）：`aiSkills:getDetails`、`listAll` 这类改成标准方法。
- 不带介词：`/sendToUser` 改为 `/send` + `{ userId }`。
- 不带 `Async`：耗时操作返回可轮询的资源（见第 7 节）。
- 三种形态：资源级 `/{collection}/{id}/{verb}`；集合级 `/{collection}/{verb}`；无状态 `/{scope}/{verbNoun}`（如 `/api/ai/translateText`，不要造假集合 `/text/translate`）。
- **动作一律是动词，子资源一律是复数名词**（`/users/{id}/activate` 与 `/users/{id}/roles`）。冒号原本在地址上就能区分两者，改用斜杠后只能靠命名区分。

为什么不用冒号：AIP-136 要求 `:` 分隔（`/books/1:archive`），但 Hono 不支持「参数后在同一段接字面量」。在 hono 4.13 上实测，`/users/:id{[^:]+}:activate` 在默认 SmartRouter 下静默 404，只有 PatternRouter 能匹配；可用的正则写法 `/users/:id{[^/]+:activate}` 会把后缀带进参数，需要框架 helper 剥离，并让整个应用从 RegExpRouter 退回 TrieRouter。带冒号的路径在部分 OpenAPI 工具里也容易被误认成 Express 风格参数。改用斜杠后，路由是 Hono 原生写法 `app.post('/users/:userId/activate')`，OpenAPI 路径是最常规的 `/users/{userId}/activate`。业界同样写法：Stripe `POST /v1/payment_intents/{id}/confirm`、GitHub `PUT /repos/{owner}/{repo}/pulls/{number}/merge`。

斜杠带来的约束：固定名字的段与 `{id}` 在同一层竞争（`GET /users/options` 与 `GET /users/{userId}`）。Hono 按注册顺序匹配且不报错，实测先注册 `/users/:userId` 时 `/users/options` 会被它吃掉。框架在注册阶段把固定段排在参数段之前，并在启动时检测遮挡直接报错。

路径里的 ID 一律由客户端 `encodeURIComponent` 编码（`SKU:001` → `SKU%3A001`，`a/b` → `a%2Fb`），框架拿到的参数值已解码。

### 3.4 Repository 查询端点

Repository 路由是本规范里唯一的「全 POST」家族，这是有意保留的第一类例外：

```
POST /api/{repositoryName}/findMany
POST /api/{repositoryName}/findOne
POST /api/{repositoryName}/count | /exists | /aggregate | /groupBy
POST /api/{repositoryName}/createOne | /updateOne | /deleteOne
```

路径分隔符随全局规则由 `:` 改为 `/`（现为 `POST /api/users:findMany`，改为 `POST /api/users/findMany`），改动集中在 `repository-routes.ts` 的生成器和前端 Repository 客户端两处；动作名、请求体、全 POST 保持不变。暴露名不得包含 `/` 和 `:`。

保持全 POST 的理由：它的输入是类型化的 filter/appends AST，只有 body 放得下；它由 exposure 配置生成，形状天然统一；它已经有 1 MiB 限制、JSON Content-Type 强制、键白名单这些最好的实践。

对照 AIP-136，这套端点的合规情况：

| 规则                                                                 | 读（findMany/findOne/count/exists/aggregate/groupBy） | 写（createOne/updateOne/deleteOne）                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| URI 用 `:verb`（MUST）                                               | 不符合，全局改用斜杠，见第 3.3 节                     | 同左                                                                                  |
| 集合键是字面量（MUST）                                               | 符合                                                  | 符合                                                                                  |
| 动词 camelCase（MUST）                                               | 符合                                                  | 符合                                                                                  |
| 只读方法用 GET；payload 可能超出 URL 长度时 MAY 用 POST              | 符合：filter AST 就是这种情况                         | —                                                                                     |
| 有副作用的方法用 POST（MUST）                                        | —                                                     | 符合                                                                                  |
| 动词不应是标准方法的动词 Get/List/Create/Update/Delete（SHOULD NOT） | `findMany`/`findOne` 措辞避开了，但语义就是 List/Get  | **偏离**：`createOne`/`updateOne`/`deleteOne` 就是 Create/Update/Delete               |
| 能建模成资源的，自定义方法必须作用在资源上（MUST）                   | 集合级查询，符合                                      | **可争议**：`updateOne`/`deleteOne` 按 filter 定位记录而不是按 `{id}`，不是资源级方法 |

结论：读端点完全合规；写端点偏离了一条 SHOULD NOT，另一条 MUST 取决于怎么解读「能建模成资源」。它们按 filter + `ifVersion` 定位记录，这本来就不是 `PATCH /{name}/{id}` 能表达的语义（按任意唯一条件更新、带乐观锁），所以我认为这是有理由的偏离，不值得为了字面合规拆出第二套入口。规范里把它写成**成文例外**：Repository 端点由框架生成，插件手写的路由不得模仿 `findMany`/`createOne` 这套动词，手写的标准操作一律走第 3.2 节。

需要同步改的只有错误体：Repository 现在返回平铺的 `{code, message}`，要迁到第 6 节的形状。

### 3.5 第三方认证端点

`app-plugin-authentication` 把 Better Auth 挂在 `/api/auth/*`，登录、注册、会话，以及 `app-plugin-api-keys` 提供的个人 API Key（`/api/auth/api-key/create`、`/list`、`/update`、`/delete` 等）都由 Better Auth 注册，URL、方法和响应体由它决定。这是第二类成文例外：

- 不包装、不转发，保持 Better Auth 原样，跟随它的升级。
- OpenAPI 里单独归为 `Authentication` tag，注明来源并链接 Better Auth 文档；能用 Better Auth 自带的 OpenAPI 插件生成时直接合并。
- 例外只覆盖 Better Auth 注册的端点。我们自己写的认证相关路由（如 Hub 的 `/api/hub/apiKeys`）照常遵守本规范。

## 4. 请求

- 请求体只接受 `application/json`（文件上传用 `multipart/form-data`），其他 Content-Type 返回 415。这也是 CSRF 的第一道防线，所以要在框架层统一做，而不是只在 Repository 路由里做。
- 所有请求体和 query 用 zod schema 在 HTTP 层校验，不允许 `c.req.json<T>()` 这种仅类型断言的读取。
- 全局默认 body 上限 1 MiB，个别路由（上传、导入）显式放宽。
- 搜索参数统一叫 `q`；排序统一叫 `orderBy`，形如 `orderBy=createdAt desc,name`（AIP-132）。
- 非法参数一律 400，不静默截断，不透传 `NaN`。

## 5. 响应

### 5.1 成功体

```json
{ "data": { ... } }
{ "data": [ ... ], "meta": { "nextPageToken": "..." } }
```

- 成功体永远是对象，顶层只有 `data` 和可选的 `meta`。不返回裸 JSON、裸数组、`{success:true}`、`{rows,count}`、`{updated}`。
- 没有返回内容的操作用 `204`；自定义方法如果有「结果」就放进 `data`（如 `:reveal` 返回 `{data:{key}}`）。
- 流式响应（NDJSON、SSE、文件下载）是显式例外，在 OpenAPI 里声明各自的 media type。

### 5.2 字段约定

- JSON 字段 camelCase。
- **ID 一律序列化为字符串。** 我们用 snowflake，64 位整数超过 JS 的安全整数范围，按数字返回会被外部调用方静默截断。
- 时间用 RFC 3339 字符串（`2026-09-30T08:00:00.000Z`），字段名以 `At` 结尾：`createdAt`、`updatedAt`、`deletedAt`。
- 枚举值用 camelCase 字符串（`status: "running"`），错误码例外，见下。
- 布尔字段不加 `is` 前缀：`enabled` 而不是 `isEnabled`。

### 5.3 分页（AIP-158 的简化版）

只允许两种模式，由框架提供共享 helper：

| 模式         | 请求                            | 响应 `meta`                         | 适用                         |
| ------------ | ------------------------------- | ----------------------------------- | ---------------------------- |
| 游标（默认） | `pageSize`、`pageToken`         | `nextPageToken`（没有下一页时省略） | 列表、消息流、外部 API       |
| 页码         | `page`（从 1 开始）、`pageSize` | `page`、`pageSize`、`total`         | 需要跳页和总数的管理后台表格 |

`pageSize` 默认 20、上限 100，超出上限按上限处理（这是 AIP 允许的行为，不算静默截断）；非正数或非整数返回 400。Repository 的 `limit/offset/cursor` 保持现状，它们是查询 AST 的一部分，不属于这里的 List 方法。

## 6. 错误

### 6.1 AIP-193 的要求

AIP-193 规定错误体是 `google.rpc.Status` 的 JSON 映射，顶层包一层 `error`：

```json
{
  "error": {
    "code": 429,
    "message": "The zone 'us-east1-a' does not have enough resources available...",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "RESOURCE_AVAILABILITY",
        "domain": "compute.googleapis.com",
        "metadata": { "zone": "us-east1-a", "vmType": "e2-medium" }
      },
      {
        "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
        "locale": "en-US",
        "message": "..."
      },
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        "links": [{ "description": "...", "url": "https://..." }]
      }
    ]
  }
}
```

要点：

- `code` 是 HTTP 状态码（数字），`status` 是 17 个规范码之一（`INVALID_ARGUMENT`、`NOT_FOUND`、`PERMISSION_DENIED` 等）。
- **每个错误必须带 `ErrorInfo`**：`reason` 是 UPPER_SNAKE_CASE、不超过 63 字符的机器码；`domain` 全局唯一，标识是谁定义的这个 reason；同一种错误永远是同一对 `(reason, domain)`，客户端按它分支。
- **message 里的动态部分必须同时出现在 `ErrorInfo.metadata` 里**，机器调用方不需要解析 message。metadata 的键是 camelCase。
- `message` 面向开发者；面向最终用户的本地化文案放 `LocalizedMessage`（带 BCP 47 `locale`）；需要进一步指引时加 `Help` 链接。
- 每种 detail 类型最多出现一次。
- **先鉴权再判存在**：无权访问时，不论资源是否存在都返回 403；只有有权且资源不存在才返回 404。

### 6.2 我们的错误体（AIP-193 简化版）

保留 AIP 的语义，去掉 protobuf `Any` 的 `@type` 包装，把 `ErrorInfo` 拍平到 `error` 上：

```json
{
  "error": {
    "code": 404,
    "status": "NOT_FOUND",
    "reason": "WORKFLOW_NOT_FOUND",
    "domain": "workflow",
    "message": "Workflow 42 was not found.",
    "metadata": { "workflowId": "42" },
    "localizedMessage": { "locale": "zh-CN", "message": "工作流 42 不存在。" },
    "fieldViolations": [
      { "field": "pageSize", "description": "must be a positive integer" }
    ],
    "requestId": "7f1c..."
  }
}
```

| 字段               | 必填 | 对应 AIP                     | 说明                                                                                  |
| ------------------ | ---- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `code`             | 是   | `Status.code`                | HTTP 状态码                                                                           |
| `status`           | 是   | `google.rpc.Code` 名         | 17 个规范码之一，客户端做粗粒度分支                                                   |
| `reason`           | 是   | `ErrorInfo.reason`           | 机器码，UPPER_SNAKE_CASE，≤63 字符                                                    |
| `domain`           | 是   | `ErrorInfo.domain`           | 框架错误用 `core`，插件错误用插件短名；与 `reason` 一起唯一标识错误                   |
| `message`          | 是   | `Status.message`             | 面向开发者，英文，稳定                                                                |
| `metadata`         | 否   | `ErrorInfo.metadata`         | message 里的动态值都要放在这里；值一律字符串                                          |
| `localizedMessage` | 否   | `LocalizedMessage`           | 按 `Accept-Language` 生成的用户可读文案；notification 现有的 `ns/key/params` 迁到这里 |
| `fieldViolations`  | 否   | `BadRequest.fieldViolations` | 仅 400 校验错误；`field` 用点路径（`values.email`）                                   |
| `helpUrl`          | 否   | `Help.links`                 | 绝对 URL                                                                              |
| `requestId`        | 是   | `RequestInfo.requestId`      | 与响应头 `X-Request-Id` 相同                                                          |

这样外部调用方按 AIP 的心智模型读得懂，我们也不需要为了 `@type` 引入一套 protobuf 概念。现有的 7 种错误体全部迁到这一种，Repository、authorization、users 的平铺 `{code, message}` 也要改：它们现在的 `code: "RECORD_NOT_FOUND"` 变成 `reason`，`code` 字段改成数字状态码。

### 6.3 状态码与 `status`

按 AIP 的规范码映射，插件只能从这张表里选，具体原因写在 `reason` 里：

| HTTP | `status`              | 用于                                                |
| ---- | --------------------- | --------------------------------------------------- |
| 400  | `INVALID_ARGUMENT`    | 请求格式错、参数非法、校验失败（与状态无关）        |
| 400  | `FAILED_PRECONDITION` | 当前状态不允许该操作，如对已停用的工作流触发执行    |
| 400  | `OUT_OF_RANGE`        | 参数合法但越界，如翻页超出末尾                      |
| 401  | `UNAUTHENTICATED`     | 未认证                                              |
| 403  | `PERMISSION_DENIED`   | 无权；先于存在性检查                                |
| 404  | `NOT_FOUND`           | 有权但资源不存在                                    |
| 409  | `ALREADY_EXISTS`      | 唯一键冲突                                          |
| 409  | `ABORTED`             | 并发冲突，如 `ifVersion` 不匹配                     |
| 413  | `INVALID_ARGUMENT`    | body 过大，`reason: BODY_TOO_LARGE`                 |
| 415  | `INVALID_ARGUMENT`    | Content-Type 不对，`reason: UNSUPPORTED_MEDIA_TYPE` |
| 429  | `RESOURCE_EXHAUSTED`  | 限流、配额                                          |
| 499  | `CANCELLED`           | 客户端取消（仅日志，一般不会真的发出去）            |
| 500  | `INTERNAL`            | 未预期错误；message 固定为通用文案，不回显异常原文  |
| 501  | `UNIMPLEMENTED`       | 方法未实现                                          |
| 503  | `UNAVAILABLE`         | 依赖不可用、维护中                                  |
| 504  | `DEADLINE_EXCEEDED`   | 超时                                                |

不使用 422，校验失败统一 400。注意 AIP 把「状态不允许」映射为 400 `FAILED_PRECONDITION` 而不是 409，这点和不少 REST 习惯不同，我们照 AIP 来。

### 6.4 框架兜底

- 提供 `HttpError`（或复用并扩展 `DomainError`），插件抛它，由根路由的 `onError` 统一序列化。插件不在 handler 里手拼错误 JSON。
- 根路由加 `onError` 和 `/api/*` 的 JSON `notFound`；SPA 通配路由排除 `/api`。
- 不再按正则匹配 message 推断状态码（ai-employee 的 `statusForError`），也不再把任意 `TypeError` 映射成 400。

## 7. 横切约定

- `X-Request-Id`：接受入站值（校验格式），否则生成；写回响应头、放进 context 和错误体。
- `Accept-Language` 是唯一的语言协商方式。
- 认证：浏览器用 session cookie，外部调用方用 `Authorization: Bearer <apiKey>`，两者由同一个认证中间件处理，插件只声明「需要什么权限」。
- 全局中间件：`secureHeaders`、默认 `bodyLimit`、Content-Type 检查、超时。
- 幂等：`PUT`/`DELETE`/`GET` 天然幂等；需要客户端重试安全的 `POST`（如创建、部署）可选支持 `Idempotency-Key` 头，P2 再做。
- 长时间操作（部署、导入）返回 `202` + 一个可轮询的资源（Hub 已经有 `deployments` 资源，就返回它），不另外发明 AIP-151 的 Operation 模型。

## 8. OpenAPI 生成

### 8.1 手写路由

用 `hono-openapi` + `zod`（zod 已在 catalog 里）。框架在 `@nocobase/app-server` 提供一层很薄的封装，让「按规范写」比「不按规范写」更省事：

```ts
import { defineApiRoutes, api } from '@nocobase/app-server';
import { z } from 'zod';

const App = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export default defineApiRoutes((app) => {
  const r = api.router({ prefix: '/hub', tag: 'Hub' });

  r.list(
    '/apps',
    { query: api.cursorPage(), response: App, summary: 'List apps' },
    async (c, q) => {
      return listApps(q); // helper 负责包成 {data, meta}
    },
  );

  r.custom(
    '/apps/{appId}/deploy',
    { body: DeployInput, response: Deployment, status: 202 },
    async (c, input) => {
      return deploy(c.req.param('appId'), input);
    },
  );

  return r.hono;
});
```

这层封装负责：注册 `describeRoute` 元数据和 zod 校验中间件；把返回值包成 `{data}` / `{data, meta}` 并设置正确状态码（Create 201、Delete 204）；把固定段排在参数段之前并检测路由遮挡；校验失败时抛统一的 400。API 名字只是示意，具体设计在实现时再定。

### 8.2 Repository 路由

exposure 配置已经有 name、collection、actions、policy，`@nocobase/repository-input` 有输入的 TypeScript 类型。生成器按 action 输出 path 和请求体 schema；响应体的记录 schema 从 Collection 字段定义推导。这部分约 150 个接口零手写。

### 8.3 Better Auth 端点

启用 Better Auth 的 `openAPI()` 插件，用 `auth.api.generateOpenAPISchema()` 取得它的 OpenAPI 3.1 文档，路径加上 `/api/auth` 前缀后合并进总文档，归入 `Authentication` tag。关闭它自带的 `/api/auth/reference` 页面（`disableDefaultReference: true`），全应用只有一个文档入口。

### 8.4 合并

文档按应用生成，不是按仓库：应用启动时收集已注册插件的路由声明、Repository exposure 和 Better Auth 文档，合并成一份 OpenAPI 3.1，按插件分 tag。每个应用装的插件不同，文档也不同。官方插件另在文档站发布各自的片段。

未声明 schema 的 `/api` 路由在 CI 里报错：`hono-openapi` 的 `includeEmptyPaths: true` 能列出所有未描述的路由，检查它们为空。

### 8.5 发布与守护

- `GET /api/swagger`：OpenAPI 3.1 原始 JSON，给程序和工具读，也可以直接下载分发。
- `GET /api/swagger/docs`：Swagger UI 页面，读取上面的 JSON 渲染，按 tag 分组，可在线试调。
- `/api/swagger` 这一段由框架保留，插件路由和 Repository 暴露名不得占用，启动时检测冲突报错。
- 访问控制：开发环境无需认证。生产环境默认要求认证，session 或有效 API Key 均可，不要求管理员；匿名返回 401。`/api/swagger/docs` 是不含接口信息的静态壳，可匿名打开，未登录时提示填入 API Key，再带 `x-api-key` 请求 `/api/swagger`。配置可切换为完全公开或生产关闭。文档可见不代表可调用，各路由仍独立鉴权。
- CLI 导出命令暂不做，CLI 部分待定。
- CI 对 spec 做快照 diff，破坏性变更（删字段、改类型、删路由）必须在 PR 里显式确认。
- `@nocobase/api-client` 的类型逐步改为从 spec 生成。

### 8.6 框架接线

- `@nocobase/app-server` 内置 `GET /api/swagger`：`hono-openapi` 的 `generateSpecs(apiRouter, { documentation, exclude })` 扫描手写路由，再合并 `defineOpenApiContribution` 注册的来源（Repository 生成器、Better Auth），首次请求生成后缓存。
- `GET /api/swagger/docs`：`@hono/swagger-ui` 的 `swaggerUI({ url, baseUrl, manuallySwaggerUIHtml })`。它默认从 jsDelivr 加载 `swagger-ui-dist`，内网和离线部署会打不开，所以 `baseUrl` 指向 `GET /api/swagger/assets/*`，由服务端直接提供 `swagger-ui-dist` 的文件；`manuallySwaggerUIHtml` 实现未登录时先提示填入 API Key。
- 依赖：`hono-openapi`、`@hono/swagger-ui`、`swagger-ui-dist` 都在服务端运行时被加载，按仓库规则放进 `@nocobase/app-server` 的 `dependencies`。
- Better Auth：认证插件在 `betterAuth()` 的 plugins 里加 `openAPI({ disableDefaultReference: true })`，`Auth` 类新增 `generateOpenAPISchema()` 转调 `auth.api.generateOpenAPISchema()`，结果加 `/auth` 前缀、归入 `Authentication` tag 后通过 `defineOpenApiContribution` 交给框架。Better Auth 输出的路径是否已带 basePath，实现时对照实际输出确认。

### 8.7 接口类型声明规范

每个 `/api` 手写路由必须满足，CI 检查：

- `describeRoute` 至少有 `tags`（插件名 PascalCase）、`summary`（英文动宾短语）、`operationId`（插件短名 + 动词 + 资源，camelCase，全局唯一，如 `hubDeployApp`）。
- 用到的输入类别都用 `validator('param' | 'query' | 'json', Schema)` 声明；handler 只用 `c.req.valid()`，禁止 `c.req.json<T>()`、`c.req.query()` 直接读。
- 输入对象按类别区分：

  | 输入类别          | 写法             | 遇到多余字段                           |
  | ----------------- | ---------------- | -------------------------------------- |
  | 请求内容（json）  | `z.strictObject` | 返回 400，`fieldViolations` 指出字段名 |
  | 查询参数（query） | `z.object`       | 静默去掉，handler 拿不到，不报错       |
  | 路径参数（param） | `z.object`       | 路由已限定，不会有多余                 |

  请求内容严格是为了让拼错的字段名报错、拒绝偷塞字段，与 Repository 路由的键白名单一致，也与谷歌云 API 对未知字段返回 400（`Unknown name`）的行为一致。查询参数放宽是为了不误伤前端库、代理自动附加的 `_t` 等参数；zod 4 的 `z.object` 默认剥离未声明字段，handler 仍只拿得到声明过的参数。前端提交修改时只传要改的字段，不把查询结果整个提交回来。

- 每个成功状态码声明响应，用框架的 `dataOf` / `listOf` 包出 `{data}` / `{data, meta}`；错误响应引用 `errorResponses(...)` 统一组件。
- 字段 camelCase；ID `z.string()`；时间 `z.iso.datetime()`；枚举 `z.enum`；`.optional()` 与 `.nullable()` 语义分开；禁止 `z.any()`，`z.unknown()` 须写说明。
- 对外字段 `.meta({ description })`；复用对象 `.meta({ ref })`，以插件名 PascalCase 开头（`HubDeployment`）。
- 声明放在 `server/routes/schemas.ts`（多了拆成 `schemas/` 目录），服务层类型用 `z.infer` 导出，不另写 `interface`。
- 流式和文件响应声明各自 media type。
- CI：`includeEmptyPaths` 列出未声明的 `/api` 路由必须为空；`tags`、`summary`、`operationId` 必填且 `operationId` 不重复；spec 快照 diff。

## 9. 版本

现阶段不做 API 版本。接口的破坏性变更通过插件包的 major 版本表达，OpenAPI spec 的版本号跟随应用版本。等 Hub 的对外接口稳定、有了需要长期兼容的外部调用方，再单独设计版本和弃用策略。

## 10. 与现状的对照

下表的新路径暂按「带插件前缀」书写，Q3 定下来后再统一调整。

| 现状                                                                          | 规范后                                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /aiSkills:list`、`GET /aiSkills:get?key=x`、`PUT /aiSkills:update?key=x` | `GET /ai/skills`、`GET /ai/skills/{name}`、`PATCH /ai/skills/{name}` |
| `PATCH /workflows/:id/status` + `POST /workflows/:id/enable`                  | 只保留 `POST /workflows/{id}/enable` / `/disable`                    |
| `POST /apps/:appId/deploy`、`/stop`、`/start`、`/restart`                     | `POST /hub/apps/{appId}/deploy` 等（路径本来就对，只统一动作语义）   |
| `POST /api-keys/:keyId/reveal`                                                | `POST /hub/apiKeys/{keyId}/reveal`                                   |
| notification `POST /:id {action}`                                             | `POST /notificationInApp/messages/{id}/markRead`、`DELETE .../{id}`  |
| `DELETE /users/:id` 带 body                                                   | `DELETE /users/{userId}?confirm=true`                                |
| 7 种错误体 + 纯文本 500                                                       | 唯一的 `{error:{code,status,reason,domain,message,...}}`             |
| `/api-keys`、`/permission-sets`、`/database-explorer`                         | `/apiKeys`、`/permissionSets`、`/databaseExplorer`                   |
| `{rows,count,totalPages}`、`{items,total}`、`{data,nextCursor}`               | `{data, meta}` 两种分页模式                                          |

## 11. 落地顺序

与 report 的路线一致，这里只补充与规范相关的部分：

1. **P0 定规范、做兜底**：本文定稿后浓缩成 `AGENTS.md` 的一节和 `nocobase-plugin-development`、`nocobase-app-development` 两个 Skill 里的一份 reference，修掉 Skill 里的反例；框架加 `onError`、JSON 404、`X-Request-Id`、`HttpError`；`create-plugin` 模板的路由样例按规范重写。
2. **P1 框架 helper + OpenAPI**：实现第 8.1 节的封装和 Repository spec 生成器；先迁移 Hub（有外部调用方），再迁 users、authorization；`api-client` 同步只解析新错误体（迁移期兼容旧形状）。
3. **P1 存量迁移**：按外部影响从大到小迁 notification、scheduler、i18n、workflow、ai-employee。插件和前端在同一个 monorepo，URL 改名一次改完前后端，**不保留旧路由**，Hub 也不例外。
4. **P2 守护**：spec 快照进 CI；契约测试扫描所有路由，断言 4xx/5xx 形状；lint 规则禁止 `c.req.json<T>()` 和手拼错误 JSON。

### 发版

所有改动了 HTTP 接口的包，changeset 一律 `major`，summary 写清楚改了哪些路径和响应形状，给出旧 → 新的对照。仓库当前处于 `beta` 预发布模式，major 的实际效果是：

- `0.x.y-beta.n` 的包（authorization、scheduler、i18n、notification 等）→ `1.0.0-beta.0`
- `1.0.0-beta.n` 的包（app-server、app-client、hub、workflow、users、ai-employee、authentication）→ `2.0.0-beta.0`

后一组会在从未发过 1.0.0 正式版的情况下直接跳到 2.x。

## 12. 决策记录

| #   | 问题             | 结论                                                                                           |
| --- | ---------------- | ---------------------------------------------------------------------------------------------- |
| Q1  | 错误体形状       | AIP-193 简化版，见第 6.2 节                                                                    |
| Q2  | URL 大小写       | 全部 camelCase                                                                                 |
| Q3  | 插件命名空间     | 选项 C：插件路由挂在 `/api/{插件短名}/` 下；主资源与插件同名时省掉一层；框架启动时检测地址冲突 |
| Q4  | API 版本         | 现阶段不做                                                                                     |
| Q5  | Repository 端点  | 保持全 POST 和动作名，作为成文例外；分隔符随全局改为 `/`，见第 3.4 节                          |
| Q8  | 自定义方法分隔符 | 不用冒号，一律斜杠 `/资源/{id}/动作`，见第 3.3 节                                              |
| Q7  | Better Auth 接口 | `/api/auth/*` 由第三方库注册，保持原样，作为第二类例外，见第 3.5 节                            |
| Q6  | 迁移节奏         | 一次性改名，不留旧路由；改动的包发 major                                                       |

### Q3 现状与选项

现在的插件路由**没有**统一带插件短名，框架也不检查冲突，Hono 按注册顺序先匹配先得：

| 情况                 | 插件                                                            | 当前挂载                                                                                 |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 带插件名前缀         | hub、database-explorer、i18n、notification-in-app、几个 example | `/hub`、`/database-explorer`、`/i18n`、`/notifications/in-app`、`/authorization-example` |
| 资源名恰好等于插件名 | users、scheduler、notification、workflow                        | `/users`、`/schedules`、`/notifications`、`/workflows`                                   |
| 没有前缀             | ai-employee、authorization、authz-*                             | `/aiSkills`、`/aiEmployees`、`/permission-sets`、`/authz`                                |
| Repository 暴露      | 各插件和模板                                                    | `/{name}:{action}`，直接挂在 `/api` 下                                                   |

可选方案：

- **A. 强制前缀**：一律 `/api/{pluginShortName}/{collection}`。最可预测，冲突天然不存在；代价是 `/api/users/users`、`/api/workflow/workflows` 这种重复，而且 Repository 暴露也要加前缀。
- **B. 顶层段所有权**：不强制前缀，但每个插件在 `defineApiRoutes` 里声明自己占用的顶层段（如 users 插件占 `users`、`roles`），Repository 暴露名同样计入；框架启动时检测重复直接报错，OpenAPI 按声明生成 tag。URL 最短，冲突在启动时暴露而不是静默覆盖。
- **C. A 的变体**：插件主资源与插件同名时可以省掉一层（`/api/users/{userId}`），其余资源挂在前缀下（`/api/users/roles`）。能避免重复，但 `/api/users/roles` 与 `/api/users/{userId}` 会在同一层竞争，需要保证 id 不会等于子集合名，规则上最绕。

最终采用 C。
