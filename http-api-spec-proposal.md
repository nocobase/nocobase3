# NocoBase 3 接口规范方案

我们约 380 个接口原先各写各的，没有统一格式，也没有对外文档。本方案采用谷歌公开的 API 设计规范作为统一标准，一次性把所有插件改到同一套写法上，并据此自动生成对外的接口文档（Swagger）。本稿已按实际定下和实现的规范更新。

依据：HTTP API 体检报告（2026-09-29）　日期：2026-09-30，2026-10-04 按实现更新　当前进度：规范和框架兜底已完成（PR #530），存量迁移已合并（PR #532），接口文档生成在 PR #533 中实现、待合并

> [!IMPORTANT]
> **需要拍板**
>
> - 采用**谷歌 API 设计规范**作为 NocoBase 3 所有接口的统一标准。
> - 现有接口**一次性改到新规范**，不保留旧地址；改动过的插件按破坏性更新发布大版本。
> - 按第 07 节的计划执行，当前进度见第 07 节。

## 01 为什么现在要定规范

接口是程序之间对话的约定：往哪个地址发请求、带什么数据、会收到什么回答。体检发现，这套约定在我们系统里没有统一过，每个插件都有自己的写法。

| 数量 | 问题                                             |
| ---- | ------------------------------------------------ |
| 3 套 | 互不兼容的地址写法                               |
| 7 种 | 出错时的返回格式，另有部分接口出错直接返回纯文本 |
| 4 种 | 「启用 / 停用」这一个动作的写法                  |
| 0 份 | 接口文档，外部开发者只能读源码                   |

这些问题平时藏在代码里，但有三件事让它们必须现在解决：Hub 已经通过 API Key 向外部开放调用；团队大量开发由 AI Agent 完成，它们需要一份机器能读懂的接口说明；接口越多，后面统一的成本越高。

## 02 选哪种规范

业界常见的有三种思路。我们的系统不只是简单的增删改查，还有大量「动作」，比如部署、回滚、启停、标记已读，还有带复杂筛选条件的数据查询。

| 方案                             | 说明                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. 纯 RESTful                    | 最流行，擅长增删改查。但没有「动作」的标准写法，每遇到部署、启停就要各自想办法。我们现在 4 种启停写法，就是这么来的。                                                                                              |
| B. 全部按动作调用                | NocoBase 2 的做法，所有请求都是「对某个东西做某个动作」。写起来自由，但外部工具、网关、缓存都认不出哪些操作是安全的只读，对外接入不友好。                                                                          |
| **C. 谷歌 API 设计规范（采用）** | 介于两者之间：增删改查照 RESTful 写，动作有一套统一的标准写法。谷歌所有云服务都遵循它，规范公开成文（aip.dev），遇到争议有据可查，不用我们自己维护一套细则。我们只做一处调整：动作的分隔符用斜杠，不用谷歌的冒号。 |

另一个好处是迁移成本低：我们最大的一批接口（约 150 个自动生成的数据接口）本来就是「对象 + 动作」的写法，只需要统一分隔符，由框架一处改完。

## 03 新规范的核心规则

完整细则已经写进开发规范（根目录 `AGENTS.md`）和 AI Agent 使用的技能文档（`@nocobase/app-skills` 里的 `references/http-api.md`）。下面是影响最大的几条，每条都附了改动前后的对比。

### 1. 地址统一格式，按插件分区

地址一律用同一种命名风格（camelCase，即 `apiKeys` 这种首字母小写、后续单词首字母大写的写法）。每个插件的接口放在自己的命名空间下，避免不同插件抢同一个地址：

- **命名空间就是包名**：去掉 `app-plugin-` 后转成 camelCase，单数或复数都可以，取读起来像插件主要资源的那个。插件的所有资源都放在这一个命名空间下。
- **主要资源和插件同名时只写一次**：用户插件的用户列表就是 `/api/users`，停用用户是 `/api/users/{userId}/disable`，而不是 `/api/users/users`；工作流插件的其他资源也挂在同一个词下，如 `/api/workflows/runs`。
- **资源名和插件名不同时，命名空间在前**：定时任务插件的计划是 `/api/scheduler/schedules`。
- **挂在别的插件分发器下的插件，沿用宿主的命名空间**：权限插件的地址前缀由 `/api/authz` 改为 `/api/authorization`，三个权限规则插件挂在它下面，分别是 `/api/authorization/defaultAccess`、`/api/authorization/sharingRules`、`/api/authorization/restrictionRules`。
- **保留段**：`/api/swagger`、`/api/auth`、`/api/healthz` 分别留给接口文档、Better Auth 和健康检查。
- **AI 员工是一个特例**：AI 员工本身在 `/api/aiEmployees`，其余 AI 资源（技能、工具、模型、对话等）都在 `/api/aiEmployee/...` 下，不再重复 `ai` 前缀。

两个路由注册了完全相同的请求方式和地址时，应用启动直接报错，不再悄悄让后注册的失效（PR #532 中正在实现）。只是参数名不同不算不同的路由，`/orders/:id` 和 `/orders/:orderId` 是同一个；`/users/{userId}` 和 `/users/findMany` 这种「固定段和参数段重叠」不算冲突，按约定固定段先注册即可，见下文「自定义动作怎么写」。

| 现在                             | 改为                                |
| -------------------------------- | ----------------------------------- |
| `/api/hub/api-keys`              | `/api/hub/apiKeys`                  |
| `/api/authz/permission-sets`     | `/api/authorization/permissionSets` |
| `GET /api/ai/aiSkills:get?key=x` | `GET /api/aiEmployee/skills/x`      |

### 2. 增删改查用标准方式，动作用 `/动作名`

查看、新建、修改、删除，各对应一种固定的请求方式。除此之外的动作，统一写成「对象地址 / 动作名」。同一个动作全系统只有一种写法。

| 现在（启用工作流有两种写法）     | 改为                             |
| -------------------------------- | -------------------------------- |
| `PATCH /api/workflows/42/status` | `POST /api/workflows/42/enable`  |
| `POST /api/workflows/42/enable`  | `POST /api/workflows/42/disable` |

### 3. 「查看」类请求不能改数据

现在有几个接口在「查看」时顺手改了数据，比如打开消息列表就标记已读。浏览器预加载、搜索引擎、缓存都可能在用户不知情时触发它们。新规范里，改数据的操作必须明确发起；`GET` 连顺手的副作用也不能有，比如顺带删除过期数据、改写会话或 Cookie。清理工作交给产生过期数据的写操作，或者交给定时任务。

### 4. 成功时的返回格式统一

所有成功的返回都是 `{ data }`，列表额外带 `meta`（分页信息）。分页只保留两种方式：往下翻页（适合消息流和对外接口）和按页码跳转（适合后台表格）。

| 现在（6 种列表格式）          | 改为                                               |
| ----------------------------- | -------------------------------------------------- |
| `{ rows, count, totalPages }` | `{ data: [...], meta: { nextPageToken } }`         |
| `{ data: { items, total } }`  | `{ data: [...], meta: { page, pageSize, total } }` |
| `{ data, nextCursor }`        |                                                    |

