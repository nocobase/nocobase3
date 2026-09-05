---
title: Repository Aggregate
description: 使用 Aggregate Builder 或 JSON AST 对 Repository 记录执行 count、sum、avg、min 和 max 聚合。
---

# Repository Aggregate

> **状态：V1 已实现。**

## Builder 示例

```ts
const result = await orders.aggregate({
  filter: { status: 'paid' },
  aggregate: (aggregate) => ({
    count: aggregate.count(),
    pricedCount: aggregate.count('amount'),
    totalAmount: aggregate.sum('amount'),
    averageAmount: aggregate.avg('amount'),
    minimumAmount: aggregate.min('amount'),
    maximumAmount: aggregate.max('amount'),
  }),
});
```

对象的 key 是结果别名，TypeScript 会据此推导返回对象。`count()` 统计记录数，
`count(field)` 只统计该字段的非 NULL 值。

## JSON AST

动态调用方可以提供等价的可序列化 AST：

```ts
await orders.aggregate({
  aggregate: {
    kind: 'aggregate',
    version: 1,
    items: [
      { kind: 'count', alias: 'count' },
      { kind: 'sum', alias: 'totalAmount', field: 'amount' },
    ],
  },
});
```

## V1 语义

- `filter` 与其他 Repository 查询复用同一套 shorthand、Builder、AST 和 `context`。
- `sum`、`avg` 只接受数值 Field；`min`、`max` 接受可排序的直接标量 Field。
- 空集合的 `count` 为 `0`，`sum`、`avg`、`min`、`max` 为 `null`。
- `count` 归一化为 `number`；其他函数保留数据库驱动返回的精度形态，可能是
  `number`、`string` 或 `bigint`。
- Aggregate 统计完整的 filter 结果，不接受 `select`、`sort`、`limit`、`offset` 或
  relation-local 选项。
- V1 不包含 `countDistinct`、relation aggregate 或 GroupBy；GroupBy 在下一阶段复用本协议。
