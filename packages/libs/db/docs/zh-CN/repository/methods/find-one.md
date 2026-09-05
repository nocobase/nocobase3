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

## 场景 FO-01：同一条件的三种表达得到相同记录

前提：沿用概览模型，在空 projects 中准备下列记录。本节代码连续执行；三个查询只读，不修改数据。

```ts
import type { FilterAst } from '@nocobase/db';

const projects = db.repository('projects');
await projects.createMany({
  values: [
    { id: 'fo-a', name: 'A', status: 'draft' },
    { id: 'fo-b', name: 'B', status: 'active' },
  ],
});
const ast: FilterAst = {
  kind: 'filter',
  version: 1,
  root: {
    kind: 'group',
    logic: 'and',
    items: [
      { kind: 'condition', path: ['id'], operator: '$eq', value: 'fo-b' },
    ],
  },
};
const shorthand = await projects.findOne({
  filter: { id: 'fo-b' },
  select: (s) => s.fields('id', 'name'),
});
const builder = await projects.findOne({
  filter: (f) => f.string('id').eq('fo-b'),
  select: (s) => s.fields('id', 'name'),
});
const json = await projects.findOne({
  filter: ast,
  select: (s) => s.fields('id', 'name'),
});
// Each result is { id: 'fo-b', name: 'B' }.
```

测试断言：三个结果深度相等；没有 record 包装；status 等未选择字段不出现；记录总数仍为 2。这里 JSON 指可序列化 Filter AST，不是 Prisma 风格的操作符对象。

## 场景 FO-02：缺失记录与缺失变量是不同结果

沿用 FO-01 数据，运行以下成功查询：

```ts
const missing = await projects.findOne({
  filter: (f) => f.string('id').eq(f.variable('$input.code')),
  context: { input: { code: 'not-found' } },
  select: (s) => s.fields('id'),
});
// missing: undefined
```

再把 context 改为 `{ input: {} }`，保持 Filter 不变：应拒绝 Promise，错误码为 VARIABLE_NOT_FOUND，`details.variable` 为 `$input.code`，而不是返回 undefined。测试还应确认两次调用都不改变记录数和内容。

## 测试映射

本页场景编号用于后续测试命名和追踪，不表示这些完整文档片段已逐个成为自动化测试。

| 场景  | 后续测试重点                       | 已有相关覆盖                                                   |
| ----- | ---------------------------------- | -------------------------------------------------------------- |
| FO-01 | 三种 Filter 同结果、投影字段不泄漏 | scalar.test.ts 的条件与选择测试                                |
| FO-02 | 合法空结果与变量解析错误分开断言   | scalar.test.ts 的上下文查询；create-context.test.ts 的变量错误 |

## 验证依据

行为覆盖见 [scalar.test.ts](../../../../tests/integration/repository/scalar.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
