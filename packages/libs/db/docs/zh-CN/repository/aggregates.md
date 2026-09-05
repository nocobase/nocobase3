---
title: Repository 聚合、分组与 combine
description: 使用 aggregate、groupBy 和关系 combine 在数据库中统计记录，组合过滤、分组和独立关系分支，并理解空集合、精度、分页及返回类型限制。
---

# Repository 聚合、分组与 combine

简单行数用 count；多个统计量用 aggregate；按字段分组用 groupBy；随父记录返回关系统计用 include。模型前提见[概览](./overview.md)。

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

## 关系聚合与独立分支

```ts
const rows = await db.repository('projects').findMany({
  select: (select) =>
    select.fields('id').include('tasks', (tasks) =>
      tasks.filter({ status: 'open' }).combine({
        records: tasks
          .fields('id', 'title')
          .sort((sort) => sort.field('id').asc())
          .limit(10),
        count: tasks.count(),
        total: tasks.sum('points'),
      }),
    ),
});
```

每条父记录的 tasks 返回 `{ records: [...], count, total }`。公共 filter 应用于所有分支；分支 filter 再与公共条件 AND。分支局部 sort/limit/cursor/direction/distinct 覆盖对应公共选项，省略则继承。

关系 Builder 是不可变快照；不要写 `tasks.limit(10); return tasks.count()` 并期待 limit 生效。上面的 records 只有前十条，但 count 和 total 统计整个公共过滤范围。单个统计可以直接 `.include('tasks', tasks => tasks.count())`，结果 tasks 是 number。

只允许 hasMany/belongsToMany 聚合。聚合分支不能同时 fields/include；需要记录时用 combine 的独立记录分支。分页聚合在该父记录的过滤、distinct、cursor 和 limit 之后计算，分页聚合要求直接标量字段排序。详见[分页](./pagination.md)。

## combine 对应 JSON

```ts
import type { SelectAst } from '@nocobase/db';
const select: SelectAst = {
  kind: 'select',
  version: 1,
  root: {
    kind: 'selection',
    fields: ['id'],
    includes: [
      {
        kind: 'include',
        relation: 'tasks',
        select: { kind: 'selection' },
        result: {
          kind: 'combine',
          branches: {
            records: { select: { kind: 'selection', fields: ['id', 'title'] } },
            count: { select: { kind: 'selection' }, result: { kind: 'count' } },
            total: {
              select: { kind: 'selection' },
              result: { kind: 'sum', field: 'points' },
            },
          },
        },
      },
    ],
  },
};
const rows = await db.repository('projects').findMany({ select });
```

记录分支省略 result；聚合分支保留空的 selection，并用 result 指定聚合。branch 可带自己的 filter/sort/limit/cursor/direction/distinct。combine 名称不能为 `__proto__`、`constructor` 或 `prototype`；分支数量 1–32，受全局 Select 深度和节点预算限制。

聚合在 SQL 内计算，按分支批量查询而不是按父记录逐次查询。多个分支可能由多条 SQL 完成，不保证天然同一快照；需要一致视图时使用符合业务隔离要求的[事务](./transactions.md)。

## 验证要点

覆盖空集合、nullable 字段 count、decimal 精度、局部分页前后统计、两个父记录之间不串结果、记录分支不影响统计分支，以及 Builder/AST 等价性。未知字段或不支持字段类型会被拒绝；不要用 JS 聚合替代 SQL 来绕过能力限制。
