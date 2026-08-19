# 确定模板发布、版本与渲染契约

Type: grilling
Status: resolved
Resolution: out-of-scope-after-scope-reduction

## Question

通知类型、Channel 模板、locale 变体、变量 Schema、草稿、发布版本和渲染快照如何建模；模板作者属于哪种信任级别，Node 运行时基线如何约束模板引擎与 HTML 清洗组合；发布与触发时怎样验证缺失语言、未知变量、不安全 HTML 和 Channel 专用约束，并保证重试结果稳定？

## Answer

本期不建设数据库模板、模板编辑器、草稿/发布、多语言变体、历史版本选择或业务员模板配置。后续 Trigger 契约恢复了随代码发布的开发者内部模板，但它没有运行时发布生命周期，并在触发时保存不可变内容快照；因此本票据所问的模板发布与管理能力仍因范围收缩关闭并保留在地图的“Out of scope”。
