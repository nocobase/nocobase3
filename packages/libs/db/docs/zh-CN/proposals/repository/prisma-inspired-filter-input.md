---
title: Repository Filter 输入改进提案
description: 参考 Prisma Next 的 where shorthand 与 Builder 分层，设计 Repository 简单 JSON filter、复杂 Builder 和内部 Filter AST 的统一输入模型。
---

# Repository Filter 输入改进提案

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：第一阶段已实现。** 本文只调整 Filter 输入形态，不改变现有 Filter Builder、
> Filter AST、严格单条 mutation 或批量写入安全语义。

## 问题

Repository 原先只接受 Builder callback 或完整 Filter AST：

```ts
type RepositoryFilter<TRecord extends object> =
  FilterAst | ((filter: FilterBuilder<TRecord>) => FilterNode);
```

Builder 适合复杂条件，但简单 JSON 也必须构造完整 AST：

```json
{
  "kind": "filter",
  "version": 1,
  "root": {
    "kind": "group",
    "logic": "and",
    "items": [
      {
        "kind": "condition",
        "path": ["id"],
        "operator": "$eq",
        "value": "project-1"
      }
    ]
  }
}
```

AST 本身没有问题，问题是让普通 JSON 调用方直接书写内部结构。

## Prisma Next 的取舍

本提案参考本地 Prisma ORM `main` 分支。Prisma Next 的 `where()` 分为：

```text
简单对象 shorthand ─┐
Builder callback ─────┼─> 内部 Expression AST
底层 WhereArg ────────┘
```

简单对象只负责多字段 equality：

```ts
db.orm.User.where({
  id: 1,
  active: true,
});
```

复杂比较与关系条件交给 Builder：

```ts
db.orm.User.where((user) =>
  and(user.age.gte(18), user.posts.some({ published: true })),
);
```

值得借鉴的是“简单对象 + 复杂 Builder + 内部 AST”的分层，而不是链式执行 API。

## 已实现设计

```ts
type RepositoryFilter<TRecord extends object> =
  | FilterShorthand<TRecord>
  | FilterAst
  | ((filter: FilterBuilder<TRecord>) => FilterNode);
```

| 输入                    | 场景                       | 能力                    |
| ----------------------- | -------------------------- | ----------------------- |
| `FilterShorthand`       | 简单代码、HTTP、CLI、Agent | 直接标量 Field equality |
| Filter Builder callback | TypeScript 复杂条件        | 完整 V1 Filter 能力     |
| `FilterAst`             | 动态表单、配置、机器传递   | 完整、可序列化协议      |

三种输入统一进入现有执行链：

```text
RepositoryFilter
  -> 根据 Collection metadata 规范化
  -> FilterAst
  -> validate
  -> query plan
  -> adapter
```

## 简单 shorthand

```ts
await projects.updateOne({
  filter: {
    id: 'project-1',
    tenantId: 'tenant-1',
  },
  values: {
    status: 'active',
  },
});
```

等价 Builder：

```ts
filter: (filter) =>
  filter.and([
    filter.string('id').eq('project-1'),
    filter.string('tenantId').eq('tenant-1'),
  ]);
```

固定规则：

| 输入                    | 处理方式                              |
| ----------------------- | ------------------------------------- |
| 多个 Field              | 隐式 `AND`                            |
| `string/number`         | 按 Field group 规范化为 `$eq`         |
| `boolean`               | 规范化为 `$isTruly` / `$isFalsy`      |
| `null`                  | 按 Field group 规范化为 SQL `IS NULL` |
| 空对象或 `undefined`    | 拒绝，不能表示全集                    |
| relation 或未知 Field   | 拒绝                                  |
| 不支持 shorthand 的类型 | 使用 Builder 或 Filter AST            |

Prisma Next 会忽略 `undefined`；Repository 的同一 Filter 也用于 update/delete，因此建议拒绝，
避免作用域意外扩大。

概念类型：

```ts
type FilterShorthandValue = string | number | boolean | null;

type FilterShorthand<TRecord extends object> = Readonly<
  Partial<{
    [TKey in keyof TRecord]: FilterShorthandValue;
  }>
>;
```

