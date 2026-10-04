# NocoBase 3 接口规范方案

我们约 380 个接口原先各写各的，没有统一格式，也没有对外文档。本方案采用谷歌公开的 API 设计规范作为统一标准，一次性把所有插件改到同一套写法上，并据此自动生成对外的接口文档（Swagger）。本稿已按实际定下和实现的规范更新。

依据：HTTP API 体检报告（2026-09-29）　日期：2026-09-30，2026-10-04 按实现更新　当前进度：第一步已完成（PR #530），存量迁移在 PR #532 中完成、待合并，接口文档生成另起 PR

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

每个接口声明自己接受什么数据，不合格的请求在进入业务逻辑前就被拒绝，返回 400 并指出哪个字段有问题。声明用 zod 写：请求内容用 `z.strictObject`，多余字段直接报错；查询参数和路径参数用 `z.object`。上传这类二进制或 multipart 请求，参数和请求头照样校验，请求内容在代码里校验。每个请求内容都有大小上限，超出时返回 413 `BODY_TOO_LARGE`。这份声明将来同时是接口文档的来源，写一次，校验和文档两用（见第 04 节）。

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
> 本节是后续 OpenAPI PR 的计划，尚未实现。当前代码用 `validator('json', (value) => parseApiInput(Schema, value))` 校验输入，文档生成接入时会机械地换成下面的写法。

接口文档（Swagger，正式名称是 OpenAPI）不靠人手写，而是从代码里自动产出。开发者写接口时声明「接受什么、返回什么」，这份声明同时用来校验请求和生成文档。代码改了，文档跟着变，不会出现文档和实际不一致。

### 文档的三个来源

| 接口类型                        | 文档从哪来                                                                                 | 开发者要做什么                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 插件手写的接口                  | 每个接口用 zod 声明输入和输出的结构，通过 `@nocobase/app-server/router` 转出的辅助函数读取 | 写接口时顺手声明；这份声明同时负责校验请求 |
| 自动生成的数据接口（约 150 个） | 从数据表的暴露配置和字段定义自动推导                                                       | 什么都不用做                               |
| 登录相关接口（Better Auth）     | Better Auth 自带的 OpenAPI 插件产出，合并进来                                              | 什么都不用做                               |

### 生成流程

1. **声明**：每个接口写明输入、输出、所属插件和一句说明。
2. **收集**：应用启动时，框架收集所有已启用插件的接口声明，加上数据接口和登录接口。
3. **合并**：合成一份标准的 OpenAPI 3.1 文档，按插件分组。每个应用装的插件不同，文档也只包含它实际拥有的接口。
4. **输出**：在线文档页、可下载的文档文件、前端类型定义、自动检查。

### 谁在哪里看到文档

| 给谁               | 在哪里                  | 说明                                                                                                          |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| 开发者、外部合作方 | `GET /api/swagger/docs` | 给人看的在线文档页，按插件分组列出所有接口，可以直接在页面上填参数试调                                        |
| AI Agent、各类工具 | `GET /api/swagger`      | 同一份文档的原始数据（JSON 格式），给程序读；上面的在线页面也是读它来显示的。也可以直接下载这个文件发给合作方 |
| 前端开发           | 自动生成的类型定义      | 前端调用接口时，参数和返回值的类型从文档生成，写错会在编译时报错                                              |
| 代码审核           | 每次提交自动比对        | 接口有变化时列出差异，删字段、改类型这类破坏性改动必须明确确认；没写声明的接口直接拦下                        |

两个地址都放在 `/api/swagger` 下，这一段由框架保留：数据接口的暴露名不能叫 `swagger`，声明时就会报错。

### 谁能访问

下表是方案原稿的设想，最终做法还没定，见本节末尾的「待定事项」。

| 环境             | 文档数据 `/api/swagger`                                                  | 文档页面 `/api/swagger/docs`                                                                       |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 开发环境         | 无需登录                                                                 | 无需登录                                                                                           |
| 生产环境（默认） | 已登录用户，或带有效 API Key 的请求，都可以访问；未登录、无 Key 返回 401 | 页面本身可以打开，但不含任何接口信息。已登录时直接显示文档；未登录时提示填入 API Key，填入后再加载 |

这样外部合作方拿到 API Key 就能看文档、直接试调，不需要管理员账号。看到文档不等于能调用：每个接口在被调用时仍然会单独检查权限。

### 原始数据长什么样

`GET /api/swagger` 返回的是一份标准 OpenAPI 3.1 文档。以「部署 Hub 应用」这一个接口为例，截取其中一段：