往下翻页的参数名 `pageSize`、`pageToken`、`nextPageToken` 直接沿用谷歌规范（AIP-158）。`nextPageToken` 是服务端给出的「下一页凭证」，调用方原样传回即可，不需要理解其内容。它和数据接口里可以自己组装的查询条件 `cursor` 不是一回事，所以不沿用 `nextCursor` 这个旧名字。

条数有限的配置类列表（如服务商、角色、模板、目录）可以不分页，但仍然返回 `{ data, meta }`，`meta` 里至少有 `total`；其余列表都要分页。`meta` 里可以带标准字段之外的信息。

### 5. 出错时的返回格式统一

7 种错误格式合并成一种，按谷歌规范设计：告诉程序「是哪一类错误」和「具体原因」（程序据此做处理），还附带请求编号，用户反馈问题时可以直接定位到日志；需要时还可以带上面向用户的翻译文案。任何意外错误也会返回这个格式，不再出现纯文本的「Internal Server Error」。

```jsonc
{
  "error": {
    "code": 404, // HTTP 状态码
    "status": "NOT_FOUND", // 错误大类，全系统固定 10 种
    "reason": "WORKFLOW_NOT_FOUND", // 具体原因，程序按它判断
    "domain": "workflows", // 哪个插件定义的这个原因
    "message": "Workflow 42 was not found.", // 给开发者看的英文，不展示给用户
    "localizedMessage": { "locale": "zh-CN", "message": "工作流 42 不存在。" }, // 可选
    "requestId": "7f1c9a…", // 用于排查日志，也在 x-request-id 响应头里
  },
}
```

- **`status` 固定 10 种**：`INVALID_ARGUMENT`、`FAILED_PRECONDITION`、`UNAUTHENTICATED`、`PERMISSION_DENIED`、`NOT_FOUND`、`ALREADY_EXISTS`、`ABORTED`、`RESOURCE_EXHAUSTED`、`INTERNAL`、`UNAVAILABLE`，对应关系见文末附录。不再使用 422（改用 400 的 `INVALID_ARGUMENT` 或 `FAILED_PRECONDITION`），也不再使用 502（改用 503 `UNAVAILABLE`）。413 只用于请求内容超过大小限制，415 只用于不支持的请求内容类型，两者都是 `INVALID_ARGUMENT` 加上 `httpStatus` 得到的，没有别的状态码能这样覆盖。
- **`reason` 是程序判断的依据**，前端只认 `reason`，不解析 `message`。
- **一个插件只有一个 `domain`**，即它的命名空间，哪怕它用了几个地址前缀：AI 员工的错误一律是 `aiEmployees`。转交别的插件的错误时保留原插件的 `domain`，比如用户插件转交的 `LAST_ASSIGNMENT` 仍然是 `authorization`。框架和数据仓库的错误用 `app`。
- **`localizedMessage` 是可选的**，`message` 只给开发者看。
- **另有两个可选字段**：`fieldViolations` 指出哪些字段不合法，`metadata` 放这次出错的其他机器可读信息。

「找不到」分两种情况：地址里指名的资源不存在，返回 404；请求内容或查询参数里引用的资源不存在，返回 400 并在 `fieldViolations` 里指出是哪个字段。比如 `POST /api/hub/apps/7/deploy` 里的应用 7 不存在是 404，请求内容里的 `releaseId` 不存在是 400。

### 6. 先查权限，再看别的

权限检查放在中间件里，排在输入校验之前，也排在「资源是否存在」之前：没有权限的调用方一律得到 403，既不会知道接口要什么参数，也不会知道某个 ID 是否存在。权限检查通过之前，什么都不能写，包括数据库记录和上传的文件。

### 7. 所有输入先校验再处理

每个接口声明自己接受什么数据，不合格的请求在进入业务逻辑前就被拒绝，返回 400 并指出哪个字段有问题。声明用 zod 写：请求内容用 `z.strictObject`，多余字段直接报错；查询参数和路径参数用 `z.object`。上传这类二进制或 multipart 请求，参数和请求头照样校验，请求内容在代码里校验。请求内容的大小上限是可选的：插件按需给路由加 `bodyLimit`，比如上传或输入本应很小的接口，超出时返回 413 `BODY_TOO_LARGE`；应用也可以在 `config.yml` 里用 `api.bodyLimit` 设一个全局上限，默认不开启。不要求每个路由都配。这份声明同时是接口文档的来源，写一次，校验和文档两用（见第 04 节）。

### 8. 数据格式细节统一

ID 一律以文字形式传递，返回和传入都是。我们的 ID 位数很长，按数字处理时，外部 JavaScript 程序会悄悄算错最后几位。时间统一用国际标准格式（RFC 3339）。布尔值就是 `true` / `false`，不用 `0`、`1` 或字符串。字段名统一为 camelCase。

### 自定义动作怎么写

