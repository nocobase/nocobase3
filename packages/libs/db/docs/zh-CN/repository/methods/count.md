---
title: count：统计记录数
description: 用 count 统计 Filter 匹配行，说明零结果、上下文、列表总数和聚合接口的区别。
---

# count：统计记录数

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：无。
- 可选：`filter / context`。
- 返回：`number`，无匹配为 `0`。

## 完整示例

在空的 projects 中准备一条记录：

```ts
const projects = db.repository('projects');
await projects.createOne({
  values: { id: 'project-1', name: 'Repository', status: 'active' },
});
const matched = await projects.count({ filter: { status: 'active' } });
// matched: 1
const empty = await projects.count({ filter: { id: 'missing' } });
// empty: 0
```

## 变量条件

```ts
const result = await db.repository('projects').count({
  filter: (f) => f.string('ownerId').eq(f.variable('$actor.id')),
  context: { actor: { id: 'user-1' } },
});
```

## 边界

仅接受 filter/context，不接受 select、sort、limit、distinct，也不继承其他查询的条件。省略 filter 检查全部记录；空对象 Filter 不表示全选。

查询列表与总数时显式复用 Filter；两次调用不自动共享快照。count 统计记录行数，按字段非 NULL 计数用 [aggregate](./aggregate.md)，分组计数用 [groupBy](./group-by.md)。当前 count 转为 number，超大计数存在安全整数边界，不应据返回类型推断无精度风险。

关系条件参见 [Filter](../filter.md)，上下文解析规则参见 [Context](../context.md)。

## 场景 CT-01：列表分页不改变总数

前提：空 projects，沿用概览模型。数据准备与查询连续执行，期间没有并发写入。

```ts
import type { RepositoryFilter } from '@nocobase/db';

const projects = db.repository('projects');
await projects.createMany({
  values: [
    { id: 'ct-a', name: 'A', status: 'active' },
    { id: 'ct-b', name: 'B', status: 'active' },
    { id: 'ct-c', name: 'C', status: 'draft' },
  ],
});
const filter: RepositoryFilter<{ status: string }> = (f) =>
  f.string('status').eq(f.variable('$status'));
const context = { status: 'active' };
const rows = await projects.findMany({
  filter,
  context,
  select: (s) => s.fields('id'),
  sort: (s) => s.field('id').asc(),
  limit: 1,
  offset: 1,
});
const total = await projects.count({ filter, context });
const all = await projects.count();
// rows: [{ id: 'ct-b' }]; total: 2; all: 3
```

测试断言：count 不继承 limit/offset，也不继承上一次查询的 Filter；同一个 Filter 模板用 `{ status: 'draft' }` 得到 1，用 `{ status: 'missing' }` 得到 0。缺失 `$status` 应报 VARIABLE_NOT_FOUND，不能当成 0。多次查询是否共享一致快照由事务和数据库隔离级别决定。

## 场景 CT-02：统计父记录，不统计关联目标数

独立场景：空 projects/tasks。创建一个带两条 open 任务的项目和一个不带任务的项目：

```ts
const projects = db.repository('projects');
await projects.createOne({
  values: {
    id: 'ct-parent-a',
    name: 'A',
    tasks: {
      create: [
        { id: 'ct-task-a', title: 'A', status: 'open' },
        { id: 'ct-task-b', title: 'B', status: 'open' },
      ],
    },
  },
});
await projects.createOne({ values: { id: 'ct-parent-b', name: 'B' } });
const parents = await projects.count({
  filter: (f) => f.relation('tasks').some((t) => t.string('status').eq('open')),
});
// parents: 1, not 2
```

测试断言：一个父记录有多个符合条件的关联目标时仍只计一次；无任务的父记录不匹配 some。统计任务总数应使用 tasks Repository，按父记录返回任务统计应使用关系 Select 的 count/combine。

## 测试映射

CT-01 / CT-02 已落为独立集成测试，使用与文档相同的关键数据和预期结果。测试通过底层查询准备数据，隔离被测查询 API；不是直接执行 Markdown 代码块，也不代表覆盖了所有关系类型和参数组合。

## 验证依据

行为覆盖见 [count.test.ts](../../../../tests/integration/repository/methods/count.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
