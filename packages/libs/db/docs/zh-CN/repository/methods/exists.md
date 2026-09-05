---
title: exists：判断记录是否存在
description: 用 exists 判断 Filter 是否匹配记录，说明布尔返回、上下文和检查后再写入的竞争边界。
---

# exists：判断记录是否存在

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：无。
- 可选：`filter / context`。
- 返回：`boolean`，无匹配为 `false`。

## 完整示例

在空的 projects 中准备一条记录：

```ts
const projects = db.repository('projects');
await projects.createOne({
  values: { id: 'project-1', name: 'Repository', status: 'active' },
});
const matched = await projects.exists({ filter: { status: 'active' } });
// matched: true
const empty = await projects.exists({ filter: { id: 'missing' } });
// empty: false
```

## 变量条件

```ts
const result = await db.repository('projects').exists({
  filter: (f) => f.string('ownerId').eq(f.variable('$actor.id')),
  context: { actor: { id: 'user-1' } },
});
```

## 边界

仅接受 filter/context，不接受 select、sort、limit、distinct，也不继承其他查询的条件。省略 filter 检查全部记录；空对象 Filter 不表示全选。

exists 为 true 不保证后续写入仍能匹配，也不是权限检查。不要用 exists 再 create 代替唯一约束或 [upsertOne](./upsert-one.md)；并发期间状态可能变化。

关系条件参见 [Filter](../filter.md)，上下文解析规则参见 [Context](../context.md)。

## 验证依据

行为覆盖见 [scalar.test.ts](../../../../tests/integration/repository/scalar.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
