---
title: createOne：创建一条记录
description: 创建标量及嵌套关系记录，说明 values callback、context、返回选择、非 id 身份键和创建失败的边界。
---

# createOne：创建一条记录

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：`values` 对象或同步 callback。
- 可选：`select / context`。
- 返回：`{ record, createdTargets, version? }`。

## 基础创建

```ts
const projects = db.repository('projects');
```

```ts
const result = await projects.createOne({
  values: {
    id: 'project-1',
    name: 'Repository documentation',
    status: 'draft',
    budget: '1000.00',
  },
  select: (select) => select.fields('id', 'name', 'status'),
});

console.log(result.record.id);
console.log(result.createdTargets);
console.log(result.version);
```

不要直接访问 `result.id`。主键若不是数据库自增或已配置的生成字段，就必须在 `values` 中提供。版本字段由 Repository 管理，不在 `values` 中手动赋值。

`createOne` 支持关系 `create` 和 `connect`，不接受关系 update、delete 或数值原子更新。

## 使用变量创建

```ts
const result = await db.repository('projects').createOne({
  values: (v) => ({
    id: v.variable('$input.code'),
    name: v.variable('$input.name'),
  }),
  context: { input: { code: 'project-variable', name: 'Variables' } },
  select: (s) => s.fields('id', 'name'),
});
// result.record: { id: 'project-variable', name: 'Variables' }
```

返回 Select 的关系 Filter 也使用同一个 context。嵌套字段、关系选择器和 through payload 也支持显式变量，详见 [Values](../values.md)。

## 非 id 主键

下例仅用于隔离的开发／测试数据库，一次性声明模型；生产变更应写入自包含 Migration。

```ts
await db.connection().builder.createCollection('tickets', (c) => {
  c.increments('sequence');
  c.string('subject').notNull();
});
const ticket = await db.repository('tickets').createOne({
  values: { subject: 'Support' },
  select: (s) => s.fields('sequence', 'subject'),
});
// ticket.record contains the generated sequence and subject.
```

只有显式自增／生成字段才可依靠数据库提供键值。单条创建需要完整非空主键或无条件唯一选择器用于重读；无任何唯一身份的模型应核对 [createMany](./create-many.md) 的标量路径。

## 嵌套创建与失败

```ts
const result = await db.repository('projects').createOne({
  values: {
    id: 'project-nested',
    name: 'Nested',
    tasks: (tasks) => tasks.create({ id: 'task-nested', title: 'First task' }),
  },
  select: (s) =>
    s.fields('id').include('tasks', (tasks) => tasks.fields('id', 'title')),
});
// result.record: { id: 'project-nested', tasks: [{ id: 'task-nested', title: 'First task' }] }
```

变量缺失或类型错误在写入前报错；唯一冲突、缺失关联目标等执行错误传播并回滚。关系 create/connect、clientKey 和 through payload 见[关系写入](../relation-mutations.md)。

## 验证依据

行为覆盖见 [identity-features.test.ts](../../../../tests/integration/repository/identity-features.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
