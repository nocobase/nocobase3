---
title: findMany：查询多条记录
description: 列出 findMany 的参数、数组返回、关系读取、默认排序及分页和 distinct 的组合入口。
---

# findMany：查询多条记录

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：无，可直接 `findMany()`。
- 可选：`filter / select / sort / distinct / cursor / direction / limit / offset / context`。
- 返回：记录数组，无匹配为 `[]`。

## 查询列表

```ts
const projects = db.repository('projects');
await projects.createOne({
  values: { id: 'project-list', name: 'Repository', status: 'active' },
});
const records = await projects.findMany({
  filter: { status: 'active' },
  select: (select) => select.fields('id', 'name'),
  sort: (sort) => sort.field('id').asc(),
  limit: 20,
});
```

在空的 projects 中运行上述完整片段，records 为 `[{ id: 'project-list', name: 'Repository' }]`。没有匹配记录时为 `[]`。

- 省略 `filter` 查询所有记录，不建议在交互式列表中省略 `limit`。
- 省略 `select` 读取根记录标量字段；关系必须显式 include。
- 有主键时，省略 `sort` 默认按主键升序。自定义排序未形成唯一顺序时，会追加缺失的主键字段升序作为决胜项。
- 不存在主键且没有排序时，不应依赖数据库返回顺序。
- 返回字段类型受字段定义、驱动和 Repository 泛型影响，精确标量类型推导见 [Select](../select.md)。

## 同时读取关系

```ts
const rows = await db.repository('projects').findMany({
  filter: { status: 'active' },
  select: (s) =>
    s
      .fields('id', 'name')
      .include('owner', (owner) => owner.fields('id', 'name'))
      .include('tasks', (tasks) => tasks.fields('id', 'title').limit(5)),
  sort: (s) => s.field('id').asc(),
  limit: 20,
});
```

每条结果的 owner 是对象或 null，tasks 是数组；每个项目最多返回 5 个 tasks。根 filter 决定项目范围，关系局部 filter 只影响关系返回值。

## 分页与去重

- [分页](../pagination.md)：offset、排他 cursor、forward/backward、完整排序轴与关系局部分页。
- [Distinct](../distinct.md)：按字段组合选择完整代表行，再分页。
- 总数单独调用 [count](./count.md)，findMany 不返回 total/pageInfo/nextCursor。多次查询需要一致视图时使用[事务](../transactions.md)。
- limit/offset 必须是非负安全整数；cursor 与 offset 互斥。findMany 的排序允许关系路径，但 cursor/distinct 会施加更严格的直接字段限制。

## 场景 FM-01：稳定分页、排他游标与空页

前提：沿用概览的 tasks 定义，其中 points、id 明确非空。在空 tasks 中准备记录；本节连续执行，期间没有并发写入。

```ts
const tasks = db.repository('tasks');
await tasks.createMany({
  values: [
    { id: 'fm-a', title: 'A', points: 10 },
    { id: 'fm-b', title: 'B', points: 10 },
    { id: 'fm-c', title: 'C', points: 20 },
    { id: 'fm-d', title: 'D', points: 30 },
  ],
});
const first = await tasks.findMany({
  select: (s) => s.fields('id', 'points'),
  sort: (s) => [s.field('points').asc(), s.field('id').asc()],
  limit: 2,
});
// first: [{ id: 'fm-a', points: 10 }, { id: 'fm-b', points: 10 }]
const second = await tasks.findMany({
  select: (s) => s.fields('id', 'points'),
  sort: (s) => [s.field('points').asc(), s.field('id').asc()],
  cursor: { points: 10, id: 'fm-b' },
  limit: 2,
});
// second: [{ id: 'fm-c', points: 20 }, { id: 'fm-d', points: 30 }]
const previous = await tasks.findMany({
  select: (s) => s.fields('id', 'points'),
  sort: (s) => [s.field('points').asc(), s.field('id').asc()],
  cursor: { points: 20, id: 'fm-c' },
  direction: 'backward',
  limit: 2,
});
// previous equals first; backward does not reverse the returned array.
const empty = await tasks.findMany({
  sort: (s) => [s.field('points').asc(), s.field('id').asc()],
  cursor: { points: 30, id: 'fm-d' },
  limit: 2,
});
// empty: []
```

测试断言：相同 points 的记录通过 id 决胜；前后两页不重叠；游标记录不包含在结果中；反向结果保持原排序。将 cursor 改成仅 `{ points: 10 }` 应报 INVALID_PAGINATION；同时提供 cursor 和 offset 也应报错。不能根据这组静态数据测试推断并发期间具有固定快照。

## 场景 FM-02：关系局部 Filter 不移除父记录

独立场景：在空 projects/tasks 中执行，使用概览的显式 hasMany 关系。

```ts
const projects = db.repository('projects');
await projects.createOne({
  values: {
    id: 'fm-project-a',
    name: 'A',
    tasks: {
      create: [
        { id: 'fm-open', title: 'Open', status: 'open' },
        { id: 'fm-closed', title: 'Closed', status: 'closed' },
      ],
    },
  },
});
await projects.createOne({ values: { id: 'fm-project-b', name: 'B' } });
const result = await projects.findMany({
  sort: (s) => s.field('id').asc(),
  select: (s) =>
    s.fields('id').include('tasks', (t) =>
      t
        .fields('id')
        .filter({ status: 'open' })
        .sort((s) => s.field('id').asc()),
    ),
});
// result:
// [{ id: 'fm-project-a', tasks: [{ id: 'fm-open' }] },
//  { id: 'fm-project-b', tasks: [] }]
```

测试断言：B 仍在根结果中，tasks 为 []；A 只返回 open 任务；未请求的 name、title、projectId 不出现。若业务只要存在 open 任务的项目，应另外在根 filter 使用 `f.relation('tasks').some(...)`，不能依赖 include 的局部条件。

## 测试映射

场景编号供后续自动化测试使用；当前列出的是相关覆盖，不代表文档片段已逐个自动执行。

| 场景  | 后续测试重点                         | 已有相关覆盖                              |
| ----- | ------------------------------------ | ----------------------------------------- |
| FM-01 | 重复排序值、双向游标、空页、非法组合 | scalar.test.ts、identity-features.test.ts |
| FM-02 | 父记录保留、空关系形状、投影隔离     | relations.test.ts                         |

## 验证依据

行为覆盖见 [scalar.test.ts](../../../../tests/integration/repository/scalar.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
