# 确定身份转译、ACL 与 Worker 服务身份契约

Type: grilling
Status: resolved
Assignee: codex

## Question

本地通知 API 和 WebSocket 如何验证 NocoBase 会话并得到稳定用户与角色；普通用户、通知运维和通知管理员如何映射到 NocoBase ACL；后台 Worker 访问 Recipient 数据时使用什么服务身份并避免用户请求权限被错误放大？

## Answer

### 身份适配边界

- 通知模块只依赖抽象 `IdentityProvider`，不解析 NocoBase Token、不维护账号、会话或角色副本。后续专门身份模块注入正式实现；一期的 `NocoBaseIdentityProvider` 复用当前请求凭证，通过 NocoBase `auth:check` 与 `roles:check` 得到可信 `userId`、有效角色和角色集合。
- 服务端不得相信请求体中的 actor、userId 或浏览器自行声明的角色。客户端选择的 `X-Role` 只作为希望使用的角色交给 NocoBase 验证，授权只使用该请求的有效角色，不合并用户拥有的全部角色。
- 浏览器 API 同时允许 Bearer Token 和现有 Cookie/SSO 会话。Cookie 模式的非安全方法必须校验同源 `Origin` 以及现有 CSRF Cookie/Header；Bearer 模式不依赖 CSRF。
- 一期不做跨请求身份或授权缓存，只允许一次请求内部合并重复校验。面向用户的 HTTP 或 WebSocket 无法验证 NocoBase 身份时失败关闭；这不会阻塞使用内部系统主体的服务间 Trigger。

### 一期临时授权策略

- 本期先定义 `AuthorizationPolicy` 注入点和稳定能力名，但暂不接入 NocoBase ACL、ACL Snippet 或角色到能力的本地配置映射。后续专门 ACL 模块负责把有效 NocoBase 角色映射为通知能力。
- 目标权限矩阵保持为：已登录用户只能管理自己的 Inbox；Operator 可查看 Delivery/Attempt、失败原因和健康状态并人工重投；Admin 继承 Operator，并可查看脱敏 Provider 配置及测试连接；Sender 才能调用 HTTP Trigger，Admin 不自动获得 Sender 能力。
- 自身 Inbox API 要求可信登录身份并强制 `ownerUserId === principal.userId`；HTTP Trigger 固定返回 `403 HTTP_TRIGGER_DISABLED`。后续票据 18 覆盖了管理 API 的临时策略：正式 AuthorizationPolicy 接入前，Provider、Delivery Log、人工重投和连接测试暂时允许所有已认证 Portal 用户使用，并在文档中标记为必须随 ACL 接入移除的 TEMPORARY 边界。
- 前端隐藏按钮和路由只用于体验，所有所有权检查、能力检查和临时拦截均以服务端为准。

### 系统 Trigger 与审计主体

- 内部 TypeScript Trigger 是一期其他服务的实际调用入口。Host 为受信调用方注入不可由 Trigger 输入构造的系统主体，例如 `{ kind: 'system', service: 'workflow', referenceId }`；请求体仍不能传 actor。
- HTTP 调用未来保存可信的 NocoBase `userId` 和有效角色；内部调用保存系统服务名和业务关联 ID。Notification 的 source 描述业务来源，Actor 描述谁发起调用，两者不可混用。
- NocoBase 身份服务异常只影响浏览器 HTTP/WebSocket 和未来 HTTP Trigger；内部服务调用不经过 NocoBase 用户认证，因此不会因 `auth:check` 不可用而停止。

### Recipient 资料与 Worker 最小权限

- User Recipient 的 Email 地址只在 Trigger 阶段通过注入的 `RecipientProfileResolver` 获取。该实现使用受限 NocoBase 服务凭证，只允许按已经明确给出的 userId 读取投递必需的 `id`、`email` 和可用状态；必须先授权 Trigger，再调用 Resolver，结果不直接返回调用方。
- Resolver 不支持用户筛选、群组展开或任意用户查询。解析结果进入 Recipient Snapshot，后续发送不再回查 NocoBase。
- Worker 不持有 NocoBase 用户服务凭证，固定使用内部审计主体 `system:notification-worker`，只读取通知数据库中的 Delivery、Recipient Snapshot 与 Content Snapshot，并调用 Provider。这避免后台执行继承或放大原请求用户权限。

### WebSocket 身份边界

- 独立 Portal Live Runtime 使用同一个 `IdentityProvider`：Cookie/SSO 可在 Upgrade 阶段验证，Bearer Token 在连接后的隔离首帧验证；认证成功后连接固定绑定到 `appId + userId + effectiveRole`，通知模块只向该 userId 发布 Inbox 信号。
- 登录或角色变化后由客户端关闭并重新建立连接，不允许在现有连接中替换身份。连接生命周期、事件协议、重放与对账继续由实时事件票据定义。
