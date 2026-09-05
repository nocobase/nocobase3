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

## 验证依据

行为覆盖见 [scalar.test.ts](../../../../tests/integration/repository/scalar.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
