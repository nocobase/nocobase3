---
title: Repository Select 与 Sort 输入改进提案
description: 参考 Prisma Next 的 Collection Builder，统一 Repository Select/Sort Builder 与可序列化 AST 的公开契约。
---

# Repository Select 与 Sort 输入改进提案

> **状态：已实现。** 本次直接调整 beta 阶段的 Select/Sort V1 AST，
> 不保留旧 AST 兼容层，也不改变现有查询、关系加载、稳定排序和跨数据库语义。

## Select

TypeScript 使用 Builder：

```ts
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
    );
```

Builder 规范化为：

```ts
interface SelectAst {
  readonly kind: 'select';
  readonly version: 1;
  readonly collection?: string;
  readonly root: SelectNode;
}

interface SelectNode {
  readonly kind: 'selection';
  readonly fields?: readonly string[];
  readonly includes?: readonly SelectIncludeNode[];
}

interface SelectIncludeNode {
  readonly kind: 'include';
  readonly relation: string;
  readonly select: SelectNode;
  readonly filter?: FilterAst;
  readonly sort?: SortAst;
}
```

旧名称直接调整：

```text
relations          -> includes
SelectRelationNode -> SelectIncludeNode
kind: relation     -> kind: include
field              -> relation
```

规则保持简单：

- `fields()` 选择当前 Collection 的直接标量 Field；省略时选择全部默认标量 Field；
- `include()` 切换到 relation 目标 Collection，可递归 fields/include；
- relation-local `filter()` 接受 Repository Filter shorthand、Builder 或完整 Filter AST；
- relation-local `sort()` 接受 Sort Builder 或完整 Sort AST；
- 同一层重复 Field 或 include 继续拒绝；
- 根 filter/sort 仍放在 Repository operation 顶层，不进入根 Select Builder；
- 第一阶段不增加 `select: ['id', 'name']` 数组 shorthand。

公共输入：

```ts
type RepositorySelect<TRecord extends object> =
  SelectAst | ((select: SelectBuilder<TRecord>) => SelectBuilder<TRecord>);
```

## Sort

TypeScript 使用显式 Repository Builder，而不是暴露 SQL expression：

```ts
sort: (sort) => [
  sort.field('owner.name').asc().nullsLast(),
  sort.relation('tasks').count().desc(),
  sort.relation('tasks').max('priority').desc().nullsLast(),
  sort.field('createdAt').desc().nullsLast(),
];
```

Builder 规范化为扁平 Sort AST：

```ts
interface SortAst {
  readonly kind: 'sort';
  readonly version: 1;
  readonly collection?: string;
  readonly items: readonly SortNode[];
}

type SortNode = SortFieldNode | SortAggregateNode;

interface SortFieldNode {
  readonly kind: 'field';
  readonly path: RepositoryPath;
  readonly direction: 'asc' | 'desc';
  readonly nulls?: 'first' | 'last';
}

type SortAggregateNode =
  | {
      readonly kind: 'aggregate';
      readonly relation: RepositoryPath;
      readonly aggregate: 'count';
      readonly field?: never;
      readonly direction: 'asc' | 'desc';
      readonly nulls?: 'first' | 'last';
    }
  | {
      readonly kind: 'aggregate';
      readonly relation: RepositoryPath;
      readonly aggregate: 'sum' | 'avg' | 'min' | 'max';
      readonly field: string;
      readonly direction: 'asc' | 'desc';
      readonly nulls?: 'first' | 'last';
    };
```

Builder 与 AST 一一对应：

| Builder                             | AST                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `field('createdAt')`                | `kind: 'field', path: ['createdAt']`                                          |
| `field('owner.name')`               | `kind: 'field', path: ['owner', 'name']`                                      |
| `relation('tasks').count()`         | `kind: 'aggregate', relation: ['tasks'], aggregate: 'count'`                  |
| `relation('tasks').max('priority')` | `kind: 'aggregate', relation: ['tasks'], aggregate: 'max', field: 'priority'` |
| `desc()`                            | `direction: 'desc'`                                                           |
| `nullsLast()`                       | `nulls: 'last'`                                                               |

完整示例：

```ts
const sort: SortAst = {
  kind: 'sort',
  version: 1,
  items: [
    {
      kind: 'field',
      path: ['owner', 'name'],
      direction: 'asc',
      nulls: 'last',
    },
    {
      kind: 'aggregate',
      relation: ['tasks'],
      aggregate: 'count',
      direction: 'desc',
    },
    {
      kind: 'aggregate',
      relation: ['tasks'],
      aggregate: 'max',
      field: 'priority',
      direction: 'desc',
      nulls: 'last',
    },
  ],
};
```

公共输入：

```ts
type RepositorySort<TRecord extends object> =
  | SortAst
  | ((
      sort: SortBuilder<TRecord>,
    ) => SortExpression | readonly SortExpression[]);
```

已有语义保持不变：

- Field path 可以经过零个或多个 to-one relation，终点必须是可排序标量 Field；
- aggregate relation 可以有 to-one 前缀，终点必须是一个 to-many relation；
- `count` 不接受 Field，`sum/avg` 只接受数值 Field，`min/max` 接受可排序 Field；
- `nulls` 省略时默认 `last`；
- 非唯一排序自动追加主键作为稳定 tie-breaker；
- 省略 sort 时默认主键升序；
- relation-local sort 仍只允许用于 to-many include。

## 规范化边界

```text
Select Builder ─┐
Select AST ──────┼─> SelectAst -> validate -> plan -> adapter

Sort Builder ───┐
Sort AST ────────┼─> SortAst -> validate -> plan -> adapter
```

Builder 是 TypeScript 便利层；AST 是 HTTP、CLI、Agent、持久化配置和内部执行之间的稳定、
可序列化协议。执行 adapter 只接收规范化后的 AST。

## 实现阶段

1. 已定稿并提交本契约；
2. 已调整 Select AST，实现 Select Builder 并迁移测试；
3. 已调整 Sort AST，实现 Sort Builder 并迁移测试；
4. 已同步 Repository 概览、Select/Sort 专题和写入示例。