当前公共类型按 record key 限制字段名，动态 Repository 在运行时根据 Collection metadata
校验 Field 类型和值。日期、datetime、JSON、blob、native 和 relation Field 不支持
shorthand，避免为“简写”引入新的跨数据库相等语义。

## 复杂条件保持 Builder

第一阶段不增加完整的 `$operator` JSON DSL：

```ts
await projects.updateMany({
  filter: (filter) =>
    filter.and([
      filter.string('tenantId').eq(filter.variable('$tenantId')),
      filter.or([
        filter.string('status').eq('draft'),
        filter.string('status').eq('pending'),
      ]),
      filter.number('priority').gte(3),
    ]),
  context: {
    tenantId: 'tenant-1',
  },
  values: {
    status: 'active',
  },
});
```

关系条件同样保持现有 Builder/AST：

```ts
filter: (filter) =>
  filter
    .relation('tasks')
    .some((task) =>
      task.and([
        task.string('status').eq('pending'),
        task.number('priority').gte(3),
      ]),
    );
```

暂不引入：

```ts
// Not included in the first shorthand version.
filter: {
  priority: { $gte: 3 },
  tasks: { $some: { status: 'pending' } },
}
```

复杂紧凑 JSON DSL（Compact Filter V2）暂不实现；复杂条件继续使用 Builder 或完整 AST。

## Relation target filter

关系目标复用 `RepositoryFilter`，因此也能使用 shorthand：

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    tasks: {
      update: [
        {
          filter: { id: 'task-1' },
          values: { title: 'Updated title' },
        },
      ],
      delete: [
        {
          filter: { id: 'task-old' },
        },
      ],
    },
  },
});
```

目标作用域规则不变：

- `update/delete` 在当前 relation scope 内必须恰好命中一条；
- to-many target 必须显式提供 Filter；
- `upsert.filter` 必须等价于主键或唯一约束；
- Repository 自动叠加当前 source 的 relation scope。

## 与 Prisma 的取舍

| 设计点          | Prisma Next                 | Repository                      |
| --------------- | --------------------------- | ------------------------------- |
| 简单对象        | 多字段 equality，隐式 `AND` | 相同                            |
| `undefined`     | 忽略                        | 拒绝，避免 mutation 作用域扩大  |
| 复杂代码 Filter | Model accessor Builder      | Collection-aware Filter Builder |
| 复杂 JSON       | 不是主要入口                | 保留完整 Filter AST             |
| 执行形式        | `.where().update()`         | `updateOne({ filter, values })` |
| 单条 mutation   | 一个匹配目标                | 必须恰好匹配一条                |
| 全量 mutation   | 依赖链式状态                | 显式 `all: true`                |

## 安全边界

- shorthand 只缩短输入，不改变现有操作范围；
- `updateOne/deleteOne` 继续执行严格单条检查；
- `updateMany/deleteMany` 继续要求非空 Filter 或 `all: true`；
- `{}`、包含 `undefined` 或规范化后为空的 shorthand 必须拒绝；
- 所有 Field 必须在执行查询前根据 Collection metadata 校验；
- `context` 仍只解析变量，不代表已授权。

## 实现状态

- 已增加直接标量 equality `FilterShorthand`，并统一规范化为 Filter AST；
- 已覆盖 read、根 mutation、`validateMutation()` 与 relation target Filter；
- Builder、完整 Filter AST、严格单条 mutation 与显式 `all: true` 语义保持不变；
- Compact Filter V2 不在当前实现范围内。

## 结论

第一阶段只实现：

```ts
filter: {
  id: 'project-1',
  tenantId: 'tenant-1',
}
```

复杂条件继续使用 Builder，完整动态条件继续使用 Filter AST。这样既明显降低常见 JSON
噪音，也不需要维护第二套复杂 Filter DSL。

相关文档：

- [Filter Builder](./filter-builder.md)
- [Filter AST](./filter-ast.md)
- [Repository 概览](./overview.md)
- [Repository 写入方法示例](./mutation-examples.md)
