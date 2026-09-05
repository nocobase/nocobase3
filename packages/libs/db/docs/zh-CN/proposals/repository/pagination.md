---
title: Repository Cursor Pagination
description: 使用稳定标量排序和排他 cursor 对 Repository 根查询及 relation include 进行跨数据库分页。
---

# Repository Cursor Pagination

> **状态：根级 cursor 已实现；relation-local limit/cursor 待后续子阶段接入。**

```ts
const records = await orders.findMany({
  sort: (sort) => [sort.field('createdAt').desc(), sort.field('id').asc()],
  cursor: {
    createdAt: '2026-09-05T08:00:00.000Z',
    id: 'order-100',
  },
  limit: 20,
});
```

Cursor 是排他边界：返回结果从 cursor 指向记录的下一条开始。Repository 按 sort 方向编译
字典序条件，例如 `(createdAt < value) OR (createdAt = value AND id > value)`。

## V1 规则

- cursor 必须配合显式的非空稳定 sort。
- Repository 会像普通列表查询一样自动追加主键 tie-breaker；cursor 必须包含最终 sort 的
  每一个字段，包括自动追加的字段。
- V1 的 cursor 轴必须是 non-nullable 的直接标量 Field，不支持 relation field 或 relation
  aggregate sort。
- cursor key 不能缺失或多余，cursor value 不能是 `null` 或 `undefined`。
- cursor 与 `offset` 互斥；`limit` 可以继续使用。
- cursor 可以与根 filter、select、distinct 组合，distinct 场景先选择代表行，再应用 cursor。

Relation-local 分页将复用同一套校验和字典序边界，不引入 `cursorByParent`。
