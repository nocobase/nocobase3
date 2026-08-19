# 确定最小主干的一期验收契约

Type: grilling
Status: resolved
Assignee: codex
Blocked by: 04, 07, 09, 11, 12, 13, 14

## Question

综合已关闭票据后，系统 Trigger、显式 Recipient、In-app/db、Email/SMTP、Fake Provider、立即异步 Worker、固定顺序 Fallback、Provider 配置、Delivery Log、Inbox 与 WebSocket 的实现就绪验收契约是什么；哪些剩余未知仍会阻断这条最小主干的开发？

## Answer

一期按“可集成的完整核心模块”交付，而不是只交接口或骨架：通知领域、管理端、Inbox、Worker 与独立 Portal Live Runtime 均需实现；数据库、身份和 ACL 维持显式 Adapter 边界，并允许首期使用开发/测试实现完成端到端验收。

运行依赖采用显式策略：缺少持久化 Database Adapter 时通知模块激活失败，绝不在生产环境静默退化为内存存储；内存存储只能显式用于开发和测试。缺少 Identity Provider 时，直接 Email Target 仍可工作，但 userId Target、用户 Inbox 和 Live 认证不可用。HTTP Trigger 在正式 ACL 接入前继续返回 `HTTP_TRIGGER_DISABLED`；内部 TypeScript Trigger 使用 Host 签发的系统主体。管理后台功能必须实现并可实际查看和操作，首期使用临时访问策略，不因正式 ACL Adapter 缺失而隐藏整套功能；具体临时授权边界由公共 API 票据收口。

一期必须实现独立 `registry/portal-live`，包括 AppHost Upgrade seam、连接认证、服务端订阅授权、短期重放、断线恢复、`resync_required` 和 Inbox 的 HTTP 失效刷新。连接健康时不向普通用户显示“已连接”，只有重连或同步异常需要可见反馈。

必须通过的主干场景包括：直接内容原子触发；内部模板逐 Recipient 渲染并保存不可变快照；Recipient 全量预检；In-app 持久化后进入 `delivered`；SMTP 提交后进入 `accepted`；临时/永久/不确定错误按既定矩阵重试或 Fallback；Worker 崩溃与重复 Event Queue 信号恢复；高风险人工重试；Inbox 每 Channel 独立条目、筛选、未读和分页；Live 重放及 HTTP 对账；以及在绝对截止时间内停止 Dispatcher、Reconciler、数据库和 Live 连接。

SMTP 的自动化验收使用 Fake Provider 与本地 SMTP 测试服务器，不要求 CI 访问真实第三方账户。测试必须覆盖状态机、Schema、渲染与清洗、Provider 决策、事务/CAS、Worker 恢复、API 隔离、管理端和 Inbox 浏览器流程、真实 AppHost HTTP/WebSocket Upgrade 及优雅关闭。首期不设置吞吐量 SLO，但必须验证既定的 1000 Target、2000 Delivery 与请求体大小边界。

数据模型票据是编码硬前置；公共 TypeScript/HTTP API、Live API、错误码、临时管理授权和逐模块使用文档另立票据，同样在实现前解决。票据解决后，每个可独立调用的模块都必须附带面向集成方的使用文档，而不是只依赖源码类型。

一期继续明确排除：业务用户模板管理与手工发送、多语言、延迟/定时、优先级、幂等 key、业务去重、Topic/群组/动态筛选、声明式 Routing、Provider Webhook、跨实例 Live Pub/Sub、通用审计、默认数据清理、应用层凭证加密、旧模块迁移以及正式 NocoBase 身份/ACL 插件集成。数据库与 Queue 已由 2026-08-19 develop 新增共享包提供，纳入一期正式集成。
