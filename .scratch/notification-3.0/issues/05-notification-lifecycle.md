# 确定通知、投递与尝试的完整生命周期

Type: grilling
Status: resolved

## Question

Notification、Delivery、DeliveryAttempt、Delivery Status Event 与 UserNotificationItem 各自允许哪些完整状态和转换；一期 In-app/SMTP 如何只实现 `queued`、`sending`、`accepted`、`failed` 与人工重试，同时为未来 `delivered`、`bounced`、`rejected`、`canceled`、`expired` 和不确定提交保留不误导当前产品的扩展语义？

## Answer

### 状态所有权

- Notification 保存从全部 Delivery 派生的当前汇总投影，不直接驱动单次发送。
- Delivery 拥有“一个 Recipient、一个 Channel”的当前投递状态，是 Worker 调度与人工重投的工作对象。
- DeliveryAttempt 表示对一个 ProviderInstance 的一次实际调用。Retry 与 Fallback 都创建新 Attempt；完成的 Attempt 不覆盖、不重新打开。
- Delivery Status Event 追加保存每次 Delivery 状态转换。Delivery 与 Notification 的当前状态是查询投影，历史以 Event 和 Attempt 为准。
- UserNotificationItem 是一个 userId Delivery 在对应 Channel 上的独立用户投影，不复用投递状态，只通过 `readAt` 与 `deletedAt` 表达用户侧的已读和软删除状态；删除它不取消 Notification 或 Delivery。同一 Notification 同时请求 In-app 与 Email 时生成两个条目，不做跨 Channel 聚合。

### Delivery 状态

一期可达状态：

- `queued`：等待首次发送、自动重试或下一个 ProviderInstance；只有该状态可被 Worker 领取。
- `sending`：Worker 已持有租约且恰有一个执行中的 Attempt。
- `accepted`：Provider 明确接受提交，但没有送达证据。SMTP 明确成功进入该状态，一期报表可将其计为成功，但 UI 必须显示“已接受”而非“已送达”。
- `delivered`：有明确证据到达目标。In-app/db 在对应 UserNotificationItem 可见性事务提交后直接进入该状态。
- `failed`：已知失败，且自动 Retry 与 Provider Chain 均已耗尽。
- `submission_unknown`：Provider 可能已接受但本地无法确认；自动 Retry 和 Fallback 必须停止，由管理员处理。即使存在 Trigger 或本地任务幂等，标准 SMTP 也没有可靠的 Provider 端幂等提交或结果查询，不能消除该歧义。

未来保留状态：

- `bounced`：Provider 接受后确认退回。
- `rejected`：Provider 明确拒绝接收。
- `canceled`：尚未发送时被明确取消。
- `expired`：尚未发送但超过允许处理期限。

一期不建设通用回调、取消或过期能力，不为保留状态提前实现不可达业务代码。

### Delivery 转换

- 创建：`queued`。
- Worker 原子领取并创建 Attempt：`queued → sending`。
- SMTP 明确成功：`sending → accepted`。
- In-app UserNotificationItem 可见性事务成功：`sending → delivered`。
- Attempt 明确失败但仍有 Retry 或 Fallback：`sending → queued`。
- 已知失败且自动机会耗尽：`sending → failed`。
- 提交结果不确定：`sending → submission_unknown`，不得自动重试。
- 未来回执允许 `accepted → delivered | bounced | rejected`，以及 `submission_unknown → accepted | delivered | failed | rejected`。
- 未来取消与过期只允许 `queued → canceled | expired`；`sending` 期间不允许人工重试、取消或修改 Provider Chain。
- `accepted` 不得转成普通 `failed`；后续负面证据必须使用 `bounced` 或 `rejected`，保留 Provider 曾接受的事实。

### DeliveryAttempt

- Attempt 状态为 `sending → accepted | delivered | failed | submission_unknown`。
- ProviderInstance、开始/结束时间、错误分类和脱敏结果保存在对应 Attempt。
- Worker 恢复遗留的 `sending` Attempt 时，如果无法证明 Provider 调用尚未发生，则将 Attempt 与 Delivery 转为 `submission_unknown`，不能直接创建新 Attempt。

### Notification 汇总投影

Notification 当前状态为：`queued | processing | succeeded | partially_succeeded | failed | attention_required`，按以下优先级派生：

1. 任一 Delivery 为 `submission_unknown`：`attention_required`。
2. 全部 Delivery 为 `queued`：`queued`。
3. 任一 Delivery 为 `queued` 或 `sending`：`processing`。
4. 全部 Delivery 为 `accepted` 或 `delivered`：`succeeded`。
5. 至少一个成功类状态、至少一个失败类状态：`partially_succeeded`。
6. 全部为失败类状态：`failed`。

成功类为 `accepted | delivered`；失败类为 `failed | bounced | rejected | canceled | expired`。该状态是可重建的当前投影而非不可逆终态；未来迟到回执可以使其从 `succeeded` 变为 `partially_succeeded` 或 `failed`，历史由 Status Event 解释。

### 人工重投

- `failed → queued`：管理员可重新打开原 Delivery。
- `submission_unknown → queued`：管理员必须明确确认可能造成重复发送。
- 人工重投沿用原 Notification、Recipient、Delivery 与不可变内容快照，创建新 Attempt，并记录操作者、原因和时间。
- `accepted` 与 `delivered` 不允许人工重投。需要修改接收地址或内容时必须创建新 Notification。

### 原子性、实时事件与扩展

- 每次状态变化必须在同一数据库事务中更新 Delivery 当前投影、插入 Delivery Status Event、重算 Notification 汇总，并在 userId Delivery 达到对应 Channel 的用户可见成功条件时更新 UserNotificationItem；任一步失败则全部回滚。
- Live Event 只能在事务提交后发布；数据库始终是事实来源，客户端丢失实时事件后通过 HTTP 对账。
- 所有状态变化必须经过中央领域状态机校验，业务代码不得直接写状态字符串。
- 当前版本只开放一期转换；未来状态的名称与语义现在固定，未来 Provider 启用新转换时必须显式升级状态机并增加迁移兼容检查与测试。
- API 和 UI 遇到无法识别的未来状态时显示“未知状态”，不能崩溃，也不能错误归类为失败。
