---
title: 内部实现
description: 面向 DB 包维护者的当前实现说明；业务代码应优先使用公开 API 文档，而不是直接依赖内部组件。
---

# 内部实现

本目录解释当前实现的组件边界、解析流程、缓存与一致性规则，仅面向 DB 包维护和底层行为诊断。

编写业务代码时，应先从[数据库任务路由](../agent/task-router.md)或[公开 API 导航](../reference/api-index.md)选择公开入口。除非任务明确要求维护 `@nocobase/db` 本身，否则不要直接实例化或组合本目录中的内部组件。

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

- [Schema Inspector 内部架构](./schema-inspector/architecture.md)
- [Schema Inspector 物理模型](./schema-inspector/physical-schema-model.md)
- [Schema Inspector 方言行为](./schema-inspector/dialects.md)
- [Schema Inspector 分页、完整性与错误](./schema-inspector/pagination-and-errors.md)
- 当前 API 示例见 [Schema Inspector 示例](../schema-inspector/examples.md)