```jsonc
{
  "openapi": "3.1.0",
  "info": { "title": "NocoBase API", "version": "2.0.0-beta.0" }, // 应用名称和版本
  "servers": [{ "url": "/api" }],
  "tags": [
    {
      "name": "Hub",
      "description": "Manage Hub apps, releases and deployments.",
    },
  ], // 按插件分组
  "paths": {
    "/hub/apps/{appId}/deploy": {
      // 接口地址
      "post": {
        // 请求方式
        "tags": ["Hub"],
        "summary": "Deploy an app",
        "operationId": "hubDeployApp",
        "parameters": [
          {
            "name": "appId",
            "in": "path",
            "required": true,
            "schema": { "type": "string" },
          },
        ],
        "requestBody": {
          // 要传什么
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["releaseId"],
                "properties": { "releaseId": { "type": "string" } },
              },
            },
          },
        },
        "responses": {
          // 会收到什么
          "202": {
            "description": "Deployment started",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "data": { "$ref": "#/components/schemas/HubDeployment" },
                  },
                },
              },
            },
          },
          "404": { "$ref": "#/components/responses/NotFound" }, // 统一错误格式，全文档共用
        },
        "security": [{ "session": [] }, { "apiKey": [] }], // 登录或 API Key 均可调用
      },
    },
  },
  "components": {
    "schemas": {
      "HubDeployment": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "status": {
            "type": "string",
            "enum": ["pending", "running", "succeeded", "failed"],
          },
        },
      },
    },
  },
}
```

这份文件对人来说不好读，但所有工具都认：文档页读它生成在线页面，前端读它生成类型定义，Postman、Apifox 等工具可以直接导入它。

### 代码里怎么接起来

整条链路分三块：框架负责出文档和页面，每个插件只负责声明自己的接口，登录库 Better Auth 的接口由认证插件转交过来。插件开发者只需要做第三块里「写声明」这一件事。

**1. 框架内置：两个地址，插件不用写。** 放在 `@nocobase/app-server` 里，应用启动后自动存在。

```ts
// packages/app/app-server/src/router/swagger.ts（框架内置，示意）
import { generateSpecs } from 'hono-openapi';

router.get('/swagger', requireDocsAccess(app), async (c) => {
  // ① 扫描所有插件的手写路由，读取每个路由上的 describeRoute 和输入声明
  const spec = await generateSpecs(apiRouter, {
    documentation: {
      info: { title: app.name, version: app.version },
      servers: [{ url: `${app.basePath}/api` }],
      components: standardComponents, // 统一错误体、session 和 API Key 两种认证方式
    },
    exclude: ['/swagger', '/swagger/docs', '/swagger/assets/*', '/auth/*'],
  });
  // ② 合并不走 describeRoute 的来源：自动生成的数据接口、Better Auth
  for (const contribute of openApiContributions)
    mergeDocument(spec, await contribute(app));
  return c.json(spec);
});

// ③ 文档页面：读取上面的 JSON 渲染；页面资源由应用自己提供，内网和离线部署也能打开
router.get('/swagger/docs', renderDocsPage);
router.get('/swagger/assets/*', serveDocsAssets());
```

文档页面用哪个界面还没定（见「待定事项」）。不管用哪个，页面资源都由应用自己提供，不从 CDN 加载，否则内网或离线部署的应用会打不开。文档在第一次请求时生成并缓存，应用重启前路由不会变。

**2. 认证插件：把 Better Auth 的接口转交给框架。** Better Auth 自带 OpenAPI 插件，能直接产出它全部接口的描述，包括登录、注册、会话，以及个人 API Key 的增删改查。认证插件打开它，再把结果交给框架合并。

```ts
// packages/plugins/app-plugin-authentication/server
import { openAPI } from 'better-auth/plugins';

betterAuth({
  plugins: [...plugins, openAPI({ disableDefaultReference: true })], // 关掉它自带的页面，全应用只保留一个文档入口
});

export const authOpenApi = defineOpenApiContribution(async (app) => {
  const auth = app.container.resolve(authenticationToken);
  const document = await auth.generateOpenAPISchema(); // 内部调用 Better Auth 的 auth.api.generateOpenAPISchema()
  return withTag(withPathPrefix(document, '/auth'), 'Authentication'); // 挂到 /api/auth 下，归入「认证」分组
});
```

