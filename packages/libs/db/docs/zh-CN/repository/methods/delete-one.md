---
title: deleteOne：准确删除一条记录
description: 删除准确匹配的一条记录，说明版本检查、删除前 select、外键限制及多条匹配拒绝行为。
---

# deleteOne：准确删除一条记录

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：`filter`。
- 可选：`ifVersion / select / context`。
- 返回：默认 `{ deleted: true }`，带 select 增加删除前 `record`。

## 准备数据

```ts
const projects = db.repository('projects');
await projects.createOne({ values: { id: 'project-1', name: 'Disposable' } });
await projects.updateOne({
  filter: { id: 'project-1' },
  values: { name: 'Ready' },
});
```

## 删除记录并取得删除前的数据

```ts
const result = await projects.deleteOne({
  filter: { id: 'project-1' },
  ifVersion: 2,
  select: (select) => select.fields('id', 'name'),
});

console.log(result.deleted);
console.log(result.record);
```

`deleteOne` 的匹配与版本规则和 `updateOne` 相同。select 返回删除前的快照；不传 select 时只返回 `{ deleted: true }`。外键如何阻止或级联删除由 Schema 约束决定，Repository 不隐式忽略约束。

上述例子 record 为 `{ id: 'project-1', name: 'Ready' }`。再次删除同一个键会报 RECORD_NOT_FOUND；Filter 匹配多条会报 MULTIPLE_RECORDS_MATCHED，不选择第一条删除。单条删除需要可用的唯一身份，具体见 [Values 的身份限制](../values.md#身份与受管理字段)。

select 可以读取关系快照，但不是删除关系的配置。外键级联行为由显式 Schema 决定；单条根删除与关系字段中的 delete/disconnect 有不同作用域，见[关系写入](../relation-mutations.md)。

## 验证依据

行为覆盖见 [mutations.test.ts](../../../../tests/integration/repository/mutations.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
