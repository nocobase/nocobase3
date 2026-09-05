---
title: updateMany：批量更新
description: 使用 Filter 或 all:true 批量更新标量，支持原子更新和返回选择，说明零结果与批量限制。
---

# updateMany：批量更新

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：`values`；`filter` 与 `all: true` 二选一。
- 可选：`select / context`。
- 返回：`{ updatedCount }`，带 select 增加 `records`。

## 准备数据

```ts
const projects = db.repository('projects');
await projects.createMany({
  values: [
    { id: 'project-1', name: 'First', status: 'draft' },
    { id: 'project-2', name: 'Second', status: 'draft' },
  ],
});
```

## 批量更新

```ts
const result = await projects.updateMany({
  filter: { status: 'draft' },
  values: { status: 'active', budget: { increment: '100.00' } },
  select: (select) => select.fields('id', 'status', 'budget'),
});

console.log(result.updatedCount);
console.log(result.records);
```

批量更新只接受标量赋值和数值原子更新，不支持嵌套关系操作，也不接受逐条 `ifVersion`。没有匹配时返回 `updatedCount: 0`；传入 select 时同时返回空 records 数组。

全表更新必须显式表达意图：

```ts
await projects.updateMany({
  all: true,
  values: { status: 'archived' },
});
```

`filter` 与 `all` 互斥；省略两者或使用空 filter 会报 `INVALID_FILTER`。此保护不替代业务权限和租户范围过滤。

## 变量与空结果

```ts
const result = await db.repository('projects').updateMany({
  filter: { status: 'missing' },
  values: (v) => ({ name: v.variable('$name') }),
  context: { name: 'Updated' },
  select: (s) => s.fields('id', 'name'),
});
// result: { updatedCount: 0, records: [] }
```

带 select 时要求主键；未匹配不跳过输入校验。返回顺序不是可自定义排序，不能将本方法当作分页接口。重复调用原子 increment 会再次运算，不能不加判断地重试。其余返回规则见 [Select](../select.md#写入返回选择)。

## 验证依据

行为覆盖见 [write-contracts.test.ts](../../../../tests/integration/repository/methods/write-contracts.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