自动生成的数据接口走同一个 `defineOpenApiContribution` 入口，由框架根据暴露配置和字段定义产出，插件不用写。`defineOpenApiContribution`、`withPathPrefix` 等是要在框架里新增的函数，名字在实现时再定。Better Auth 产出的路径是否已经带 `/api/auth` 前缀，需要在实现时对照实际输出确认。

**3. 每个插件：在路由上写声明。** 这是插件开发者唯一要做的事，写法按下面的规范。

### 接口类型声明规范

每个 `/api` 下的手写接口都必须按以下规则声明，CI 会检查。声明用 zod 写，同一份声明同时产生 TypeScript 类型、运行时校验和文档。所有辅助函数都从 `@nocobase/app-server/router` 导入，插件不直接导入 `hono-openapi`：一旦插件装进第二份 `hono-openapi`，它挂在路由上的声明框架就读不到了。

| 项目       | 规则                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 接口说明   | 必须有 `describeRoute`，至少包含 `tags`（插件名，PascalCase，如 `Hub`）、`summary`（一句英文动宾短语，如 `Deploy an app`）、`operationId`（命名空间 + 动词 + 资源，camelCase，全应用唯一，如 `hubDeployApp`，前端生成的方法名就用它）                                                                |
| 输入       | 路径参数、查询参数、请求内容三类，用到哪类就用 `apiValidator('param' \| 'query' \| 'json', Schema)` 声明哪类，它取代现在的 `validator()` + `parseApiInput()`，校验失败照样返回 400 `INVALID_INPUT` 和字段级错误。处理函数只能用 `c.req.valid()` 取值，禁止 `c.req.json<T>()`、`c.req.query()` 直接读 |
| 输入对象   | 按输入类别区分，见下表                                                                                                                                                                                                                                                                               |
| 成功返回   | 每个成功状态码都声明结构，用框架提供的 `dataResponse(Schema)`、`listResponse(Schema)` 包出 `{ data }` / `{ data, meta }`，没有内容的 204 用 `emptyResponse()`，不手写外层                                                                                                                            |
| 错误返回   | 引用框架统一的错误响应 `apiErrorResponses`，不自己描述错误结构                                                                                                                                                                                                                                       |
| 字段类型   | 字段名 camelCase；ID 一律 `z.string()`；时间 `z.iso.datetime()`；布尔 `z.boolean()`；枚举 `z.enum([...])`；「可以不传」用 `.optional()`，「可以为空」用 `.nullable()`，两者不混用；禁止 `z.any()`，`z.unknown()` 只用于确实任意的 JSON 并写明理由                                                    |
| 字段说明   | 对外可见的字段用 `.meta({ description })` 写一句英文说明                                                                                                                                                                                                                                             |
| 复用的结构 | 被多个接口共用的对象加 `.meta({ ref })`，名字以插件名开头，如 `HubDeployment`，避免不同插件重名                                                                                                                                                                                                      |
| 存放位置   | 声明放在插件的 `server/routes/schemas.ts`（接口多时拆成 `schemas/` 目录）。服务层需要的类型用 `z.infer` 从声明导出，不再另写一份 `interface`                                                                                                                                                         |
| 特殊返回   | 流式返回、文件下载声明各自的类型（`application/x-ndjson`、`text/event-stream`、`application/octet-stream`），不写成 JSON                                                                                                                                                                             |

输入对象按类别区分（这一条现在已经生效）：

| 输入类别          | 写法             | 遇到多余字段             | 原因                                                                                      |
| ----------------- | ---------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| 请求内容（json）  | `z.strictObject` | 返回 400，指出是哪个字段 | 防止拼错字段被悄悄忽略、防止偷塞字段；与谷歌云 API 对未知字段报 `Unknown name` 的做法一致 |
| 查询参数（query） | `z.object`       | 悄悄去掉，不报错         | 避免误伤前端库和代理自动加的 `?_t=…` 等参数                                               |
| 路径参数（param） | `z.object`       | 不会有多余               | 路由已限定参数                                                                            |

两种写法下处理函数都只拿得到声明过的字段。前端提交修改时只传要改的字段，不要把查询结果整个提交回来。

按规范写出来的一个完整接口（辅助函数的名字和签名以实现为准）：

