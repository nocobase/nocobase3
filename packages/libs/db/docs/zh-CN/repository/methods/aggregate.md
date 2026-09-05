---
title: aggregate：计算根级聚合
description: 使用 Aggregate Builder 或 AST 计算 count/sum/avg/min/max，说明返回别名、空集合、字段能力和数值精度。
---

# aggregate：计算根级聚合

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：`aggregate` Builder 或 AST。
- 可选：`filter / context`。
- 返回：别名到聚合结果的对象。

## 根级 aggregate

```ts
const result = await db.repository('tasks').aggregate({
  filter: { status: 'open' },
  aggregate: (aggregate) => ({
    count: aggregate.count(),
    withPriority: aggregate.count('priority'),
    total: aggregate.sum('points'),
    average: aggregate.avg('points'),
    minimum: aggregate.min('points'),
    maximum: aggregate.max('points'),
  }),
});
console.log(result.count, result.total);
```

返回以所选别名为键的对象，不带 record 包装。count() 统计行，count(field) 忽略该字段的 SQL NULL。空范围 count 为 0，sum/avg/min/max 为 null。

sum/avg 仅接受数值字段；min/max 要求可排序字段。聚合值保留数据库驱动的 number/string/bigint 表示，不应为方便而一律 `Number()`，否则可能丢失 decimal 或大整数精度。count 转为 number，超大计数也需考虑 JavaScript 安全整数范围。

对应 JSON AST：

```ts
import type { AggregateAst } from '@nocobase/db';
const aggregate: AggregateAst = {
  kind: 'aggregate',
  version: 1,
  items: [
    { kind: 'count', alias: 'count' },
    { kind: 'sum', alias: 'total', field: 'points' },
  ],
};
const result = await db.repository('tasks').aggregate({ aggregate });
```

至少选一个聚合，别名必须非空且唯一。Builder 可以推导输出别名与值类型；AST 返回动态 AggregateResult。

## 空结果示例

```ts
const result = await db.repository('tasks').aggregate({
  filter: { id: 'missing-task' },
  aggregate: (a) => ({ total: a.count(), points: a.sum('points') }),
});
// When missing-task does not exist: { total: 0, points: null }
```

本方法没有 select、sort 或分页参数。按字段分组用 [groupBy](./group-by.md)，随父记录返回统计用 [关系 Select](../select.md#关系聚合与独立分支)。

## 验证依据

行为覆盖见 [aggregate.test.ts](../../../../tests/integration/repository/methods/aggregate.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
