---
title: Repository GroupBy
description: 使用 GroupBy、Aggregate Builder、having 和 sort 对 Repository 记录执行跨数据库分组统计。
---

# Repository GroupBy

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：V1 已实现。**

```ts
const rows = await orders.groupBy({
  by: ['country', 'status'],
  filter: { archived: false },
  aggregate: (aggregate) => ({
    count: aggregate.count(),
    totalAmount: aggregate.sum('amount'),
    maximumAmount: aggregate.max('amount'),
  }),
  having: (filter) => filter.number('count').gte(2),
  sort: (sort) => sort.field('totalAmount').desc(),
});
```

返回对象由 `by` 字段和 Aggregate Builder 的别名组成，TypeScript 会推导其形状：

```ts
// Array<{
//   country: string;
//   status: string;
//   count: number;
//   totalAmount: number | string | bigint | null;
//   maximumAmount: number | null;
// }>
```

`aggregate` 也接受与 `aggregate()` 相同的 JSON AST。

## 执行顺序

```text
filter 根记录 → by 分组并聚合 → having 过滤结果 → sort 排序结果
```

`having` 和 `sort` 的字段空间只包含 `by` 字段与 aggregate alias。未提供 `sort` 时，
Repository 默认按全部 `by` 字段升序排列。

## V1 边界

- `by` 是非空且不重复的可分组直接标量 Field 列表。
- aggregate alias 不能与 `by` 字段重名。
- `having` 复用 Filter shorthand、Builder 和 AST；`sort` 复用 Sort Builder 和 AST。
- `context` 同时用于根 `filter` 和 `having` 中的变量。
- V1 不支持 relation 分组、relation aggregate、分页、distinct aggregate 或 grouping sets。