```ts
// packages/plugins/app-plugin-hub/server/routes/schemas.ts
import { z } from 'zod';

export const AppParams = z.object({ appId: z.string() }); // 路径参数：z.object

export const DeployAppInput = z.strictObject({
  // 请求内容：z.strictObject
  releaseId: z.string().meta({ description: 'The release to deploy.' }),
});

export const HubDeployment = z
  .object({
    id: z.string(),
    status: z.enum(['pending', 'running', 'succeeded', 'failed']),
    createdAt: z.iso.datetime(),
  })
  .meta({ ref: 'HubDeployment' });

export type DeployAppInput = z.infer<typeof DeployAppInput>; // 服务层直接用这个类型
export type HubDeployment = z.infer<typeof HubDeployment>;

// packages/plugins/app-plugin-hub/server/routes/apps.ts
import {
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router'; // 框架提供（待实现），插件不直接导入 hono-openapi

routes.post(
  '/apps/:appId/deploy',
  auth.required(), // 权限检查排在输入校验之前
  describeRoute({
    tags: ['Hub'],
    operationId: 'hubDeployApp',
    summary: 'Deploy an app',
    responses: {
      202: dataResponse(HubDeployment),
      ...apiErrorResponses,
    },
  }),
  apiValidator('param', AppParams),
  apiValidator('json', DeployAppInput),
  async (c) => {
    const { appId } = c.req.valid('param'); // 已校验、带类型
    const input = c.req.valid('json');
    return c.json({ data: await deployments.deploy(appId, input) }, 202);
  },
);
```

**CI 怎么检查：** 新增一个 `check-openapi` 脚本，为每个应用模板生成一份文档，然后依次检查：每个接口都有 `tags`、`summary`、`operationId`，且 `operationId` 不重复；没有声明的 `/api` 路由直接报错；生成结果和每个模板提交在仓库里的 `openapi.json` 快照一致；再用 `oasdiff` 找出破坏性变化，有破坏性变化时必须在 PR 里明确确认。

### 待定事项

以下问题还没有结论，在 OpenAPI PR 里定：

- **文档页面用哪个界面**：建议用 Swagger UI，页面资源由应用自己提供，因为从 CDN 加载会让内网和离线部署的应用打不开。
- **谁能访问**：一种是要求登录，再加一个配置开关；另一种是上文原稿的设想，外部合作方凭 API Key 访问。两种都待定。
- **数据接口在第一期是否按字段生成结构**，还是先只描述通用的请求和返回外形。
- **插件补声明时的 changeset 级别**。
- **Better Auth 文档的合并、前端类型生成是否和文档生成放在同一期。**

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

- **自动生成的接口文档（Swagger）**，外部开发者和合作方可以直接查阅、在线试调，不用再读源码。
- **对外接入门槛下降**：所有接口一个格式，学会一个就会用全部。
- **AI Agent 开发更可靠**：它们照着机器可读的规范写接口，不再模仿各插件的不同写法。
- **前端代码更少出错**：接口类型可以从文档自动生成，不用手写。
- **不会再退化**：规范写进自动检查，新代码不合规就过不了合并。

### 要付出什么

- **一次性的破坏性改动**：旧地址不保留。我们自己的前端在同一批改动里已经同步改好；已经在 beta 版上做了集成的外部用户需要按对照表调整。Hub 和 hub-cli 需要一起升级；应用里从 Registry 安装的 `nocobase-ai` 前端代码，需要和 AI 员工插件一起更新。
- **版本号跳变**：改动过的插件发布大版本。目前 1.0 测试版的包（如 Hub、工作流、用户）会直接进入 2.0 测试版。
- **工程投入**：规范和框架兜底、存量迁移已经完成（PR #530、#532），剩下的是接口文档生成、前端类型生成和框架层的限制配置。
- **暂不做接口版本号**：现阶段接口随插件版本一起升级，等对外接口稳定后再单独设计。

## 07 执行计划与当前进度

先定规范、打好底，让新写的代码不再增加混乱；再迁移存量接口；最后把规范放进自动检查，防止回退。

### 第一步：定规矩（已完成，PR #530 已合并）

- **规范成文**：写入根目录 `AGENTS.md` 和 `@nocobase/app-skills` 的技能文档 `references/http-api.md`。
- **框架兜底**：统一的错误格式；所有意外错误都返回不透明的 500；每个响应都带 `x-request-id`；`/api` 下的未知地址返回 JSON 格式的 404 `ROUTE_NOT_FOUND`，不再返回前端页面。
- **插件模板更新**：`create-plugin` 生成的插件自带接口规范说明。

### 第二步：迁移（PR #532 已完成，待合并）

