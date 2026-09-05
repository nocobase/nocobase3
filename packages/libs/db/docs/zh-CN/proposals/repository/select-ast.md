---
title: Select AST 与 Select Builder
description: Repository Select Builder、可序列化 Select AST 及关系加载语义。
---

# Select AST 与 Select Builder

> **状态：V1 已实现。** `findMany()`、`findOne()`、`createOne()` 和 `updateOne()` 同时接受
> Select Builder 与 Select AST；执行 adapter 只接收规范化后的 AST。

Select 描述返回字段和需要加载的 relation。根记录筛选与排序仍由 operation 顶层的
`filter`、`sort` 决定。

## Builder 写法

TypeScript 调用优先使用 Builder：

```ts
const projects = await repository.findMany({
  select: (select) =>
    select
      .fields('id', 'name')
      .include('owner', (owner) => owner.fields('id', 'name'))
      .include('tasks', (tasks) =>
        tasks
          .fields('id', 'title', 'priority')
          .filter({ status: 'pending' })
          .sort((sort) => [
            sort.field('priority').desc(),
            sort.field('createdAt').asc(),
          ]),
      ),
});
```

规则：

- `.fields()` 只选择当前 Collection 的直接标量 Field；
- `.include()` 选择直接 relation，并把 callback 作用域切换到目标 Collection；
- `.include('owner')` 省略 callback 时，返回目标 Collection 的默认全部标量 Field；
- relation-local `.filter()` 接受 Filter shorthand、Filter Builder 或 Filter AST；
- relation-local `.sort()` 接受 Sort Builder 或 Sort AST；
- 根 filter/sort 仍放在 Repository operation 顶层；
- 同一层重复 Field 或 include 会被拒绝。

## AST 形态

```ts
export interface SelectAst {
  readonly kind: 'select';
  readonly version: 1;
  readonly collection?: string;
  readonly root: SelectNode;
}

export interface SelectNode {
  readonly kind: 'selection';
  readonly fields?: readonly string[];
  readonly includes?: readonly SelectIncludeNode[];
}

export interface SelectIncludeNode {
  readonly kind: 'include';
  readonly relation: string;
  readonly select: SelectNode;
  readonly filter?: FilterAst;
  readonly sort?: SortAst;
}
```

完整 JSON 示例：

```json
{
  "kind": "select",
  "version": 1,
  "collection": "orders",
  "root": {
    "kind": "selection",
    "fields": ["id", "orderNo", "amount"],
    "includes": [
      {
        "kind": "include",
        "relation": "customer",
        "select": {
          "kind": "selection",
          "fields": ["id", "name"]
        }
      },
      {
        "kind": "include",
        "relation": "items",
        "select": {
          "kind": "selection",
          "fields": ["id", "quantity", "createdAt"],
          "includes": [
            {
              "kind": "include",
              "relation": "product",
              "select": {
                "kind": "selection",
                "fields": ["id", "name"]
              }
            }
          ]
        },
        "filter": {
          "kind": "filter",
          "version": 1,
          "root": {
            "kind": "group",
            "logic": "and",
            "items": [
              {
                "kind": "condition",
                "path": ["quantity"],
                "operator": "$gt",
                "value": 0
              }
            ]
          }
        },
        "sort": {
          "kind": "sort",
          "version": 1,
          "items": [
            {
              "kind": "field",
              "path": ["createdAt"],
              "direction": "desc",
              "nulls": "last"
            }
          ]
        }
      }
    ]
  }
}
```

Builder 只存在于 TypeScript 输入层；HTTP、CLI、Agent 和持久化配置使用上述纯 JSON AST。

## 默认字段与返回形状

| 输入               | 语义                                                      |
| ------------------ | --------------------------------------------------------- |
| `select` 整体省略  | 返回根 Collection 的全部直接非 relation Field，不加载关系 |
| `.fields()` 未调用 | 返回当前节点的全部直接非 relation Field                   |
| `.fields()` 无参数 | 不返回显式标量 Field，可以只返回 include                  |
| `.include()` 省略  | 不加载 relation                                           |

Repository 可以在内部补读主键、source key 或 foreign key 以组装关系，但未显式选择的辅助字段
不会出现在最终结果中。

## 标量字段类型推导

TypeScript 调用使用 Select Builder 且只选择根级标量 Field 时，Repository 根据
`.fields()` 的字段字面量推导结果：

```ts
const users = await repository.findMany({
  select: (select) => select.fields('id', 'name'),
});

// Array<Pick<UserRecord, 'id' | 'name'>>
```

`findMany()`、`findOne()`、`createOne()` 和 `updateOne()` 使用同一条推导规则；单条 mutation
只缩小 `SingleMutationResult.record`。省略 `select`、传入运行时 Select AST 或包含 relation
include 时继续返回完整 `TRecord`，relation 的精确返回类型留给后续阶段。

Relation metadata 决定返回基数：

| relation 类型              | 返回形状              | 无匹配时 |
| -------------------------- | --------------------- | -------- |
| `belongsTo`、`hasOne`      | 目标记录对象或 `null` | `null`   |
| `hasMany`、`belongsToMany` | 目标记录数组          | `[]`     |

选择 to-many relation 不改变根记录的数量、根分页或 `count()` 语义；实现使用批量关系加载避免
N+1，并按父记录组装数组。

## Relation-local filter 与 sort

Relation-local filter 只限制返回的关联记录，不筛选根记录：

```ts
select: (select) =>
  select
    .fields('id', 'orderNo')
    .include('items', (items) =>
      items
        .fields('id', 'quantity')
        .filter((filter) => filter.number('quantity').gt(0)),
    );
```

需要筛选“至少存在一条有效 item 的订单”时，应在根 Filter Builder 使用 relation
quantifier。

Relation-local sort 只适用于 to-many include：

```ts
select: (select) =>
  select.include('items', (items) =>
    items
      .fields('id', 'createdAt')
      .sort((sort) => sort.field('createdAt').desc().nullsLast()),
  );
```

to-one include 的 local sort 没有可观察意义，因此非空 sort 会被拒绝。

## 校验与边界

运行时根据每一级 Collection metadata 校验：

- `collection` 与当前 Repository 或 relation target 一致；
- `fields` 只包含存在且可选择的直接标量 Field；
- `relation` 是当前 Collection 的直接 relation Field；
- 每层 Field/include 不重复；
- relation-local Filter/Sort 在目标 Collection 上解析；
- relation target 存在，relation 基数与 local sort 能力匹配。

V1 不支持 relation-local `limit`/`offset`、聚合投影、计算表达式、别名、raw SQL 或
dot-string include。AST 的 relation 嵌套必须通过 `includes` 递归表达。

相关文档：

- [Select/Sort 输入改进提案](./prisma-inspired-select-sort-input.md)
- [Filter AST](./filter-ast.md)
- [Sort AST 与 Sort Builder](./sort-ast.md)
- [Repository 概览](./overview.md)
