---
title: groupBy：分组统计
description: 按字段分组计算聚合，用 having 和 sort 操作分组结果，说明分组字段、别名和分页限制。
---

# groupBy：分组统计

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：非空 `by`、`aggregate` Builder 或 AST。
- 可选：`filter / having / sort / context`。
- 返回：分组字段及聚合别名组成的数组，无结果为 `[]`。

## groupBy：先筛选，再分组，再 having

```ts
const groups = await db.repository('projects').groupBy({
  by: ['country', 'role'],
  filter: { status: 'active' },
  aggregate: (aggregate) => ({
    count: aggregate.count(),
    total: aggregate.sum('budget'),
  }),
  having: (filter) => filter.number('count').gte(2),
  sort: (sort) => sort.field('count').desc(),
});
```

返回 `{ country, role, count, total }[]`；无分组返回 `[]`。filter 面向源记录；having 和 sort 面向分组字段及聚合别名，不能拿未分组字段继续过滤输出。by 不得为空或重复，聚合别名不能覆盖分组字段。支持 Builder 与 Aggregate AST，不提供 groupBy select、limit、offset、cursor 或 countDistinct。

## 准备数据与预期结果

在空的 tasks 中执行：

```ts
const tasks = db.repository('tasks');
await tasks.createMany({
  values: [
    { id: 'group-1', title: 'A', status: 'open' },
    { id: 'group-2', title: 'B', status: 'open' },
    { id: 'group-3', title: 'C', status: 'closed' },
  ],
});
const result = await tasks.groupBy({
  by: ['status'],
  aggregate: (a) => ({ total: a.count() }),
  having: (f) => f.number('total').gte(f.variable('$minimum')),
  sort: (s) => s.field('status').asc(),
  context: { minimum: 2 },
});
// result: [{ status: 'open', total: 2 }]
```

## 边界与替代入口

无排序时不依赖返回顺序；非分组字段不能作为 having/sort 的普通字段使用。聚合空值、数值精度与 AST 形式见 [aggregate](./aggregate.md)。选择每组完整代表记录应使用 [distinct](../distinct.md)，不能把 groupBy 当作完整记录去重。

## 验证依据

行为覆盖见 [scalar.test.ts](../../../../tests/integration/repository/scalar.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
