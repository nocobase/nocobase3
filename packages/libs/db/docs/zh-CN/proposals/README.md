---
title: 未来提案
description: 收录尚未实现或导出的 DB 设计提案；不得把提案接口当作当前 API 生成生产代码。
---

# 未来提案

本目录收录仍在讨论、尚未成为运行时能力的设计。每篇提案必须明确标出运行时可用性和导出状态。

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
