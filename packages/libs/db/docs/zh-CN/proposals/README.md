---
title: 设计提案与演进记录
description: 保留 DB 候选方案与设计演进；Repository 已有正式使用文档，提案中已实现和未实现内容不得整体视为当前公开 API 契约。
---

# 设计提案与演进记录

本目录保留设计讨论、候选方案和实现路线，不作为当前业务代码的使用手册。Repository 已实现，当前入口是 [Repository 正式文档](../repository/overview.md)与 [API 参考](../reference/repository-api.md)。下列材料可能混合已实现与未实现的设计，需逐项核对。

不得把提案中的接口、类型或示例当作当前 API 生成生产代码。实现业务需求时，以[公开 API 导航](../reference/api-index.md)、正式主题文档和 TypeScript 类型声明为准。

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