第 2 条里的「动作」，在谷歌规范里叫「自定义方法」（[AIP-136](https://google.aip.dev/136)）。下面按「什么时候用 → 地址怎么写 → 用什么请求方式 → 动作怎么起名」四步说明。

**1. 什么时候用。** 先看能不能用查看、新建、修改、删除这四种标准操作表达。能表达就不要用自定义动作；只有标准操作表达不了、硬套会让含义变味时才用，比如部署、回滚、启停、发送、复制。

**2. 地址怎么写。** 动作作用在谁身上，就接在谁的地址后面，有三种形态：

| 作用对象                       | 写法                  | 例子                                               |
| ------------------------------ | --------------------- | -------------------------------------------------- |
| 某一个具体对象（最常见）       | `/对象集合/{id}/动作` | `POST /api/hub/apps/7/deploy`                      |
| 一整个集合，比如批量处理       | `/对象集合/动作`      | `POST /api/notificationInApp/messages/markAllRead` |
| 不针对任何已有对象的计算类操作 | `/命名空间/动作名词`  | `POST /api/translation/translateText`              |

第三种形态同样遵守命名空间规则：`translation` 是插件的命名空间，`translateText` 是「动词 + 名词」形式的动作名。应用自己的计算类操作没有命名空间，直接写 `/api/translateText`。

**3. 用什么请求方式，返回什么。** 只有两种选择：会改数据或有副作用的，用 `POST`，这是绝大多数情况；纯查看、不改任何东西、参数放得进地址的，用 `GET`。有结果时返回 `200 { data }`，可以是被操作后的对象，也可以是这个动作专门的结果；工作在后台继续进行时返回 `202`；没有任何内容可返回时返回 `204`。删除操作如果在返回后仍在后台继续，也可以返回 `202`。

**4. 动作怎么起名。**

| 规则                                                                                          | 对                                                        | 错                          |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------- |
| 用动词，或「动词 + 名词」，camelCase                                                          | `/deploy`　`/markRead`　`/batchDelete`                    | `/deployment`　`/mark-read` |
| 动作用动词，下属资源用复数名词，一眼能分清                                                    | `/users/5/activate`（动作）、`/users/5/roles`（下属资源） | `/users/5/activation`       |
| 不能用标准操作的动词 get / list / create / update / delete 冒充自定义动作，这些应该用标准操作 | `GET /api/aiEmployee/skills/x`                            | `/getDetails`　`/listAll`   |
| 不带介词（for、with、by、to 等），把条件作为参数传                                            | `/send` + `{ userId }`                                    | `/sendToUser`               |
| 不带 Async 之类描述执行方式的词；耗时的动作返回一个可查询进度的对象                           | `/deploy` → 返回部署记录                                  | `/deployAsync`              |
| 成对的动作用成对的动词                                                                        | `/enable` / `/disable`　`/start` / `/stop`                | `/enable` / `/turnOff`      |

**和谷歌规范的一处差异：用斜杠，不用冒号。** 谷歌的写法是 `/apps/7:deploy`（例如谷歌云 [`services/*:enable`](https://docs.cloud.google.com/service-usage/docs/reference/rest/v1/services/enable)），我们写成 `/apps/7/deploy`，其余规则不变。原因有三个：我们用的服务端框架 Hono 不支持冒号写法，强行支持需要额外的转换层；斜杠是 Swagger 等接口文档工具最原生支持的写法，冒号在部分工具里会被误认；斜杠也是业界更常见的写法，例如 Stripe 的 `POST /v1/payment_intents/{id}/confirm`、GitHub 的 `PUT /repos/{owner}/{repo}/pulls/{number}/merge`。

斜杠带来一个需要兜住的问题：`/workflows/runs` 这种固定段和 `/workflows/{workflowId}` 会在同一层竞争，Hono 按注册顺序匹配，谁先注册谁生效且不报错。规则是插件把固定段注册在 `/:id` 之前；如果 ID 是用户自己起的名字，创建时就拒绝和固定段同名的 ID，返回 400 `INVALID_ARGUMENT` 并指出字段，比如 AI 员工的用户名不能叫 `roster` 或 `templates`。请求方式和地址完全相同的重复注册，应用启动时直接报错。另外，地址里的 ID 如果含有 `/`、`:` 等特殊字符，客户端会自动编码，开发者不需要处理。

### 几类例外

以下几类 `/api` 接口不完全按上面的规则写，除此之外没有例外，新写的代码也不得模仿它们。不在 `/api` 下的根路由（例如支付服务商的回调）按各自协议的要求返回，不受本规范约束。

#### 例外一：自动生成的数据接口，保留原有动作

系统根据数据表配置自动生成的数据接口（约 150 个）保留自己的一套动作，只跟随全系统把冒号换成斜杠：`POST /api/users:findMany` 改为 `POST /api/users/findMany`。旧的冒号写法不再路由，返回 404 `ROUTE_NOT_FOUND`。

- **请求方式、动作名、请求参数都不变。** 改动集中在框架的生成逻辑和前端的数据接口客户端。
- **暴露名必须是一个 camelCase 路径段**，即符合 `/^[a-z][a-zA-Z0-9]*$/`，并且不能是 `auth`、`healthz`、`swagger`，声明时就会检查。应用里如果用了 `sales/orders`、`sales-orders` 这类暴露名，需要改名，调用方也要跟着改。
- 这批接口的查询条件是一棵复杂的筛选结构，只能放在请求内容里，所以统一用 POST 发送。谷歌规范对这种情况是允许的。
- 它们的错误同样是统一的错误格式，`domain` 是 `app`，`reason` 是数据仓库的错误码。
- 这条例外只给自动生成的接口。插件手写的接口不得模仿这套写法，一律遵守上面的规则。

#### 例外二：文件插件的上传动作

文件插件在文件类暴露上提供的 `POST /api/{name}/uploadOne` 和 `POST /api/{name}/uploadMany` 属于上面的数据接口，接收 multipart 请求内容，错误同样是统一格式。

#### 例外三：第三方登录库自带的接口，保持不变

登录、注册、会话、个人 API Key 等功能由第三方登录库 Better Auth 提供，它的接口统一在 `/api/auth/` 下，形如 `POST /api/auth/api-key/create`：

- **这些地址由第三方库自己决定**，我们改不了；如果为了统一格式再包一层转发，只会多一套要维护的接口，还会跟不上它的升级。
- 计划在接口文档里单独归为「认证」一类，并注明来自 Better Auth，外部开发者可以直接查阅它的官方文档。
- 这条例外只给 `/api/auth/` 下由第三方库注册的接口。我们自己写的、与登录相关的接口（例如 Hub 的 API Key 管理 `/api/hub/apiKeys`）照常遵守上面的规则。

#### 例外四：健康检查

`GET /api/healthz` 保持负载均衡和探针读取的返回格式。

#### 例外五：流式返回

服务端推送事件和 NDJSON 这类流式返回保持流式，流开始之后按各自的帧格式输出。它们的地址、请求方式和输入照常遵守上面的规则。凡是能在开流之前发现的问题，比如输入不合法、资源不存在、没有权限、超出限制，都先用统一的错误格式和对应状态码返回，不能放进一个 200 的流里当作错误帧。

## 04 接口文档怎么生成

> [!NOTE]
> 本节记录的是 PR #533（分支 `feat/openapi`）里已经实现的做法。原稿里的待定事项都已有结论，汇总在本节末尾。

接口文档（Swagger，正式名称是 OpenAPI）不靠人手写，而是从代码里自动产出。开发者写接口时声明「接受什么、返回什么」，这份声明同时用来校验请求和生成文档。代码改了，文档跟着变，不会出现文档和实际不一致。

### 文档的四个来源

| 接口类型                     | 文档从哪来                                                                                                                             | 开发者要做什么                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 插件和应用手写的接口         | 每个接口用 `describeRoute()` 写说明，用 `apiValidator()` 声明输入，用 zod 声明返回结构，都从 `@nocobase/app-server/router` 导入        | 写接口时顺手声明；输入声明同时负责校验请求                             |
| 自动生成的数据接口           | 框架从暴露配置和数据表的字段定义逐个字段推导                                                                                           | 什么都不用做；暴露额外加在记录上的字段时，用 `computedFields` 声明一下 |
| 权限插件分发器后面的设置接口 | 规则插件用 `authz.routes.add(path, createRouteHandler(router))` 注册的路由，由权限插件读出来，合并成 `/api/authorization/...` 下的接口 | 和手写接口一样，在路由上写 `describeRoute()`                           |
| 登录相关接口（Better Auth）  | Better Auth 自己的 OpenAPI 生成器产出，由认证插件通过 `addFragment()` 合并进来，归入 `Authentication` 分组                             | 什么都不用做                                                           |

### 生成流程

1. **声明**：每个手写接口写明分组、一句说明、`operationId`、输入和每个状态码的返回。
2. **收集**：应用在 `registerRoutes()` 里组装好唯一的 `/api` 路由后交给文档服务，文档服务读出每个路由上的声明，加上数据接口和插件补充的片段。
3. **合并**：合成一份标准的 OpenAPI 3.1 文档。`info` 取应用的名称和版本，`servers` 是应用的挂载路径（如 `/main`），路径都写成 `/api/...`。每个应用装的插件不同，文档也只包含它实际拥有的接口。
4. **缓存**：文档在第一次请求时生成并缓存，插件补充片段或调用 `invalidate()` 时丢掉缓存、下次重新生成；生成失败不缓存，下次请求重试。

### 两个地址和谁能访问

| 地址                    | 给谁                                   | 说明                                                                               |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/swagger/docs` | 开发者、外部合作方                     | Swagger UI 页面，按插件分组列出所有接口，可以直接在页面上填参数试调                |
| `GET /api/swagger`      | AI Agent、各类工具、要导入文档的合作方 | 同一份文档的 JSON，Swagger UI 也是读它来显示的；Postman、Apifox 等工具可以直接导入 |

两个地址都在 `/api/swagger` 下，这一段由框架保留：插件注册 `/api/swagger` 下的路由会在启动时按重复路由报错，数据接口的暴露名也不能叫 `swagger`。

Swagger UI 的页面资源（`swagger-ui-bundle.js`、`swagger-ui.css` 和图标）来自 `swagger-ui-dist`，它是 `@nocobase/app-server` 的开发依赖，构建时只把这几个文件复制进 `dist/swagger-ui`，由应用自己在 `/api/swagger/docs/*` 下提供。不从 CDN 加载，内网和离线部署也能打开，模板什么都不用声明。

访问规则只有一条：**已登录的会话，或者带有效 API Key 的请求，才能看文档**，开发环境和生产环境一样，没有「公开文档」的开关。

- `@nocobase/app-server` 不懂认证，只提供 `apiDocsToken` 这个服务，插件用 `addAccess({ name, check })` 注册访问检查，多个检查之间是「或」的关系。
- 认证插件注册的检查认登录会话，API Key 插件注册的检查认 API Key。检查时都不延长会话、不写 Cookie，读文档不改变任何状态。
- 一个检查都没注册时，两个地址返回 404 `ROUTE_NOT_FOUND`，和不存在的地址一样：应用没法判断来者是谁，就不公开接口。
- 注册了检查但都不放行时，返回 401，`reason` 为 `API_DOCS_UNAUTHENTICATED`。

看到文档不等于能调用：每个接口被调用时仍然单独检查权限。外部合作方拿到 API Key 就能看文档、在页面上试调，不需要管理员账号。

### 文档怎么看

给人看：在浏览器里登录应用后，打开 `<origin><APP_BASE_PATH>/api/swagger/docs`，比如本地开发时的 `http://127.0.0.1:13000/main/api/swagger/docs`。浏览器会自动带上会话 Cookie，不用另外填什么。没有登录时，可以在页面右上角的「Authorize」里填 API Key，页面会记住它，刷新后不用再填。

给程序看：请求 `<origin><APP_BASE_PATH>/api/swagger`，用 API Key 认证：

```bash
curl -H "x-api-key: <key>" http://127.0.0.1:13000/main/api/swagger
```

`/main` 是应用的挂载路径，也就是 `APP_BASE_PATH`，没设置时默认是 `/main`，挂在别的路径上就换成那个路径。API Key 在 API Key 插件的设置页面里创建，也可以调用 `/api/auth/api-key/create` 创建，它以创建者的身份生效。

给 AI Agent 的约定：Agent 要了解一个应用有哪些接口时，先用 API Key 拉取 `/api/swagger` 这份 JSON，而不是去读路由源码。文档里有每个接口的地址、输入、返回、错误状态和说明，数据接口还列出了每个字段和可用的筛选条件，比读源码准确，也覆盖了装进应用的所有插件。

### 认证方式在文档里怎么写

文档声明了两种认证方式，满足任意一种即可：

- `cookieAuth`：会话 Cookie，Cookie 名取 Better Auth 在当前配置下实际设置的名字，包括前缀和 `__Secure-`。浏览器自己会带，Swagger UI 里不用填。
- `apiKeyAuth`：请求头里的 API Key，请求头名取 API Key 插件读取 Key 的第一个请求头，默认是 `x-api-key`。Swagger UI 的「Authorize」填的就是它。

这两种方式由认证插件和 API Key 插件以片段的形式加进文档顶层的 `security`，作为两个可选项；没有插件提供时，文档就没有顶层 `security`。不需要任何凭证的接口在 `describeRoute()` 里写 `security: []`，比如 `GET /api/healthz`、登录页在登录前就要读的 `GET /api/i18n/locales`，以及 Better Auth 的登录、注册、找回密码等接口。

Hub 的发布密钥（`Authorization: Bearer hub_app_…`）不是全应用通用的凭证，所以没有做成认证方式，而是写在接受它的那些接口的说明里：哪个接口接受发布密钥、需要哪个权限范围，都在该接口的 `description` 里说明，Hub 自己的 401 和 403 也写明了发布密钥被拒时的 `reason`。

### 原始数据长什么样

`GET /api/swagger` 返回的是一份标准 OpenAPI 3.1 文档。以「部署 Hub 应用」这一个接口为例，截取其中一段并做了简化：

```jsonc
{
  "openapi": "3.1.0",
  "info": { "title": "NocoBase Hub", "version": "1.0.0-beta.43" }, // 应用名称和版本，取自应用的 package.json
  "servers": [{ "url": "/main" }], // 应用的挂载路径
  "security": [{ "cookieAuth": [] }, { "apiKeyAuth": [] }], // 会话或 API Key，任选其一
  "tags": [{ "name": "Hub" }], // 按插件分组
  "paths": {
    "/api/hub/apps/{appId}/deploy": {
      "post": {
        "tags": ["Hub"],
        "summary": "Deploy a Release",
        "operationId": "hubDeployApp",
        "description": "Starts deploying a stored Release … A Hub publishing key bound to the App may call this as well, as `Authorization: Bearer hub_app_…`, with the `deploy` scope.",
        "parameters": [
          {
            "name": "appId",
            "in": "path",
            "required": true,
            "schema": { "type": "string" },
          },
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["releaseId"],
                "properties": {
                  "releaseId": {
                    "type": "string",
                    "description": "The stored Release to deploy.",
                  },
                },
                "additionalProperties": false, // 请求内容用 z.strictObject，多余字段会被拒绝
              },
            },
          },
        },
        "responses": {
          "202": {
            "description": "The deployment operation, accepted.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": ["data"],
                  "properties": { "data": { "type": "object" } },
                },
              },
            },
          },
          "401": { "$ref": "#/components/responses/Unauthenticated" }, // 统一错误格式，全文档共用
          "404": {
            "description": "No App has this ID (`APP_NOT_FOUND`).",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ApiErrorBody" },
              },
            },
          },
        },
      },
    },
  },
  "components": {
    "securitySchemes": {
      "cookieAuth": {
        "type": "apiKey",
        "in": "cookie",
        "name": "better-auth.session_token",
      },
      "apiKeyAuth": { "type": "apiKey", "in": "header", "name": "x-api-key" },
    },
  },
}
```

### 代码里怎么接起来

整条链路分四块，插件开发者只需要做第四块里「写声明」这一件事。

**1. 框架：文档服务和两个地址。** `@nocobase/app-server` 在 `RouterProvider` 里注册 `apiDocsToken` 对应的 `ApiDocsService`，应用组装好 `/api` 路由后把它交给这个服务，并挂上 `/api/swagger`、`/api/swagger/docs` 和页面资源这几个路由，它们本身在文档里是隐藏的。`ApiDocsService` 对插件开放四个方法：

| 方法                         | 用途                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `addAccess({ name, check })` | 注册访问检查，任何一个放行即可读文档                                          |
| `addFragment(fragment)`      | 合并路由声明之外的接口、组件、分组和认证方式，片段里的路径写完整的 `/api/...` |
| `getDocument()`              | 取当前文档，第一次调用时生成                                                  |
| `invalidate()`               | 丢掉缓存，下次请求重新生成                                                    |

合并片段时，和已有组件重名但内容不同的组件、重复的 `operationId` 会加上片段的命名空间前缀；和已声明路由同方法同路径的操作会被丢掉并给出警告，因为真正响应请求的是声明过的路由。

**2. 认证插件和 API Key 插件：访问检查、认证方式和 Better Auth 的接口。** 认证插件注册会话检查，补上 `cookieAuth`，再调用 Better Auth 自己的 OpenAPI 生成器，把它服务的全部接口（包括应用配置的 Better Auth 插件的接口）以 `/api/auth/...` 的完整路径合并进来，归入 `Authentication` 分组。只在浏览器里走的步骤，比如第三方登录跳转、OAuth 回调、邮件里的链接和错误页，不放进文档；Better Auth 自带的 `/reference` 页面也不提供，全应用只有一个文档入口。API Key 插件注册 API Key 检查，补上 `apiKeyAuth`。

**3. 权限插件：分发器后面的设置接口。** `/api/authorization` 是一个分发器，请求到达时才转给权限插件和三个规则插件注册的处理函数，文档生成器看不到后面的路由。所以规则插件用 `authz.routes.add(path, createRouteHandler(router))` 注册一个 Hono 路由，权限插件的 `authorizationApiFragment()` 读出所有注册，把每个路由以完整的 `/api/authorization/...` 路径合并进文档。直接注册一个普通函数也还能工作，但没有路由可读，会记一条警告；`undeclaredAuthorizationRoutes(authz.routes)` 会把它和没写声明的路由一起列出来，规则插件的测试断言这个列表为空。

**4. 每个插件和应用：在路由上写声明。** 写法见下一节。

### 接口声明规范

每个 `/api` 下的手写接口都必须按以下规则声明，CI 会检查。声明用 zod 写，同一份声明同时产生 TypeScript 类型、运行时校验和文档。所有辅助函数都从 `@nocobase/app-server/router` 导入，插件不直接导入也不声明 `hono-openapi`：声明是挂在中间件上的，键是 `hono-openapi` 模块自己的一个 symbol，插件一旦装进第二份 `hono-openapi`，它挂上的声明框架就读不到了。`pnpm peers:check` 会拦下声明了 `hono-openapi` 的插件。

| 项目       | 规则                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 接口说明   | 必须有 `describeRoute()`，至少包含 `tags`（插件名的 PascalCase，如 `Hub`、`Users`、`AiEmployee`）、`summary`（一句英文动宾短语，如 `Deploy a Release`）、`operationId`（命名空间 + 动词 + 资源，camelCase，全应用唯一，如 `hubDeployApp`）。应用自己的接口以资源名或应用名为分组           |
| 位置       | `describeRoute()` 放在登录和权限中间件之后、`apiValidator()` 之前                                                                                                                                                                                                                          |
| 输入       | 路径参数、查询参数、请求内容、请求头，用到哪类就用 `apiValidator('param' \| 'query' \| 'json' \| 'header', Schema)` 声明哪类。它取代 `validator()` + `parseApiInput()`，校验失败照样返回 400 `INVALID_INPUT` 和字段级错误。处理函数只能用 `c.req.valid()` 取值                             |
| 输入对象   | 请求内容用 `z.strictObject`，多余字段返回 400 并指出字段名，文档里也写成封闭对象；查询参数和路径参数用 `z.object`                                                                                                                                                                          |
| 成功返回   | 每个成功状态码都声明结构：`dataResponse(Schema)` 包出 `{ data }`，`listResponse(ItemSchema, MetaSchema?)` 包出 `{ data, meta }`，没有内容的 204 用 `emptyResponse()`，不手写外层                                                                                                           |
| 错误返回   | 只列这个接口真的会返回的状态：常见的 400、401、403、500 用 `...apiErrorResponses` 一次展开，其余用 `apiErrorResponse(404)` 这样逐个加，需要说明 `reason` 时写成 `apiErrorResponse(409, '…')`。错误结构都是统一的错误体，不自己描述                                                         |
| 返回结构   | 返回结构对着处理函数实际返回的视图类型写，并用视图类型标注，如 `export const DeploymentAcceptedSchema: z.ZodType<DeploymentAcceptedResponse> = z.object({...})`，返回值和文档一旦不一致，类型检查就会报错。返回对象在文档里是开放的，以后加字段不算破坏性变化，除非用了 `z.strictObject()` |
| 字段类型   | 字段名 camelCase；ID 一律 `z.string()`；时间 `z.iso.datetime()`；布尔 `z.boolean()`；枚举 `z.enum([...])`；「可以不传」用 `.optional()`，「可以为空」用 `.nullable()`，两者不混用；禁止 `z.any()`，`z.unknown()` 只用于确实任意的 JSON 并写明理由                                          |
| 字段说明   | 对外可见的字段用 `.meta({ description })` 写一句英文说明，引用共用结构的字段也保留自己的说明                                                                                                                                                                                               |
| 复用的结构 | 被多个接口共用的对象加 `.meta({ ref })`，名字以插件名开头，如 `HubDeployment`，成为文档里的一个命名组件；`z.json()` 这类递归结构也会自动成为组件，不用特殊处理                                                                                                                             |
| 存放位置   | 声明放在插件的 `server/routes/schemas.ts`（接口多时拆成 `schemas/` 目录）                                                                                                                                                                                                                  |
| 不需要凭证 | 公开接口在 `describeRoute()` 里写 `security: []`                                                                                                                                                                                                                                           |
| 流式返回   | 声明 `text/event-stream` 或 `application/x-ndjson` 内容，并说明帧格式；开流前会返回的错误照常列出                                                                                                                                                                                          |

按规范写出来的一个完整接口：

```ts
// server/routes/schemas.ts
import { z } from 'zod';

export const OrderParams = z.object({ orderId: z.string() }); // 路径参数：z.object
export const CancelOrderInput = z.strictObject({
  reason: z
    .string()
    .min(1)
    .meta({ description: 'Why the order is cancelled.' }), // 请求内容：z.strictObject
});
export const OrderSchema: z.ZodType<OrderView> = z // 用服务层返回的视图类型标注
  .object({ id: z.string(), status: z.enum(['open', 'cancelled']) })
  .meta({ ref: 'Order' });

// server/routes/orders.ts
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router'; // 插件不直接导入 hono-openapi

router.post(
  '/orders/:orderId/cancel',
  auth.required(), // 登录和权限检查排在最前
  describeRoute({
    tags: ['Orders'],
    summary: 'Cancel an order',
    operationId: 'cancelOrder',
    responses: {
      200: dataResponse(OrderSchema, 'The cancelled order.'),
      ...apiErrorResponses,
      404: apiErrorResponse(404),
    },
  }),
  apiValidator('param', OrderParams),
  apiValidator('json', CancelOrderInput),
  async (c) => {
    const { orderId } = c.req.valid('param'); // 已校验、带类型
    const input = c.req.valid('json');
    return c.json({ data: await orders.cancel(orderId, input) });
  },
);
```

### 隐藏的接口

每个手写接口要么写 `describeRoute({...})`，要么写 `describeRoute({ hide: true })` 并附一行注释说明原因，两样都没有就是缺陷，检查会点名报出来。只有以下五类可以隐藏，凡是外部调用方（脚本、集成、带 API Key 的 Agent）可能依赖的接口都要写进文档，管理和设置类接口也一样：

1. 服务应用自身外壳或构建产物的路由，不是对外约定：前端启动配置、语言包、构建产物和静态资源、只在开发环境存在的路由。
2. 只在浏览器里走、脚本没法单独调用的流程：第三方登录跳转和回调、只改浏览器会话的握手，比如切换语言的 `PUT /api/i18n/locale`。
3. 文档自己的几个路由。
4. 不是 HTTP 请求和响应的传输通道，比如 WebSocket 升级。
5. 插件在未配置时才注册的兜底路由，对每个路径都返回 503，配置好以后会换成真正的接口，比如工作流服务未配置时的兜底路由、示例应用没有数据库时的替身路由。

### 数据接口

`defineRepositoryApiRoutes` 生成的数据接口（`POST /api/{name}/{action}`）由框架自动写进文档，每个暴露的每个动作一个操作，不需要逐个声明：

- **记录和 `values` 逐个字段展开**：字段结构从数据表定义读出。字符串类是 `string`，整数是 `integer`，bigint 和雪花 ID 这类长整数是 `string`，decimal 是保持精度的 `string`，布尔是 `boolean`，日期时间是 RFC 3339 的 `string`，枚举列出取值，JSON 不约束。`values` 只列 `@nocobase/db` 的 `writableFields()` 认为可写的字段；数据库或数据仓库自己赋值的字段，比如自增主键、乐观锁版本号，在记录里标为只读。
- **筛选条件按真实语法写**：数据仓库只接受两种写法。一种是根字段的标量简写 `{ "status": "active" }`，多个条件按「且」组合；另一种是完整的 Filter AST，`{ "kind": "filter", "version": 1, "root": { "kind": "group", "logic": "and", "items": [...] } }`。`{ "budget": { "$gte": 100 } }` 这种运算符对象不是合法语法，要用 AST。文档里有一个共用的 `RepositoryFilter` 组件说明整套语法，每种字段类型可用的运算符直接取自 `@nocobase/db` 的 `filterOperatorsForFieldType()`，不手抄；每个接口另有一份按数据表生成的筛选结构，列出每个可筛选字段的运算符和取值类型。
- **关联和 JSON 路径保持通用**：`values` 里的关联只列外键字段，嵌套写入关联记录是一个通用对象；记录里的关联也是通用对象，只在 `select` 包含时返回。关联条件（`some`、`none`、`exists`、`notExists`）和 JSON 路径条件在每个接口的筛选结构里是通用的，指向共用的 `RepositoryFilter` 组件。`select`、`sort` 和分页是带说明的通用结构。
- **权限策略**：暴露的固定策略不允许读写的字段直接不列；策略随调用者变化时，列出全部字段并注明实际权限会进一步限制。
- **额外加在记录上的字段**：暴露自己在每条返回记录上加、数据表里却没有的字段，比如文件插件的 `contentUrl`，在暴露配置里用 `computedFields: { contentUrl: schema }` 声明。它只影响文档：在记录结构里标为只读，不出现在 `values`、`filter`、`sort` 里；和数据表字段重名会在创建路由时报错。

### CI 检查

`pnpm openapi:check`（脚本 `scripts/check-openapi.mjs`）为每个应用模板生成一份文档，出现以下任何一种情况就失败：

- 有没写声明的路由，包括 `/api/authorization` 分发器后面的路由（`undeclaredAuthorizationRoutes()`）。
- 没有隐藏的接口缺少 `tags`、`summary` 或 `operationId`。
- `operationId` 重复。
- `findApiDocumentSchemaProblems()` 报出问题：引用了文档里不存在的结构，或者组件名是转换器生成的（如 `__schema0`）而不是声明出来的。

不提交每个模板的 `openapi.json` 快照，也不用 `oasdiff` 比对破坏性变化。各插件的测试里也做同样的断言：应用启动后 `findUndeclaredApiRoutes(app)` 不含本插件的路由，`findApiDocumentSchemaProblems(document)` 为空，文档里有本插件的 `operationId`。

### 原来的待定事项，现在的结论

- **文档页面用哪个界面**：用 Swagger UI。`swagger-ui-dist` 是 `@nocobase/app-server` 的开发依赖，构建时只复制需要的文件进它的 `dist`，由应用自己提供，不走 CDN。
- **谁能访问**：已登录会话或有效 API Key，开发和生产环境一样，没有公开开关。访问检查由认证插件和 API Key 插件通过 `apiDocsToken` 的 `addAccess()` 注册；一个都没注册时返回 404，注册了但都不放行时返回 401 `API_DOCS_UNAUTHENTICATED`。
- **数据接口是否按字段生成结构**：第一期就按字段生成记录、`values` 和筛选结构，筛选按真实语法写，运算符从代码取；关联和 JSON 路径先保持通用；额外字段用 `computedFields` 声明。
- **Better Auth 的接口**：合并进同一份文档，由认证插件用 Better Auth 自己的生成器产出，通过 `addFragment()` 加入；浏览器专用的步骤不放进来，不需要凭证的接口写 `security: []`。
- **认证方式**：`cookieAuth` 和 `apiKeyAuth`（请求头 `x-api-key`）两个可选项，公开接口写 `security: []`。Hub 的发布密钥写在接受它的接口说明里，不单独作为认证方式。
- **隐藏接口**：只限上面列出的五类，每处都附一行注释说明原因。
- **CI 检查**：`pnpm openapi:check`，不做快照，不做 `oasdiff`。
- **前端类型生成**：不在这一期，下一期从这份文档生成。
- **changeset 级别**：`@nocobase/app-server` 和 `@nocobase/db` 是 minor（新能力，当前是 beta 线）；认证、API Key、权限插件和 `@nocobase/authorization` 是 minor，因为它们新增了导出或行为；只补声明、行为不变的插件、示例和模板是 patch；`@nocobase/app-skills` 是 patch。

## 05 改动前后对照

| 场景                       | 现在                                        | 改为                                                            |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| 部署 / 停止 Hub 应用       | `POST /api/hub/apps/7/deploy`               | `POST /api/hub/apps/7/deploy`（地址本来就对，统一动作语义即可） |
| 查看 API Key 明文          | `POST /api/hub/api-keys/3/reveal`           | `POST /api/hub/apiKeys/3/reveal`                                |
| 停用用户                   | `POST /api/users/5/disable`                 | `POST /api/users/5/disable`                                     |
| 删除用户                   | `DELETE /api/users/5`（附带确认内容）       | `DELETE /api/users/5?confirm=true`                              |
| 查看权限集                 | `GET /api/authz/permission-sets`            | `GET /api/authorization/permissionSets`                         |
| 查看 AI 技能               | `GET /api/ai/aiSkills:get?key=x`            | `GET /api/aiEmployee/skills/x`                                  |
| 站内信标记已读             | `POST /api/notifications/in-app/9 {action}` | `POST /api/notificationInApp/messages/9/markRead`               |
| 数据表查询（例外一）       | `POST /api/users:findMany`                  | `POST /api/users/findMany`                                      |
| 创建个人 API Key（例外三） | `POST /api/auth/api-key/create`             | 不变                                                            |

## 06 收益与代价

### 能得到什么

- **自动生成的接口文档（Swagger）**，外部开发者和合作方凭登录会话或 API Key 直接查阅、在线试调，不用再读源码；AI Agent 拉取同一份 JSON 就能知道应用有哪些接口。
- **对外接入门槛下降**：所有接口一个格式，学会一个就会用全部。
- **AI Agent 开发更可靠**：它们照着机器可读的规范写接口，不再模仿各插件的不同写法。
- **前端代码更少出错**：下一期从文档自动生成接口类型，不用手写。
- **不会再退化**：规范写进自动检查，新代码不合规就过不了合并。

### 要付出什么

- **一次性的破坏性改动**：旧地址不保留。我们自己的前端在同一批改动里已经同步改好；已经在 beta 版上做了集成的外部用户需要按对照表调整。Hub 和 hub-cli 需要一起升级；应用里从 Registry 安装的 `nocobase-ai` 前端代码，需要和 AI 员工插件一起更新。
- **版本号跳变**：改动过的插件发布大版本。目前 1.0 测试版的包（如 Hub、工作流、用户）会直接进入 2.0 测试版。
- **工程投入**：规范和框架兜底、存量迁移、框架层限制已经完成（PR #530、#532），接口文档生成在 PR #533 中完成，剩下的是前端类型生成。
- **暂不做接口版本号**：现阶段接口随插件版本一起升级，等对外接口稳定后再单独设计。

## 07 执行计划与当前进度

先定规范、打好底，让新写的代码不再增加混乱；再迁移存量接口；最后把规范放进自动检查，防止回退。

### 第一步：定规矩（已完成，PR #530 已合并）

- **规范成文**：写入根目录 `AGENTS.md` 和 `@nocobase/app-skills` 的技能文档 `references/http-api.md`。
- **框架兜底**：统一的错误格式；所有意外错误都返回不透明的 500；每个响应都带 `x-request-id`；`/api` 下的未知地址返回 JSON 格式的 404 `ROUTE_NOT_FOUND`，不再返回前端页面。
- **插件模板更新**：`create-plugin` 生成的插件自带接口规范说明。

### 第二步：迁移（已完成，PR #532 已合并）

- **存量迁移**：Hub 和 hub-cli、用户、认证、权限（含三个规则插件）、API Key、工作流、定时任务、多语言、通知、站内信、文件、数据库浏览器、AI 员工，以及所有示例插件和应用模板，前端同步改好。
- **数据接口**：分隔符由冒号改为斜杠，暴露名改为必须是 camelCase。
- **前端**：`ApiClientError` 只读标准错误体里的 `reason`，旧的 `{ code }` 兼容去掉了。
- **框架层限制**：已在 #532 实现（提交 94ec6b816），在 `config.yml` 的 `api` 段配置，三项默认都不开启。`api.bodyLimit` 是全局请求内容大小上限，超出返回 413 `BODY_TOO_LARGE`；`api.timeout` 是请求超时，处理函数到期还没返回时答 503 `REQUEST_TIMEOUT`，已经开始的流式返回不会被切断；`api.rateLimit` 是限流，超出返回 429 `RATE_LIMITED` 并带 `Retry-After`，按连接 IP 计数，每个实例在自己的进程内存里各算各的，`GET /api/healthz` 不计，认证路由照常计数。反向代理后面所有客户端共用代理的 IP，可信代理的支持还没做。环境变量 `API_BODY_LIMIT`、`API_TIMEOUT` 可以设置前两项。
- **重复路由检查**：请求方式和地址完全相同的重复注册，应用启动时直接报错，同在 #532 实现（提交 94ec6b816）。
- **发布**：改动过的插件统一发布大版本，changeset 里附改动对照说明。
- **pro 仓库**：邮件和 AI 知识库插件的迁移已合并（pro 仓库 #60）。

### 第三步：接口文档（PR #533 已完成，待合并）

- **框架**：`@nocobase/app-server` 生成 OpenAPI 3.1 文档，在 `/api/swagger` 提供 JSON、在 `/api/swagger/docs` 提供 Swagger UI，页面资源随包发布；提供 `describeRoute()`、`apiValidator()`、`dataResponse()`、`listResponse()`、`emptyResponse()`、`apiErrorResponse()`、`apiErrorResponses` 这些声明工具，以及 `apiDocsToken`、`findUndeclaredApiRoutes()`、`findApiDocumentSchemaProblems()`；数据接口按字段自动写进文档，暴露配置支持 `computedFields`。
- **访问和认证方式**：认证插件和 API Key 插件注册访问检查，补上 `cookieAuth` 和 `apiKeyAuth` 两种认证方式；Better Auth 的接口合并进同一份文档。
- **声明补齐**：默认模板的全部插件（用户、认证、权限和三个规则插件、多语言、文件、通知、站内信、定时任务、数据库浏览器、工作流、AI 员工）、Hub、所有示例插件和示例应用的手写接口都已声明，各自的测试断言没有漏声明的路由、没有结构问题。权限分发器后面的设置接口通过 `createRouteHandler` 自动写进文档。
- **文档和规范**：根目录 `AGENTS.md`、`@nocobase/app-skills` 的 `references/http-api.md`、`create-plugin` 生成的插件说明和三个模板的 `AGENTS.md` 都写明了声明规则和怎么读文档。
- **自动检查**：`pnpm openapi:check` 为每个模板生成文档，拦下没写声明的路由、缺少 `tags` / `summary` / `operationId` 的接口、重复的 `operationId` 和结构问题，不做快照比对。
- **pro 仓库**：邮件、AI 知识库插件和 pro 示例的接口声明已在 pro 仓库的 `feat/openapi` 分支按同一套规则补齐。

### 第四步：后续

- **前端类型自动生成**：从接口文档生成，不再手写。
- **数据接口的关联和 JSON 路径**：目前在文档里是通用结构，以后再按关联目标展开。

## 08 请确认

- [ ] 采用谷歌 API 设计规范作为 NocoBase 3 接口统一标准，动作分隔符用斜杠代替冒号。
- [ ] 以下五类接口作为例外：自动生成的数据接口保留原有动作（只换分隔符）；文件插件的 `uploadOne` / `uploadMany` 归入数据接口；第三方登录库在 `/api/auth/` 下的接口保持原样；`GET /api/healthz` 保持原样；流式返回保持各自的帧格式，开流前能发现的错误先按统一格式返回。
- [ ] 接口文档（Swagger）从代码自动生成，不手写，只对已登录会话和 API Key 开放，按第 04 节的做法在 PR #533 实现。
- [ ] 现有接口一次性迁移，不保留旧地址；改动过的插件发布大版本，接受 1.0 测试版直接进入 2.0 测试版。
- [ ] 现阶段不做接口版本号。
- [ ] 按第 07 节的进度继续：#533 合并后发布，前端类型生成放到下一期。

## 附：给工程师的细则摘要

| 操作             | 请求方式 | 地址                                          | 成功返回                       |
| ---------------- | -------- | --------------------------------------------- | ------------------------------ |
| 列表             | GET      | `/api/hub/apps`                               | `200 {data: [...], meta}`      |
| 查看单个         | GET      | `/api/hub/apps/{appId}`                       | `200 {data}`                   |
| 新建             | POST     | `/api/hub/apps`                               | `201 {data}`                   |
| 修改部分字段     | PATCH    | `/api/hub/apps/{appId}`                       | `200 {data}`                   |
| 整体替换单例配置 | PUT      | `/api/hub/apps/{appId}/config`                | `200 {data}`                   |
| 删除             | DELETE   | `/api/hub/apps/{appId}`                       | `204` 无内容，后台继续时 `202` |
| 资源上的动作     | POST     | `/api/hub/apps/{appId}/deploy`                | `200 {data}` / `202` / `204`   |
| 集合上的动作     | POST     | `/api/notificationInApp/messages/markAllRead` | `200 {data}` / `202` / `204`   |

| HTTP | status                                     | 用于                                                     |
| ---- | ------------------------------------------ | -------------------------------------------------------- |
| 400  | `INVALID_ARGUMENT` / `FAILED_PRECONDITION` | 参数不合法 / 当前状态不允许该操作；不再有 422            |
| 401  | `UNAUTHENTICATED`                          | 未登录                                                   |
| 403  | `PERMISSION_DENIED`                        | 无权限；先于输入校验和「是否存在」判断                   |
| 404  | `NOT_FOUND`                                | 有权限，但地址里指名的资源不存在                         |
| 409  | `ALREADY_EXISTS` / `ABORTED`               | 重复 / 并发修改冲突                                      |
| 413  | `INVALID_ARGUMENT` + `httpStatus`          | 只用于请求内容超过大小上限，`reason` 为 `BODY_TOO_LARGE` |
| 415  | `INVALID_ARGUMENT` + `httpStatus`          | 只用于不支持的请求内容类型                               |
| 429  | `RESOURCE_EXHAUSTED`                       | 限流                                                     |
| 500  | `INTERNAL`                                 | 意外错误，`reason` 为 `INTERNAL_ERROR`，不回显内部信息   |
| 503  | `UNAVAILABLE`                              | 依赖服务不可用；不再有 502                               |

其他要点：

- **地址**：命名空间是包名去掉 `app-plugin-` 后的 camelCase，单复数均可；资源名和插件名不同时写成「命名空间 + 资源」（`/api/scheduler/schedules`）；挂在别的插件分发器下的插件沿用宿主的命名空间；`/swagger`、`/auth`、`/healthz` 为保留段。固定段注册在 `/:id` 之前，用户自起的 ID 与固定段同名时在创建时返回 400 `INVALID_ARGUMENT` 和字段错误；请求方式和地址完全相同的重复注册，启动即报错。路径中的 ID 由客户端 `encodeURIComponent` 编码。
- **请求方式**：「查看」类请求不得修改任何状态，包括顺带删除过期数据、改写会话或 Cookie；删除请求不带请求体，需要确认时用 `?confirm=true`。
- **分页**：`pageSize` + `pageToken`（返回 `nextPageToken`，均为 AIP-158 规定的名字）或 `page` + `pageSize`，每页默认 20、最多 100；条数有限的配置类列表可以不分页，但仍返回 `meta.total`；`meta` 可以带额外字段。搜索参数为 `q`，排序为 `orderBy`。
- **数据格式**：ID 在返回和传入时都是字符串；时间用 RFC 3339；布尔值是真正的布尔值。
- **输入**：用 zod 通过 `apiValidator()` 校验并同时写进文档，请求内容用 `z.strictObject`，查询和路径参数用 `z.object`；禁止 `z.any()`，`z.unknown()` 只在写明理由时使用。需要限制请求内容大小的路由按需配 `bodyLimit`，超出返回 413 `BODY_TOO_LARGE`，不要求每个路由都配。
- **权限**：权限检查放在 `apiValidator()` 之前的中间件里，先于「是否存在」判断；权限通过之前不写入任何东西。
- **错误**：抛 `ApiError`，不手写错误体。插件只用 `apiErrorHandler(error, context)` 这一个错误接口：路由自己的 `onError` 只负责把本插件的领域错误转成 `ApiError`，其余一律交给它；框架认得 `ApiError`、`HTTPException`、带 4xx `status` 的错误，以及状态不是 `INTERNAL` 的数据仓库错误，其余重新抛出、按 500 处理。插件不自己翻译数据仓库错误。
- **domain**：一个插件一个 `domain`，即它的命名空间；转交的错误保留原插件的 `domain`（如 `LAST_ASSIGNMENT` 仍是 `authorization`）；框架和数据仓库的错误用 `app`。
- **数据仓库错误**：每个错误码在 `@nocobase/db` 的 `repositoryErrorStatuses` 里声明自己的状态；状态为 `INTERNAL` 的（服务端自己的问题，如 Policy 不合法）按不透明的 500 返回；其余保留错误码作为 `reason`，`path` 和 `details` 放进 `metadata`，`INVALID_ARGUMENT` 类还会在 `fieldViolations` 里指出字段。`RELATION_TARGET_NOT_FOUND` 是 400，因为缺的是请求内容里引用的目标。
- **框架兜底**：`/api` 下的未知地址返回 JSON 格式的 404 `ROUTE_NOT_FOUND`，不返回前端页面；意外错误返回 500 `INTERNAL_ERROR`；每个响应都带 `x-request-id`；错误体字段包括 `fieldViolations` 和 `metadata`。
- **框架层限制**：已在 #532 实现，`config.yml` 的 `api` 段配置 `bodyLimit`（413 `BODY_TOO_LARGE`）、`timeout`（503 `REQUEST_TIMEOUT`，已开始的流式返回不切断）和 `rateLimit`（429 `RATE_LIMITED` 带 `Retry-After`，按连接 IP、每个实例在进程内存里计数，`healthz` 不计、认证路由计数；反向代理后所有客户端共用代理 IP，可信代理尚未支持），默认都不开启；环境变量 `API_BODY_LIMIT`、`API_TIMEOUT` 可设前两项。

---

参考：Google API Improvement Proposals（aip.dev），重点为 AIP-121 资源设计、AIP-131~135 标准方法、AIP-136 自定义方法（分隔符改为斜杠）、AIP-158 分页、AIP-193 错误。现状数据来自 HTTP API 体检报告，基于 develop @ fac3d58f 的静态代码阅读。实现以 `@nocobase/app-skills` 的 `references/http-api.md` 和根目录 `AGENTS.md` 为准。
