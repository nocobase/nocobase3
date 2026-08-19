# 确定独立 Live Provider 与实时事件协议

Type: grilling
Status: resolved
Assignee: codex
Blocked by: 05, 10

## Question

独立 Portal Live Runtime 如何参考 Refine `LiveProvider` 的 `subscribe`/`unsubscribe` 契约，以同源 WebSocket 完成 Upgrade、认证、应用/用户隔离、心跳、事件序号、重连和未来 Pub/Sub 注入；服务端 `LivePublisher`、通知模块发布的 Inbox Live Event、客户端自动或手动失效以及通过 HTTP 对账的契约分别是什么？

## Answer

### 独立模块与传输所有权

- 实时能力位于独立的 `registry/portal-live`，拥有服务端 `LivePublisher`、连接与订阅管理、客户端 Refine `LiveProvider`、协议类型和可替换 Live Bus Adapter。通知模块只依赖 `LivePublisher`，不创建 WebSocket、不维护连接，也不感知具体 Pub/Sub。
- 一期使用同源 `/<app>/live` WebSocket。AppHost 保持现有普通 HTTP dispatch、懒激活和回收逻辑，只新增最小 `server.on('upgrade')` seam：解析 app、确保对应 runtime 激活、取得 WebSocket lease，再把 raw socket/head 交给该应用的 Portal Live Runtime。Standalone 使用同一个 Upgrade Adapter。
- Upgrade 不是 Fetch Request/Response 路由，不能复用现有 Hono HTTP proxy。AppHost 必须显式拥有 upgraded socket，并在应用回收或 Host 关闭时释放 lease 和强制关闭遗留连接。

### 认证与订阅隔离

- Cookie/SSO 会话在 Upgrade 阶段交给 `IdentityProvider` 验证；Bearer Token 因浏览器 WebSocket 不能设置 Authorization Header，在连接后的第一条 `auth` 帧中提交。Token 不进入 URL、订阅帧、日志或错误响应。
- Bearer 连接在认证前处于隔离状态，只允许一条 `auth` 帧；5 秒内未认证、重复认证或认证失败均关闭连接。认证成功后连接固定绑定 `appId + userId + effectiveRole`，服务端返回 `auth_ok`。登录、Token 或角色变化必须关闭并重连，不允许原连接替换 Principal。
- 客户端订阅只提交逻辑 Channel、事件类型、params 和本地 subscriptionId，不得提交 appId 或 userId。服务端通过注册的 `ChannelAuthorizer` 将 `notifications/inbox` 自动约束到当前连接的 appId 与 userId；通知事件永远不能被订阅成其他用户范围。
- 每连接默认最多 32 个活动订阅；未知协议版本、未知帧、非法 Channel、越权参数或超限请求以策略错误拒绝，不降级为宽泛广播。

### Refine LiveProvider 与帧协议

- 客户端实现 Refine `subscribe({ channel, types, params, callback })` 与 `unsubscribe(subscription)`。一期不实现客户端 `publish()`；领域事件只能通过可信服务端 `LivePublisher` 发布。Refine 参考契约见 [Live Provider 官方文档](https://refine.dev/core/docs/realtime/live-provider/)。
- 客户端控制帧为 `auth`、`subscribe`、`unsubscribe`；服务端控制帧为 `auth_ok`、`subscribed`、`unsubscribed`、`event`、`resync_required`、`server_draining` 和结构化 `error`。所有帧包含 `version: 1`，订阅响应必须回显 subscriptionId，重复 subscribe/unsubscribe 幂等。
- 通用事件信封为：

```ts
type LiveEvent = {
  version: 1;
  streamId: string;
  eventId: string;
  sequence: number;
  channel: string;
  type: string;
  occurredAt: string;
  payload: { ids?: string[] };
};
```

- 通知领域的 `inbox.created`、`inbox.updated`、`inbox.deleted` 和 `inbox.unread-count-changed` 经 Live Runtime 映射为 `channel: 'notifications/inbox'` 以及 `created`、`updated`、`deleted`、`unread-count-changed`。payload 只允许 UserNotificationItem ID 等最小失效提示，不携带 userId、标题、正文、地址、变量、完整条目或可信未读数。

### 序号、重放与 HTTP 对账

- Memory Live Bus 为每个 `appId + userId` 维护独立 `streamId` 与递增 sequence，并保留最近 100 条或最近 5 分钟的事件，以先达到的限制为准。客户端保存最后确认的 `{ streamId, sequence }`，重新订阅时作为 cursor 提交。
- Cursor 仍在缓冲窗口内时按 sequence 重放；streamId 变化、序号缺口、缓冲过期或发送端背压丢弃连接时返回 `resync_required`。客户端不得把 sequence 当成数据库版本或跨实例全局顺序。
- Live Event 只是瞬态失效提示，Inbox HTTP API 和数据库是唯一真相源。通知客户端使用 Refine `manual` 回调：`created/updated/deleted` 合并失效 Inbox 列表与相关详情，`unread-count-changed` 失效未读数；100–250ms 内的事件批量合并，铃铛与完整 Inbox 页共享查询缓存。
- 页面初次进入、重新获得焦点、收到 `resync_required` 或重连无法重放时执行 HTTP 对账。事件缺失、重复、乱序或发布失败不能破坏最终数据库状态。

### 心跳、发布与多实例边界

- 服务端每 30 秒发送 WebSocket Ping control frame，连续两个周期没有 Pong 即关闭。客户端重连使用带随机抖动的 1、2、4、8 秒指数退避，最大 30 秒；浏览器恢复在线、登录或角色变化时立即重连并重新订阅。
- UserNotificationItem 事务提交后才调用 `LivePublisher.publish()`。发布失败不回滚用户条目、不改变 Delivery 结果，只写入脱敏日志与指标；HTTP 对账负责最终收敛。
- 一期 `MemoryLiveBusAdapter` 只保证发布者与连接位于同一 Portal 实例时的即时分发。稳定 Adapter Interface 保留 publish、subscribe、start 和 stop；未来 Redis 等跨实例 Adapter 可替换实现，通知领域和事件信封不随之变化。

### 关闭契约

- 应用进入 draining 后拒绝新 Upgrade 和订阅，向已有连接发送 `server_draining`，停止 Live Bus 新消费，并在 AppScope 的统一绝对关闭期限内尝试排空发送缓冲。
- 每个 WebSocket 从 Upgrade 成功到 close 都持有应用 lease。期限耗尽后强制关闭该应用全部 socket，释放 lease，再继续其他 disposer；连接不得存活到应用数据库和通知 Worker 已关闭之后。
