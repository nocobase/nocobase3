# 确定外部通知实现的借鉴与复用边界

Type: research
Status: resolved

## Question

Novu、Notifme、Better Notify 与 Laravel Auditing 的官方文档和源代码分别能为 Provider Adapter、编排、审计目录结构与公开 API 提供哪些可复用事实；哪些代码或 API 不应进入通知管理 3.0 的公共契约？

## Answer

研究结论见[《外部通知实现的借鉴与复用边界》](../research/01-reuse-boundaries.md)。核心边界是：Provider Adapter 只接收已渲染的渠道消息并归一化第三方结果/回执；路由、重试、Fallback、队列、模板和审计由核心模块拥有。可借鉴四个项目的分层与目录职责，但不得把 Novu/Notifme/Better-Notify/Laravel Auditing 的平台类型、策略函数、第三方透传字段或 ORM Contract 提升为通知管理 3.0 公共 API。

后续范围收缩后，本期只采用“Adapter 接收最终内容并归一化结果”和“核心自持重试、Fallback、队列与投递账本”两项边界；模板和声明式路由不再进入本期。
