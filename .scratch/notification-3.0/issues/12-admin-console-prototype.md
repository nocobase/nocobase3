# 原型化通知管理后台信息架构

Type: prototype
Status: resolved
Assignee: codex
Blocked by: 07, 10

## Question

用低成本交互原型验证 Provider 配置与 Delivery Log 两个管理区域的导航、配置描述驱动表单、固定 Provider 顺序、测试连接、投递列表、Attempt 详情、失败原因、人工重试和角色可见性；什么信息必须首屏呈现，什么应按需下钻？

## Answer

### 原型资产与验证

- [可直接打开的交互原型](../prototypes/admin-console/index.html)
- [运行路径、评审步骤与原型结论](../prototypes/admin-console/README.md)
- 原型不依赖构建或网络，使用静态模拟数据覆盖 accepted、delivered、queued、sending、failed 与 submission_unknown。
- 已使用桌面 Chrome 实际渲染，并通过 DevTools Protocol 自动验证：投递表渲染、未知提交详情、重投二次确认、Operator/User/Admin 权限切换、Provider 页面和连接测试共八条交互路径全部通过，页面无运行时异常。

### 信息架构

- 管理导航只保留 `Delivery log` 与 `Providers`。不增加 Overview、Template、手工发送或 Queue 页面；处理中、最近成功、最终失败和需要关注只作为 Delivery Log 页内的轻量摘要及快捷认知，不形成独立仪表盘。
- Operator/Admin 权限矩阵仍作为未来 AuthorizationPolicy 的目标；后续票据 18 覆盖了首期临时行为：ACL Adapter 未接入时，所有已认证 Portal 用户都可实际查看和操作 Delivery Log、人工重试、Providers 与连接测试。该临时访问必须醒目标注，并在正式 ACL 接入后移除。
- 原问题中的“配置描述驱动表单”根据最终范围修正为“配置 Schema 驱动的只读投影”。Provider 配置、Secret 状态与顺序来自 `registry/notification/config/providers.ts`，浏览器没有保存、清除凭证、启停或重排操作。

### Delivery Log 首屏与下钻

- 首屏必须呈现 Delivery ID、脱敏 Recipient、Channel、当前状态、当前或最后 Provider、Attempt 数量、最近归一化错误、业务 source 和更新时间。筛选保留状态、Channel 与统一搜索；一期不需要复杂报表或 Queue 控制。
- `submission_unknown` 使用独立警示色和“需要关注”语义，不能混入普通 failed。accepted 显示“已接受”，不得显示为 delivered。
- 点击行打开右侧详情。Notification ID、完整 source、Provider chain cursor、不可变内容快照标识、每次 Attempt 的 Provider、时间、结果、configRevision、脱敏错误和状态历史均按需下钻，不挤入列表。
- 一期详情不默认展示标题、正文、变量、完整地址或 Provider 原始响应；后续若允许查看敏感内容，必须另设能力、审计和脱敏策略。

### 人工重投

- 只有 failed 与 submission_unknown 显示人工重投操作；accepted、delivered、queued 和 sending 不显示。
- 重投必须填写原因，沿用原 Delivery、Recipient 与不可变内容快照并创建新 Attempt。failed 使用普通确认；submission_unknown 必须额外确认“Provider 可能已经接受，本次操作可能重复发送”，否则按钮保持禁用。
- 重投成功后列表应通过 HTTP 重新查询，不在客户端直接伪造 queued 状态；操作人、原因和时间进入审计票据定义的记录。

### Provider 页面

- Provider 按 Channel 展示固定有序链，首屏显示顺序、稳定实例 ID、Provider Type、启用状态、Host/Port、安全模式、脱敏用户名和 configRevision。
- 详情下钻展示配置 Schema 生成的只读字段、Secret 引用名和“已配置”状态，永不返回 Secret 明文。
- Admin 可执行连接测试；确认界面明确说明只检查连接、TLS 和认证，不发送测试邮件。结果与错误在当前操作中显示并写入管理员审计，不创建 Notification、Delivery 或 Attempt。
