---
title: deleteMany：批量删除
description: 按明确范围批量删除，说明 all:true、零结果、删除前 returning、主键要求和外键约束。
---

# deleteMany：批量删除

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：`filter` 与 `all: true` 二选一。
- 可选：`select / context`。
- 返回：`{ deletedCount }`，带 select 增加删除前 `records`。

## 删除选定范围

```ts
const projects = db.repository('projects');
await projects.createMany({
  values: [
    { id: 'delete-1', name: 'Old', status: 'archived' },
    { id: 'keep-1', name: 'Current', status: 'active' },
  ],
});
const result = await projects.deleteMany({
  filter: { status: 'archived' },
  select: (s) => s.fields('id', 'name'),
});
// result: { deletedCount: 1, records: [{ id: 'delete-1', name: 'Old' }] }
const empty = await projects.deleteMany({
  filter: { status: 'archived' },
  select: (s) => s.fields('id'),
});
// empty: { deletedCount: 0, records: [] }
```

## 全部删除与限制

```ts
await db.repository('projects').deleteMany({ all: true });
```

只在业务明确允许删除全部记录时使用 all:true。省略 filter/all、空 Filter 或同时提供两种范围均不属于合法调用；不能为了绕过错误自动扩大删除范围。

不提供逐条 ifVersion、limit、sort。带 select 要求主键，读取删除前的记录和可选关系；不带 select 的批量标量路径不要求主键。约束冲突不会自动忽略，外键行为取决于 Schema。返回 records 规则见 [Select](../select.md#写入返回选择)，事务错误传播见[事务](../transactions.md)。

## 验证依据

行为覆盖见 [scalar.test.ts](../../../../tests/integration/repository/scalar.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
