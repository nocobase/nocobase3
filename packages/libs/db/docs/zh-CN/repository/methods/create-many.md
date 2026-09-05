---
title: createMany：批量创建
description: 批量创建标量记录，说明非空数组与 callback、可选 returning、输入顺序、身份限制及唯一冲突行为。
---

# createMany：批量创建

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：非空 `values` 数组，或返回该数组的同步 callback。
- 可选：`select / context`。
- 返回：不带 select 为 `{ createdCount }`，带 select 增加 `records`。

## 批量创建

```ts
const projects = db.repository('projects');
const result = await projects.createMany({
  values: [
    { id: 'project-2', name: 'API guide', status: 'draft' },
    { id: 'project-3', name: 'Agent guide', status: 'draft' },
  ],
  select: (select) => select.fields('id', 'name'),
});

console.log(result.createdCount);
console.log(result.records);
```

- `values` 至少包含一条记录，只接受标量值，不支持嵌套关系写入。
- 不传 `select` 时只返回 `{ createdCount }`，不返回 records。
- 当前没有 `skipDuplicates`；不要将唯一约束冲突当作自动忽略。

## 批量变量与预期返回

在尚无下列键值时执行：

```ts
const result = await db.repository('projects').createMany({
  values: (v) => [
    { id: 'batch-1', name: v.variable('$input.first') },
    { id: 'batch-2', name: v.variable('$input.second') },
  ],
  context: { input: { first: 'First', second: 'Second' } },
  select: (s) => s.fields('id', 'name'),
});
// { createdCount: 2, records: [{ id: 'batch-1', name: 'First' }, { id: 'batch-2', name: 'Second' }] }
```

records 保持输入顺序。空数组不是无操作，会报 INVALID_MUTATION；没有 skipDuplicates。变量错误在写入前报错，不跳过有问题的行。数据库约束错误应传播到事务边界；已有事务中不要捕获错误后继续提交。

批量标量创建不带 select 时不要求主键；带 select 的返回路径要求主键，只有 unique 不足以满足该要求。select 可读取已有关系，values 仍仅支持标量。统一返回限制见 [Select](../select.md#写入返回选择)。

## 没有主键的 Collection

在隔离开发／测试数据库中一次性创建无唯一键的日志模型：

```ts
await db.connection().builder.createCollection('eventLogs', (c) => {
  c.string('event').notNull();
  c.string('message').notNull();
});
const result = await db.repository('eventLogs').createMany({
  values: [
    { event: 'import', message: 'Started' },
    { event: 'import', message: 'Completed' },
  ],
});
// result: { createdCount: 2 }
```

这个模型没有 id、主键或唯一键。可以批量创建和查询记录，但不能为上述调用增加 select 以启用批量 returning，也不能假定它支持需要唯一身份的单条写入。

## 验证依据

行为覆盖见 [create-context.test.ts](../../../../tests/integration/repository/capabilities/create-context.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
