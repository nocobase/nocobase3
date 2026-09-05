---
title: findOne：查询一条记录
description: 查询排序后的第一条匹配记录，说明 filter 与 sort 的要求、undefined 空结果、关系选择和单条写入的语义差别。
---

# findOne：查询一条记录

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：`filter` 或非空 `sort`，可以同时提供。
- 可选：`select / context`。
- 返回：所选记录或 `undefined`，不带 `record` 包装。

## 查询第一条，不是唯一查询

```ts
const projects = db.repository('projects');
const record = await projects.findOne({
  filter: { status: 'active' },
  sort: (sort) => sort.field('id').asc(),
  select: (select) => select.fields('id', 'name'),
});

if (record !== undefined) {
  console.log(record.id, record.name);
}
```

`findOne()` 要求 `filter` 或显式非空 `sort`，两者可以同时提供。下面按排序取第一条，不设置筛选：

```ts
const record = await db.repository('projects').findOne({
  sort: (sort) => sort.field('id').desc(),
  select: (select) => select.fields('id'),
});
```

关键语义：

- 多条匹配时返回排序后的第一条，**不会**抛出多条命中错误。
- `findOne({ filter: { id: 'project-1' } })` 是否唯一，取决于 Schema 中的主键或唯一约束，不由方法名保证。
- 无参数或既无筛选又无非空排序，报 `INVALID_FILTER`。
- 根级 `findOne` 不接受 `limit / offset / cursor / direction / distinct`；关系 include 可以有自己的局部选项。
- 当前没有 `findUnique()`、`findFirst()` 或 `findOneOrThrow()`。不要照搬其他 ORM 的接口。

单条更新、删除要求实际命中一条，和这里的读取语义不同，见[写入](../values.md)。

## 准备数据与预期结果

在空的 projects 中先执行：

```ts
await db.repository('projects').createMany({
  values: [
    { id: 'project-1', name: 'First', status: 'active' },
    { id: 'project-2', name: 'Second', status: 'active' },
  ],
});
const first = await db.repository('projects').findOne({
  filter: { status: 'active' },
  sort: (s) => s.field('id').asc(),
  select: (s) => s.fields('id', 'name'),
});
// first: { id: 'project-1', name: 'First' }
const missing = await db
  .repository('projects')
  .findOne({ filter: { id: 'missing' } });
// missing: undefined
```

需要选择 owner、tasks 等关系时使用 [Select](../select.md)；变量条件见 [Context](../context.md)。输入无效会报错，不当作空结果。

## 验证依据

行为覆盖见 [scalar.test.ts](../../../../tests/integration/repository/scalar.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
