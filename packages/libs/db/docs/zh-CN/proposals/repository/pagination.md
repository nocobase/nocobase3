---
title: Repository Cursor Pagination
description: 使用稳定标量排序和排他 cursor 对 Repository 根查询及 relation include 进行跨数据库分页。
---

# Repository Cursor Pagination

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：根级 cursor 和 relation-local limit/cursor 已实现。**

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

Backward pagination is available with `direction: 'backward'`. The default is
`forward`. An explicit direction requires a cursor. Backward reads the nearest
preceding page, then restores the caller's original sort order. For an ascending
sequence A–F, cursor D and limit 2 return B,C backward and E,F forward.
Distinct representative selection always uses the original sort. Relation-local
Builder chains use `.cursor(values).direction('backward').limit(10)`; JSON include
nodes accept the same `direction` property. Streaming rejects backward pages
because restoring page order requires buffering.

- cursor 必须配合显式的非空稳定 sort。
- Repository 会像普通列表查询一样自动追加主键 tie-breaker；cursor 必须包含最终 sort 的
  每一个字段，包括自动追加的字段。
- V1 的 cursor 轴必须是 non-nullable 的直接标量 Field，不支持 relation field 或 relation
  aggregate sort。
- cursor key 不能缺失或多余，cursor value 不能是 `null` 或 `undefined`。
- cursor 与 `offset` 互斥；`limit` 可以继续使用。
- cursor 可以与根 filter、select、distinct 组合，distinct 场景先选择代表行，再应用 cursor。

## Relation-local 分页

```ts
const projects = await repository.findMany({
  select: (select) =>
    select.fields('id', 'name').include('tasks', (tasks) =>
      tasks
        .fields('id', 'title', 'priority')
        .sort((sort) => [sort.field('priority').desc(), sort.field('id').asc()])
        .cursor({ priority: 3, id: 'task-100' })
        .limit(10),
    ),
});
```

`limit` 对每个父记录独立生效。一个固定 cursor 应用于所有父记录；V1 不提供
`cursorByParent`。关系数据继续按 relation 层批量加载，不产生逐父记录 N+1 查询；当前
实现会在一次批量关系查询后按父记录切分 local limit。

Relation-local cursor 与根 cursor 复用相同的稳定 sort、完整 key、非空值和 non-nullable
字段规则。`limit` 和 cursor 只用于 to-many relation；to-one include 会拒绝这些参数。