- **存量迁移**：Hub 和 hub-cli、用户、认证、权限（含三个规则插件）、API Key、工作流、定时任务、多语言、通知、站内信、文件、数据库浏览器、AI 员工，以及所有示例插件和应用模板，前端同步改好。
- **数据接口**：分隔符由冒号改为斜杠，暴露名改为必须是 camelCase。
- **前端**：`ApiClientError` 只读标准错误体里的 `reason`，旧的 `{ code }` 兼容去掉了。
- **发布**：#532 合并后立即发布，改动过的插件统一发布大版本，changeset 里附改动对照说明。
- **pro 仓库**：邮件和 AI 知识库插件的迁移 PR 已经开出，跟在 #532 之后合并。

### 第三步：守住（后续）

- **接口文档生成**：单独一个 PR，做法见第 04 节，包括 `check-openapi` 自动检查。
- **前端类型自动生成**：从接口文档生成，不再手写。
- **框架层限制**：计划在 `config.yml` 里加一个 `api` 段，配置全局请求内容大小上限、请求超时和限流，默认都不限制、不开启；正在设计中。

## 08 请确认

- [ ] 采用谷歌 API 设计规范作为 NocoBase 3 接口统一标准，动作分隔符用斜杠代替冒号。
- [ ] 以下五类接口作为例外：自动生成的数据接口保留原有动作（只换分隔符）；文件插件的 `uploadOne` / `uploadMany` 归入数据接口；第三方登录库在 `/api/auth/` 下的接口保持原样；`GET /api/healthz` 保持原样；流式返回保持各自的帧格式，开流前能发现的错误先按统一格式返回。
- [ ] 接口文档（Swagger）从代码自动生成，不手写，在后续 PR 里实现。
- [ ] 现有接口一次性迁移，不保留旧地址；改动过的插件发布大版本，接受 1.0 测试版直接进入 2.0 测试版。
- [ ] 现阶段不做接口版本号。
- [ ] 按第 07 节的进度继续：#532 合并后立即发布，接口文档生成另起 PR。

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
- **输入**：用 zod 通过 `validator()` + `parseApiInput()` 校验，请求内容用 `z.strictObject`，查询和路径参数用 `z.object`；禁止 `z.any()`，`z.unknown()` 只在写明理由时使用。每个请求内容都配 `bodyLimit`，超出返回 413 `BODY_TOO_LARGE`。
- **权限**：权限检查放在 `validator()` 之前的中间件里，先于「是否存在」判断；权限通过之前不写入任何东西。
- **错误**：抛 `ApiError`，不手写错误体。插件只用 `apiErrorHandler(error, context)` 这一个错误接口：路由自己的 `onError` 只负责把本插件的领域错误转成 `ApiError`，其余一律交给它；框架认得 `ApiError`、`HTTPException`、带 4xx `status` 的错误，以及状态不是 `INTERNAL` 的数据仓库错误，其余重新抛出、按 500 处理。插件不自己翻译数据仓库错误。
- **domain**：一个插件一个 `domain`，即它的命名空间；转交的错误保留原插件的 `domain`（如 `LAST_ASSIGNMENT` 仍是 `authorization`）；框架和数据仓库的错误用 `app`。
- **数据仓库错误**：每个错误码在 `@nocobase/db` 的 `repositoryErrorStatuses` 里声明自己的状态；状态为 `INTERNAL` 的（服务端自己的问题，如 Policy 不合法）按不透明的 500 返回；其余保留错误码作为 `reason`，`path` 和 `details` 放进 `metadata`，`INVALID_ARGUMENT` 类还会在 `fieldViolations` 里指出字段。`RELATION_TARGET_NOT_FOUND` 是 400，因为缺的是请求内容里引用的目标。
- **框架兜底**：`/api` 下的未知地址返回 JSON 格式的 404 `ROUTE_NOT_FOUND`，不返回前端页面；意外错误返回 500 `INTERNAL_ERROR`；每个响应都带 `x-request-id`；错误体字段包括 `fieldViolations` 和 `metadata`。
- **框架层限制**：计划在 `config.yml` 的 `api` 段配置全局请求内容上限、请求超时和限流，默认都不限制、不开启，正在设计中。

---

参考：Google API Improvement Proposals（aip.dev），重点为 AIP-121 资源设计、AIP-131~135 标准方法、AIP-136 自定义方法（分隔符改为斜杠）、AIP-158 分页、AIP-193 错误。现状数据来自 HTTP API 体检报告，基于 develop @ fac3d58f 的静态代码阅读。实现以 `@nocobase/app-skills` 的 `references/http-api.md` 和根目录 `AGENTS.md` 为准。
