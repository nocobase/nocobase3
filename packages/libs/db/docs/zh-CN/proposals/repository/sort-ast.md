---
title: Sort AST 与 Sort Builder
description: Repository Sort Builder、扁平可序列化 Sort AST 及稳定排序语义。
---

# Sort AST 与 Sort Builder

> **状态：V1 已实现。** 支持直接 Field、to-one Field path、to-many aggregate、
> relation-local sort、NULL 顺序和自动稳定 tie-breaker。

## Builder 写法

```ts
const rows = await repository.findMany({
  sort: (sort) => [
    sort.field('owner.name').asc().nullsLast(),
    sort.relation('tasks').count().desc(),
    sort.relation('tasks').max('priority').desc().nullsLast(),
    sort.field('createdAt').desc().nullsLast(),
  ],
});
```

数组顺序就是排序优先级。单项可以直接返回：

```ts
sort: (sort) => sort.field('createdAt').desc();
```

Builder 支持：

```ts
sort.field(path).asc();
sort.field(path).desc();
sort.field(path).asc().nullsFirst();
sort.field(path).desc().nullsLast();

sort.relation(path).count().desc();
sort.relation(path).sum(field).desc();
sort.relation(path).avg(field).desc();
sort.relation(path).min(field).asc();
sort.relation(path).max(field).desc();
```

## AST 形态

Builder 会规范化为不含方法或 SQL expression 的纯数据 AST：

```ts
export interface SortAst {
  readonly kind: 'sort';
  readonly version: 1;
  readonly collection?: string;
  readonly items: readonly SortNode[];
}

export type SortNode = SortFieldNode | SortAggregateNode;

export interface SortFieldNode {
  readonly kind: 'field';
  readonly path: readonly string[];
  readonly direction: 'asc' | 'desc';
  readonly nulls?: 'first' | 'last';
}

export type SortAggregateNode =
  | {
      readonly kind: 'aggregate';
      readonly relation: readonly string[];
      readonly aggregate: 'count';
      readonly field?: never;
      readonly direction: 'asc' | 'desc';
      readonly nulls?: 'first' | 'last';
    }
  | {
      readonly kind: 'aggregate';
      readonly relation: readonly string[];
      readonly aggregate: 'sum' | 'avg' | 'min' | 'max';
      readonly field: string;
      readonly direction: 'asc' | 'desc';
      readonly nulls?: 'first' | 'last';
    };
```

完整 AST 示例：

```json
{
  "kind": "sort",
  "version": 1,
  "collection": "projects",
  "items": [
    {
      "kind": "field",
      "path": ["owner", "name"],
      "direction": "asc",
      "nulls": "last"
    },
    {
      "kind": "aggregate",
      "relation": ["tasks"],
      "aggregate": "count",
      "direction": "desc"
    },
    {
      "kind": "aggregate",
      "relation": ["tasks"],
      "aggregate": "max",
      "field": "priority",
      "direction": "desc",
      "nulls": "last"
    }
  ]
}
```

Builder 与 AST 的对应关系：

| Builder                             | AST                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `field('createdAt')`                | `kind: 'field', path: ['createdAt']`                                          |
| `field('owner.name')`               | `kind: 'field', path: ['owner', 'name']`                                      |
| `relation('tasks').count()`         | `kind: 'aggregate', relation: ['tasks'], aggregate: 'count'`                  |
| `relation('tasks').max('priority')` | `kind: 'aggregate', relation: ['tasks'], aggregate: 'max', field: 'priority'` |
| `desc()`                            | `direction: 'desc'`                                                           |
| `nullsLast()`                       | `nulls: 'last'`                                                               |

## Field path

直接 Field 和 to-one relation Field 使用统一的 `kind: 'field' + path`：

```json
{
  "kind": "field",
  "path": ["customer", "region", "name"],
  "direction": "asc",
  "nulls": "last"
}
```

路径前缀只能经过 `belongsTo` 或 `hasOne`，终点必须是可排序标量 Field。Field path 不能
穿过 to-many relation，因为一个父记录对应多个候选值；这类需求必须显式选择 aggregate。

用于排序的 relation 不要求同时出现在 Select 中。

## Relation aggregate

Aggregate relation path 允许零个或多个 to-one 前缀，终点必须是一个 to-many relation：

```ts
sort: (sort) => [
  sort.relation('tasks').count().desc(),
  sort.relation('tasks').sum('estimate').desc(),
  sort.relation('tasks').avg('progress').desc(),
  sort.relation('tasks').min('createdAt').asc(),
  sort.relation('tasks').max('priority').desc(),
];
```

| aggregate | `field`  | 允许的终点字段   |
| --------- | -------- | ---------------- |
| `count`   | 必须省略 | 不适用           |
| `sum`     | 必须提供 | 数值 Field       |
| `avg`     | 必须提供 | 数值 Field       |
| `min`     | 必须提供 | 可排序标量 Field |
| `max`     | 必须提供 | 可排序标量 Field |

V1 不允许 relation path 出现多个 to-many segment，也不会根据 Field 名自动猜测 aggregate。

## NULL 与空关系

`nulls` 只接受 `first | last`，省略时默认 `last`。跨数据库语义为：

| 场景                                 | 排序值 |
| ------------------------------------ | ------ |
| to-one relation 不存在               | `null` |
| to-many `count` 空集合               | `0`    |
| to-many `sum` 空集合                 | `0`    |
| to-many `avg` / `min` / `max` 空集合 | `null` |

底层数据库不原生支持 NULL 顺序时，由执行 adapter 生成等价表达式。

## 稳定排序

Repository 保留调用方的优先级，并在排序不能唯一确定记录时自动追加当前 Collection 主键：

```text
createdAt DESC NULLS LAST
  -> id ASC
```

已覆盖某个唯一约束时不再追加；复合主键按 metadata 顺序追加。根 aggregate sort 追加根主键，
relation-local sort 追加 relation target 的主键。省略 `sort` 或提供空 `items` 时，默认按主键
升序。

同一 target 不能重复声明，即使 direction 不同：

```ts
sort: (sort) => [
  sort.field('createdAt').asc(),
  sort.field('createdAt').desc(), // INVALID_SORT
];
```

## Relation-local sort

在 to-many include 中，sort 只改变该父记录下 relation 数组的顺序：

```ts
select: (select) =>
  select.include('tasks', (tasks) =>
    tasks
      .fields('id', 'title', 'priority')
      .sort((sort) => [
        sort.field('priority').desc(),
        sort.field('createdAt').asc(),
      ]),
  );
```

它不改变根记录的顺序、数量、分页或 `count()`。to-one include 的非空 local sort 会被拒绝。

## V1 边界

V1 不支持 raw SQL、函数、方言 collation、随机排序、window function、aggregate-local
Filter、多个 to-many segment，以及字符串、tuple 或 object-map 简写。

相关文档：

- [Select AST 与 Select Builder](./select-ast.md)
- [Select/Sort 输入改进提案](./prisma-inspired-select-sort-input.md)
- [Repository 概览](./overview.md)
