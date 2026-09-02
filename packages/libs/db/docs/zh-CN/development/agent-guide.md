---
title: Agent 开发指南（导航）
description: 跳转到任务路由、实现护栏、工作流和验证指南；API 事实由对应专题维护。
---

# Agent 开发指南

Agent 文档已经按任务拆分。本页仅保留兼容入口，不再复制 Builder、Query、Migration、Seed 和 Metadata 的整套规则。

## 从这里开始

1. [AI Agent 数据库开发入口](../agent/index.md)
2. [任务路由](../agent/task-router.md)
3. [实现护栏](../agent/guardrails.md)
4. [验证指南](../agent/verification.md)

## 按任务阅读

- [实现业务 Schema 变更](../agent/implement-schema-change.md)
- [实现数据访问](../agent/implement-data-access.md)
- [实现 Seed 数据](../agent/implement-seed-data.md)
- [选择 Collections、Schema Inspector 与 Metadata](../agent/work-with-collections-and-metadata.md)
- [接入外部数据库](../agent/connect-external-database.md)

每个 API 的准确签名、名称语义和副作用由对应专题和 [API 索引](../reference/api-index.md)维护。Repository 等规划能力只用于设计讨论，不能生成到当前业务代码。
