---
title: 设计提案与演进记录
description: 保留 DB 候选方案与设计演进；Repository 已有正式使用文档，提案中已实现和未实现内容不得整体视为当前公开 API 契约。
---

# 设计提案与演进记录

本目录保留设计讨论、候选方案和实现路线，不作为当前业务代码的使用手册。Repository 已实现，当前入口是 [Repository 正式文档](../repository/overview.md)与 [API 参考](../reference/repository-api.md)。下列材料可能混合已实现与未实现的设计，需逐项核对。

不得把提案中的接口、类型或示例当作当前 API 生成生产代码。实现业务需求时，以[公开 API 导航](../reference/api-index.md)、正式主题文档和 TypeScript 类型声明为准。

## Database Dialect 拆分

- [数据库 Dialect 拆分推进路线](./dialect-split-roadmap.md)：记录 package-level 拆分已完成的边界，以及 core SQL strategy、app-server driver registry 和单驱动安装的后续任务。

## 精确数值提案

- [Numeric field types and schema inspection](./numeric-field-types.md): proposed five-database mappings, Inspector capabilities, and metadata compatibility; SQLite semantics and exact-value transport remain separate decisions.
- [BigInt 与 Decimal 精确数值处理](./precise-numeric-values.md)：记录 Query 与 Repository 的精度风险和候选契约，待决策、暂缓实施。

## Date and time field types

- [Date and time field type mappings](./date-time-field-types.md): proposed five-database mappings for `date`, `time`, `datetime`, and `datetimeTz`, with current behavior and open decisions.

## String field types

- [String field types and schema inspection](./string-field-types.md): proposed Inspector `char/string/text` categories, separate Collection decisions, length units, Unicode and collation boundaries, and metadata responsibilities.

## Boolean field type

- [Boolean fields and schema inspection](./boolean-field-type.md): native versus numeric boolean storage, five-database Inspector rules, metadata resolution, strict codecs, and constraint boundaries.

## Enum and set field types

- [Enum and set field types](./enum-set-field-types.md): shared allowed-value contracts, enum string storage, PostgreSQL array/other-database JSON set storage, member changes, and Inspector/query boundaries.

## JSON field type

- [JSON fields and JSONB storage preference](./json-field-type.md): top-level `jsonb` preference, five-database fallback, Inspector/metadata ownership, and pending value, NULL, and query contracts.

## Repository 提案

- [Repository 概览](./repository/overview.md)
- [Select AST](./repository/select-ast.md)
- [Filter Builder](./repository/filter-builder.md)
- [Filter AST](./repository/filter-ast.md)
- [Sort AST](./repository/sort-ast.md)
- [Repository Aggregate](./repository/aggregate.md)
- [Repository GroupBy](./repository/group-by.md)
- [Repository Distinct](./repository/distinct.md)
- [Repository Cursor Pagination](./repository/pagination.md)
- [Repository Streaming](./repository/streaming.md)
- [Mutation AST](./repository/mutation-ast.md)
- [表单到 Mutation AST](./repository/form-mutation.md)
- [Repository 写入 API 改进](./repository/prisma-inspired-mutations.md)：参考 Prisma 的模型形状输入和 Relation Builder，讨论下一版候选契约。

### Repository Policy（提案，尚未实现）

行级 scope 与字段关系白名单的权限模型。Policy 尚未实现，现行实现见 [write-policy.md](../repository/write-policy.md)。按下列顺序阅读：

1. [Policy 设计](./repository/policies.md)：三条不变量、四节点结构、各项规则的取舍与理由。
2. [Policy 示例说明](./repository/policies-examples.md)：从没有 Policy 的现状出发，逐层加入每个概念。
3. [Policy 参考](./repository/policies-reference.md)：四节点的每个参数、scope 的完整语法、绑定与收窄的每种写法。
4. [Policy 执行细节](./repository/policies-internals.md)：在 Knex 适配器上的落点、真实 SQL、方言差异。
5. [Policy 实施清单](./repository/policies-roadmap.md)：分阶段任务、前置决策、验收标准与迁移面。
