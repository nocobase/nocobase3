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

## 场景 EX-01：零条、一条、多条都返回 boolean

在空 projects 中连续执行：

```ts
const projects = db.repository('projects');
const before = await projects.exists();
// before: false
await projects.createMany({
  values: [
    { id: 'ex-a', name: 'A', status: 'active' },
    { id: 'ex-b', name: 'B', status: 'active' },
  ],
});
const one = await projects.exists({ filter: { id: 'ex-a' } });
const many = await projects.exists({ filter: { status: 'active' } });
const none = await projects.exists({ filter: { status: 'draft' } });
// one: true; many: true; none: false
```

测试断言：多条匹配不会报 MULTIPLE_RECORDS_MATCHED，也不返回数量或记录对象；调用前后数据不变。exists 不要求唯一条件，不等同于 updateOne/deleteOne 的准确一条匹配检查。

## 场景 EX-02：同一 Filter 模板不保留上次 context

沿用 EX-01 数据：

```ts
import type { RepositoryFilter } from '@nocobase/db';

const filter: RepositoryFilter<{ id: string }> = (f) =>
  f.string('id').eq(f.variable('$input.code'));
const found = await projects.exists({
  filter,
  context: { input: { code: 'ex-a' } },
});
const absent = await projects.exists({
  filter,
  context: { input: { code: 'missing' } },
});
// found: true; absent: false
```

再调用 `projects.exists({ filter })` 应报 VARIABLE_NOT_FOUND，不能继承 ex-a 或 missing。不存在的字段应报 FIELD_NOT_FOUND，空对象 filter 应报 INVALID_FILTER；这些都不是“合法条件无匹配”的 false。

即使 found 为 true，后续 updateOne 仍可能因为并发删除或版本变化失败。此场景只验证一次读取的布尔结果，不赋予记录锁定、权限校验或幂等写入能力。

## 测试映射

EX-01 与 methods/read-contracts.test.ts 的 exists 能力相关；EX-02 的变量复用与 capabilities/create-context.test.ts 有相关覆盖。两组具体 exists 场景作为后续测试依据，不把其他方法的覆盖视为 exists 组合已验证。

## 验证依据

行为覆盖见 [read-contracts.test.ts](../../../../tests/integration/repository/methods/read-contracts.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
