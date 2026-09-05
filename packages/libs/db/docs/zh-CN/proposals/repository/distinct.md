---
title: Repository Distinct
description: 使用字段数组、稳定排序和跨数据库窗口函数，从 Repository 查询中选择每组完整的代表记录。
---

# Repository Distinct

> **状态：V1 已实现。**

```ts
const users = await repository.findMany({
  distinct: ['country', 'role'],
  sort: (sort) => [
    sort.field('country').asc(),
    sort.field('role').asc(),
    sort.field('createdAt').desc(),
    sort.field('id').asc(),
  ],
  select: (select) => select.fields('id', 'country', 'role', 'createdAt'),
  limit: 20,
});
```

`distinct` 按字段组合分组，`sort` 决定每组保留哪条完整记录。Repository 先去重，再应用
`limit` 和 `offset`。

## V1 语义

- `distinct` 是非空且不重复的直接标量 Field 数组。
- `sort` 只使用直接标量 Field，并且必须包含主键或唯一约束作为稳定 tie-breaker。
- 省略 `sort` 时，Repository 使用已有的默认主键升序；没有可用稳定排序时拒绝查询。
- `select` 可以只返回部分标量，也可以 include relation；用于分区和排序的内部字段不会泄漏。
- 通过 `ROW_NUMBER() OVER (PARTITION BY ...)` 实现 PostgreSQL、MySQL、SQLite、Oracle 和
  MSSQL 的统一语义，不公开 PostgreSQL 专用 `distinctOn`。
- V1 不支持 relation Field、JSON、blob 或 native Field distinct，也不支持 relation sort。
