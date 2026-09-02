---
title: 内部实现
description: 面向 DB 包维护者的当前实现说明；业务代码应优先使用公开 API 文档，而不是直接依赖内部组件。
---

# 内部实现

本目录解释当前实现的组件边界、解析流程、缓存与一致性规则，主要面向 DB 包维护者和需要诊断底层行为的 Agent。

编写业务代码时，应先从 [Agent 任务路由](../agent/task-router.md) 或 [API 索引](../reference/api-index.md) 选择公开入口。除非任务明确要求维护 `@nocobase/db` 本身，否则不要直接实例化或组合本目录中的内部组件。

## Collection 解析

- [Collection 架构](./collection/architecture.md)
- [Collection 解析生命周期](./collection/resolution-lifecycle.md)
- [Collection Resolver](./collection/resolver.md)
- [Collection Registry](./collection/registry.md)

## Metadata

- [Metadata Store](./metadata/store.md)
- [Metadata Store 后端](./metadata/store-backends.md)
- [Collection Metadata Service](./metadata/service.md)

## Schema Inspector

- [Schema Inspector 实现](./schema-inspector/architecture.md)
- 当前 API 示例见 [Schema Inspector 示例](../schema-inspector/examples.md)
