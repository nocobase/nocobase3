# 确定系统 Trigger、显式 Recipient 与内容快照契约

Type: grilling
Status: resolved

## Question

核心 TypeScript `trigger()` 与鉴权 HTTP API 应接收和返回什么；如何表达来源、显式 `userId`、显式 Channel 地址、In-app/Email 已渲染内容和目标 Channel；怎样校验 HTML、文本与跳转 URL，读取 NocoBase 用户地址并形成不可变接收者与内容快照，同时明确拒绝筛选条件、变量、优先级、`sendAt` 和幂等 key？

## Answer

范围在讨论中修正为：保留开发者注册的内部模板、显式变量和逐 Recipient 个性化渲染，但不提供业务用户模板管理、模板 CRUD、草稿、发布、手工发送或多语言自动选择。Trigger 仍支持调用方直接提供最终内容。

### Trigger 输入

核心 TypeScript API 为 `notificationService.trigger(input)`，HTTP 为 `POST /api/notifications/trigger`。每次输入包含稳定机器来源：

```ts
source: {
  type: string;
  referenceId?: string;
}
```

`source.type` 例如 `workflow.order.approved`；`referenceId` 只用于追踪，不参与幂等。认证得到的 actor 与 source 分开保存，请求不能伪造 actor。调用方仍显式选择 `templateKey`，source 不自动映射模板。

消息输入为互斥联合：

```ts
type MessageInput =
  | { kind: 'content'; content: ChannelContent }
  | { kind: 'template'; templateKey: string; variables?: Record<string, unknown> };
```

直接内容模式由所有 Target 共享；模板模式使用公共变量和每个 Target 的个性化变量逐 Delivery 渲染。两种模式不能同时出现。

### Recipient Target 与展开

Recipient 使用严格联合：

```ts
type RecipientTarget =
  | { kind: 'user'; userId: string; channels: Array<'inApp' | 'email'> }
  | { kind: 'email'; address: string };
```

- User Target 的 In-app 使用 `userId`，Email 在 Trigger 时从 NocoBase 用户资料读取地址；不允许调用方在同一 Target 中覆盖用户 email。
- Email Target 只生成 Email Delivery，不创建 UserNotificationItem，也不与 NocoBase 用户建立隐式关系。
- 每个 Target 可携带独立 `variables`；模板上下文只包含显式 `common`、`recipient` 与最小 `identity` 命名空间，不暴露完整 User 对象、数据库、请求、日志器或其他运行时服务。
- User Target 的每个唯一 Channel 生成一个 Delivery；Email Target 固定生成一个 Email Delivery。Template Definition 必须覆盖所有请求的 Channel。
- 展开后按 `userId + inApp` 或规范化 Email 地址检查请求内重复；重复则整体拒绝。不同请求之间不做去重，相同请求重复调用会创建不同 Notification。

### 内部 Template Registry

- 模板只由开发者在代码或 `registry/notification/config` 注册，不使用数据库模板表，也没有 CRUD、草稿、发布和管理 UI。
- Template Definition 必须声明唯一 `key`、显式 `version`、公共变量 Schema、逐 Recipient 变量 Schema 和 Channel 模板；修改模板、Schema 或 Channel 内容必须提升 version。
- Portal 激活时一次性加载全部模板，检查 `(key, version)` 唯一，验证 Schema 与 Channel 定义，解析并缓存模板 AST，拒绝非法 Tag、Filter、变量引用和文件读取。任何模板无效都会使 Portal 激活失败，单次运行期间不热更新。
- 使用 LiquidJS 10.27.2+，显式开启 `strictVariables`、`strictFilters`、`ownPropertyOnly`、`outputEscape`，关闭 `lenientIf`，并设置非空的解析、渲染、内存与输出限制。
- 一期只允许变量插值、`if/elsif/else/unless/case` 和少量无 I/O、无反射的 allowlist Filter；禁止 `raw`、循环、include、layout、partial、动态文件读取、自定义 Tag 与宿主函数。
- 模板由受信开发者随代码发布，一期不使用独立渲染进程；所有变量仍按不可信数据处理。
- 一期没有 locale 变体或自动语言选择。不同语言使用不同 template key，由调用方选择。

### 渲染、内容策略与快照

Trigger 按以下顺序完成预检：校验公共变量，校验每个 Target 的个性化变量，解析 Recipient 地址，逐 Delivery 渲染，校验最终 Channel 内容，再持久化。未知变量、缺失变量、无效 Recipient、缺失 Channel 模板或任一渲染失败都会整体拒绝，不创建 Notification。

In-app 内容为纯文本 `title`、纯文本 `body` 和可选 `actionUrl`；actionUrl 只允许 Portal 内相对路径。Email 内容要求单行纯文本 `subject`、必填纯文本 `text` 和可选 `html`；subject 禁止 CR/LF。

Email HTML 在渲染后通过 Node 20 兼容的 `rehype-sanitize` 最小 allowlist 清洗，只允许基础段落、强调、列表、代码、表格和链接；链接协议限 `https`、`http`、`mailto`。禁止 script、iframe、form、SVG、MathML、事件属性、远程图片和 inline style。直接内容与模板输出使用相同的最终校验和大小限制。

每个 Delivery 保存不可变 Channel Content Snapshot。模板模式额外保存 `templateKey`、`templateVersion` 与 `templateContentHash`；Worker、Retry、Fallback 和人工重投只读取快照，永不重新渲染。代码中的模板变化只影响新 Notification，调用方不能选择历史版本，历史版本不需要继续保存在 Registry。

Recipient Snapshot 只保存投递所需的 `kind`、`userId` 和所请求 Email Channel 的规范化 email，或直接 Email Target 的规范化 email；不保存姓名、角色、部门或完整 User。用户后续修改 email 不影响已有 Delivery。日志和普通列表只返回脱敏地址，数据库字段加密留给数据安全票据决定。

### 原子性、限制与返回

- Recipient 与内容解析阶段全有或全无。默认最多 1,000 个 Target、2,000 个 Delivery；公共变量与全部逐人变量 JSON 总大小不超过 1 MiB；单个 Email HTML 不超过 1 MiB。其他字段长度由中央 Channel Policy 常量维护，超限在持久化前拒绝。
- 不接受 `idempotencyKey`、`sendAt`、priority、用户筛选条件或业务可编辑模板字段；严格 Schema 遇到这些字段会报错而不是忽略。
- 只有 Notification、全部 Delivery、Recipient Snapshot、Channel Content Snapshot 和初始 Status Event 在一个事务中提交成功后，`trigger()` 才返回；不等待 Worker 或 SMTP。
- 返回 `notificationId`、Notification 的 `queued` 状态以及每个 Delivery 的 ID、Channel 与 `queued` 状态，不返回完整地址、变量或内容。HTTP 成功为 `201 Created`。
- HTTP 错误模型为 `{ error: { code, message, issues?: [{ path, code, message }] } }`。`400` 用于不可解析请求，`401/403` 用于认证权限，`404` 用于模板不存在，`413` 用于大小/数量超限，`422` 用于 Recipient、变量、渲染、安全或重复目标失败，`500/503` 用于事务或服务不可用。
- 错误不得回显完整 HTML、变量对象、地址或凭证；事务失败不返回半成品 ID。
