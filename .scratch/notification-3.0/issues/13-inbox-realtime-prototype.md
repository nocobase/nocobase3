# 原型化顶部铃铛、Inbox 与实时恢复体验

Type: prototype
Status: resolved
Assignee: codex
Blocked by: 05, 11

## Question

用交互原型验证桌面端与移动端的顶部铃铛、最近通知浮层、完整 Inbox、已读/未读、全部已读、删除、分页，以及独立 Live Provider 断线重连和 HTTP 对账期间的反馈；哪些行为构成最终用户体验契约？

## Answer

> 后续数据模型修正：票据 17 将用户明确选择的“按两条显示，不过度处理”设为最终规则。同一 Notification 对同一 userId 同时请求 In-app 与 Email 时，通知中心显示两个独立 UserNotificationItem，分别拥有显示快照、readAt 与 deletedAt；本原型关于跨 Channel 单行聚合的交互结论已被覆盖，其他铃铛、筛选、分页、Mutation 和 Live 恢复结论继续有效。

### 原型资产与验证

- [可直接打开的交互原型](../prototypes/inbox-realtime/index.html)
- [评审路径、原型结论与非目标](../prototypes/inbox-realtime/README.md)
- 原型使用静态 Inbox 数据和可控 Live 状态，不依赖构建、HTTP API 或 WebSocket；缩小到 680px 以下自动切换移动布局。
- 已在桌面 Chrome 实际渲染，并通过 DevTools Protocol 自动验证十二条路径：初始未读数、打开铃铛不自动已读、打开单条通知、未读筛选、全部已读、重新标未读、删除确认、分页、断线恢复、序号缺口对账、新事件 HTTP 刷新和移动端全宽铃铛面板。全部通过且无运行时异常。

### Header 铃铛与最近通知

- 铃铛位于桌面和移动 Header 的主题/设置操作与用户菜单之间；视觉 badge 最大显示 `99+`，无未读时隐藏。可访问名称必须包含真实未读数，例如“3 条未读通知”，不能只依赖红点。
- 桌面使用最大约 400px 的右对齐浮层；移动端使用 Header 下方占满剩余视口的面板。两者展示相同缓存和操作语义，不维护两套数据状态。
- 浮层最多展示最近五条未删除用户通知，包含标题、两行正文摘要、Channel 标签、相对时间、来源和明确未读标识；提供“全部已读”和唯一的“查看全部通知”出口，不加入筛选、分页、Delivery 状态或管理功能。
- 打开铃铛本身不改变已读状态。点击通知时只将该 UserNotificationItem 标为已读，并导航到其 Portal 内相对 actionUrl；没有 actionUrl 时只标为已读。标记请求不得阻塞导航，失败时回滚缓存并在后续 HTTP 对账中收敛。

### 完整 Inbox

- 完整页面提供 All/Unread、Channel 类型筛选、普通分页、刷新、全部已读和单条操作；Channel 首期包含站内信与邮件。不使用无限滚动，也不增加文件夹、Topic、用户偏好、订阅管理或投递诊断。
- 同一用户的一次逻辑 Notification 按 Channel 显示独立条目；同时请求站内信和邮件时显示两条，分别使用各自 Channel 的内容并独立已读或删除。直接 Email Recipient 因没有 NocoBase userId，不进入任何用户通知中心。
- 用户通知中心的 readAt 表示用户是否在 Portal 查看过该 Channel 条目，不代表邮件被打开或送达。用户投影不复用 Delivery 状态推断已读。
- Channel 筛选必须由通知服务执行，不能只过滤前端当前页。查询形式为 `GET /api/notifications/inbox?channels=inApp,email&read=unread&page=1&pageSize=20`；`channels` 采用任一匹配语义，当前 userId 只能来自可信 Principal，不能作为客户端查询参数。
- 服务响应的每个用户通知项返回稳定 itemId、notificationId、单个 `channel`、readAt、createdAt 和该 Channel 的显示快照；分页总数与筛选后未读数均按相同服务端条件计算。铃铛总未读数默认跨全部 Channel，完整页面可显示当前 Channel 条件下的数量。
- 数据层需要稳定的每 Delivery 用户通知投影，避免列表查询时临时拼装导致分页和 readAt/deletedAt 不稳定；具体字段、唯一约束和索引由数据模型票据确定。
- 每行展示状态图标、标题、正文、来源、相对时间和未读标识。行操作支持“标为已读/未读”和删除；点击正文区域执行与铃铛一致的读取及 actionUrl 导航。
- 一期使用服务端分页，默认每页 20 条，排序为最新创建优先；切换筛选回到第一页。铃铛与完整页面共享同一 Query Cache 和 unread-count Query。
- 单条删除必须确认，成功后从当前用户 Inbox 软删除；删除不取消、不修改 Notification 或 Delivery。本期没有恢复入口，因此不提供容易误导的前端撤销。

### Mutation 与实时恢复

- 标为已读、标为未读、全部已读和删除采用乐观更新：立即同步铃铛、列表和未读数；HTTP 失败时回滚并提示；无论成功或失败，settle 后失效相关 Query 重新对账。服务端所有权检查始终以当前 Principal 为准。
- 收到 Live Event 后不直接修改内容或相信未读数，只在 100–250ms 内合并并失效 Inbox 列表、相关详情和 unread-count Query。新内容以 HTTP 响应为准，可短暂高亮帮助用户定位。
- 健康的实时连接不向用户显示“已连接”等实现状态。WebSocket 普通断线时保留已缓存内容，仅显示低干扰的“正在重连”；不清空 badge、不阻塞读取和 HTTP 操作。短期事件成功重放后静默移除提示。
- 收到 `resync_required`、streamId 变化或 sequence 缺口时显示“正在同步最新通知”，执行完整 Inbox 与未读数 HTTP 对账；完成前旧数据仍可阅读，完成后统一替换缓存，不逐条猜测缺失事件。
- 页面初次进入、重新获得焦点和用户手动刷新同样执行 HTTP 对账。WebSocket 不可用只降低即时性，不能影响 Inbox 的正确性和基本可用性。

### 可访问性与反馈

- 铃铛、未读状态、连接状态和危险操作必须同时使用文字或可访问名称，不能只使用颜色或动画。浮层和确认框支持 Escape 关闭，打开后焦点进入面板或确认操作。
- 全部已读在未读数为零时禁用；Mutation 成功、回滚、重连成功和对账完成使用简短状态提示，不为每条实时事件弹出干扰性 Toast。
