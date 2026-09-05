---
title: Filter AST 提案
description: Repository Filter AST 的设计与当前运行时能力。
---

# Filter AST

> **状态：V1 运行时已实现。** 直接标量与 Relation Filter AST 均可执行，关系量词通过相关子查询编译。

Filter AST 是 Repository Filter Builder 和 equality shorthand 统一规范化后的结构化表示。它也可
用于在代码、HTTP、CLI、file sync 和未来持久化场景之间传递完整筛选条件。

```text
简单 equality shorthand ─┐
Filter Builder ────────────┼─> Filter AST -> validate -> execute
完整 Filter AST ───────────┘
```

复杂条件在 TypeScript 代码中更适合使用 Filter Builder：

```ts
filter.and([
  filter.string('status').eq('paid'),
  filter.date('createdAt').notBefore('2026-01-01'),
]);
```

Filter AST 更适合序列化：

```json
{
  "kind": "filter",
  "version": 1,
  "collection": "orders",
  "root": {
    "kind": "group",
    "logic": "and",
    "items": [
      {
        "kind": "condition",
        "path": ["status"],
        "operator": "$eq",
        "value": "paid"
      },
      {
        "kind": "condition",
        "path": ["createdAt"],
        "operator": "$dateNotBefore",
        "value": "2026-01-01"
      }
    ]
  }
}
```

## 设计目标

Filter AST 要满足几个目标：

- 可序列化，适合 HTTP、CLI、文件存储和数据库存储。
- 可解释，Agent 和人都能读懂每个节点。
- 可校验，运行时可以基于 Collection metadata 检查字段、关系和 operator。
- 可编译，可以转换成 QueryAdapter 条件或未来的 NocoBase 既有 filter 结构。
- 与数据库解耦，不直接暴露 SQL、tableName 或 columnName。

## TypeScript 草案

```ts
export interface FilterAst {
  kind: 'filter';
  version: 1;
  collection?: string;
  root: FilterGroupNode;
}

export type FilterNode =
  FilterGroupNode | FilterConditionNode | FilterRelationNode;

export interface FilterGroupNode {
  kind: 'group';
  logic: 'and' | 'or';
  items: FilterNode[];
}

export interface FilterConditionNode {
  kind: 'condition';
  path: readonly string[];
  operator: FilterOperator;
  value?: FilterValue;
}

export interface FilterRelationNode {
  kind: 'relation';
  path: readonly string[];
  quantifier: 'exists' | 'notExists' | 'some' | 'none' | 'empty' | 'notEmpty';
  filter?: FilterGroupNode;
}

export type FilterOperator =
  | '$includes'
  | '$notIncludes'
  | '$eq'
  | '$ne'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$empty'
  | '$notEmpty'
  | '$dateOn'
  | '$dateNotOn'
  | '$dateBefore'
  | '$dateAfter'
  | '$dateNotBefore'
  | '$dateNotAfter'
  | '$dateBetween'
  | '$isTruly'
  | '$isFalsy';

export type FilterScalar = string | number | boolean | null;

export type FilterLiteral =
  | FilterScalar
  | readonly FilterLiteral[]
  | { readonly [key: string]: FilterLiteral };

export type FilterValue =
  FilterLiteral | FilterVariable | readonly (FilterLiteral | FilterVariable)[];

export interface FilterVariable {
  kind: 'variable';
  path: string;
}
```

`path` 在 AST 中统一存为数组。代码 API 可以接受 dot-string，例如 `createdBy.id`，但进入 AST 后应标准化为：

```json
["createdBy", "id"]
```

## 根节点

Filter AST 的根节点始终是 group：

```json
{
  "kind": "filter",
  "version": 1,
  "root": {
    "kind": "group",
    "logic": "and",
    "items": []
  }
}
```

即使只有一个条件，也应被标准化到 `and` group 中：

```ts
filter.string('status').eq('paid');
```

可以生成：

```json
{
  "kind": "filter",
  "version": 1,
  "collection": "orders",
  "root": {
    "kind": "group",
    "logic": "and",
    "items": [
      {
        "kind": "condition",
        "path": ["status"],
        "operator": "$eq",
        "value": "paid"
      }
    ]
  }
}
```

这样 AST 消费端不需要同时处理“单条件根节点”和“组合根节点”两种形态。

## 条件节点

普通字段条件使用 `condition` 节点：

```json
{
  "kind": "condition",
  "path": ["amount"],
  "operator": "$gte",
  "value": 100
}
```

Relation 的 to-one 路径也可以表现为普通字段条件：

```json
{
  "kind": "condition",
  "path": ["createdBy", "id"],
  "operator": "$eq",
  "value": {
    "kind": "variable",
    "path": "$user.id"
  }
}
```

运行时根据 Collection metadata 判断：

- `createdBy` 是否为合法 relation。
- `id` 是否为 relation 目标 Collection 上的合法字段。
- `id` 的实际 Field type 对应的 operator group 是否允许 `$eq`。

字段是否为主键或唯一键不改变 operator group；`text`、`json` 和 ID Field 都按 Collection 中声明的实际 Field type 校验。`json` 在 V1 没有可执行 operator；保留 group 是为了显式报告 capability，而不是回退成 object 或 string 比较。
自定义 Field type 必须显式注册 operator group；没有映射时拒绝条件。`blob` 和 `native`
在 V1 不支持筛选。

`empty()`、`notEmpty()`、`isTrue()`、`isFalse()`、`exists()`、`notExists()` 这类不需要业务入参的方法，可以在 AST 中省略 `value`。如果后续要兼容 NocoBase 既有 object filter，序列化层可以按目标格式补出 `true` 之类的占位值。

V1 的空值语义固定如下：string/text 的 `$empty` 是 `NULL OR ''`，`$notEmpty` 是
`NOT NULL AND != ''`；其他支持这些 operator 的标量 Field 只判断 `NULL` / `NOT NULL`；
JSON 不支持二者。relation 的空值只通过 relation quantifier 表达。

日期 literal 也必须可移植：`date` 使用 ISO `YYYY-MM-DD`，`datetime` 使用带显式 offset
或 `Z` 的 ISO 8601，代码 API 中的 `Date` 先转 ISO string。`$dateBetween` 是 `[start, end)`
半开区间。`$dateOn` / `$dateNotOn` 只用于 `date`；V1 不在缺少时区时解释 datetime
自然日，也不支持相对日期 token。

## Relation 节点

To-many relation 使用 `relation` 节点，不能直接降级成普通 dot path。

```json
{
  "kind": "relation",
  "path": ["roles"],
  "quantifier": "some",
  "filter": {
    "kind": "group",
    "logic": "or",
    "items": [
      {
        "kind": "condition",
        "path": ["name"],
        "operator": "$eq",
        "value": "root"
      },
      {
        "kind": "condition",
        "path": ["name"],
        "operator": "$eq",
        "value": "admin"
      }
    ]
  }
}
```

Relation quantifier 的语义：

| quantifier  | 语义                     | 是否需要 `filter` |
| ----------- | ------------------------ | ----------------- |
| `some`      | 至少一个关联记录满足条件 | 是                |
| `none`      | 没有任何关联记录满足条件 | 是                |
| `exists`    | 关联存在                 | 否                |
| `notExists` | 关联不存在               | 否                |
| `empty`     | 关联为空                 | 否                |
| `notEmpty`  | 关联不为空               | 否                |

V1 不设计 `every`，避免空关联集合语义不直观。

## 变量节点

变量是 AST value，而不是字符串模板：

```json
{
  "kind": "variable",
  "path": "$user.id"
}
```

Repository operation 通过 `context` 传入变量解析上下文：

```ts
await db.repository('orders').findMany({
  context: {
    user: {
      id: 1,
    },
  },
  filter: (filter) =>
    filter.string('createdBy.id').eq(filter.variable('$user.id')),
});
```

编译时应按以下规则处理变量：

- 从 `context` 解析变量值。
- `$user.id` 表示读取 `context.user.id`，不是读取 `context.$user.id`。
- 缺失变量默认抛错。
- 变量解析结果进入 SQL bindings。
- 不把变量拼接进 SQL 字符串。
- 不要求 TypeScript 代码作者直接写 `{{$user.id}}`。

## JSON 输入边界

NocoBase 既有能力中已经存在 object filter 形态，例如：

```json
{
  "$and": [
    {
      "status": {
        "$eq": "paid"
      }
    }
  ]
}
```

Repository V1 不接受这种带 operator 的旧 object filter 作为主要输入。当前 JSON 输入分为：

- 简单 equality 使用 shorthand，例如 `{ status: 'paid' }`；
- 复杂可序列化条件使用完整 Filter AST；
- 旧 object filter 如需兼容，应在 Repository 边界外显式转换。

内部方向是：

```text
Filter Builder -> Filter AST -> compiler -> QueryAdapter / existing NocoBase filter object
```

也就是说，Filter AST 是 Repository 内部更稳定、更可解释的中间表示；当前不增加
Compact Filter V2。

## 完整示例

筛选“没有关联 root，也没有关联 admin 的启用用户”：

```ts
const users = await db.repository('users').findMany({
  context: {
    user: {
      id: 1,
    },
  },
  filter: (filter) =>
    filter.and([
      filter.boolean('enabled').isTrue(),
      filter
        .relation('roles')
        .none((role) =>
          role.or([
            role.string('name').eq('root'),
            role.string('name').eq('admin'),
          ]),
        ),
      filter.string('createdBy.id').eq(filter.variable('$user.id')),
    ]),
});
```

对应 AST：

```json
{
  "kind": "filter",
  "version": 1,
  "collection": "users",
  "root": {
    "kind": "group",
    "logic": "and",
    "items": [
      {
        "kind": "condition",
        "path": ["enabled"],
        "operator": "$isTruly"
      },
      {
        "kind": "relation",
        "path": ["roles"],
        "quantifier": "none",
        "filter": {
          "kind": "group",
          "logic": "or",
          "items": [
            {
              "kind": "condition",
              "path": ["name"],
              "operator": "$eq",
              "value": "root"
            },
            {
              "kind": "condition",
              "path": ["name"],
              "operator": "$eq",
              "value": "admin"
            }
          ]
        }
      },
      {
        "kind": "condition",
        "path": ["createdBy", "id"],
        "operator": "$eq",
        "value": {
          "kind": "variable",
          "path": "$user.id"
        }
      }
    ]
  }
}
```

## 校验流程

Repository 编译 Filter AST 时建议按这个顺序校验：

```text
Filter AST
  -> resolve root collection
  -> resolve field / relation path
  -> resolve terminal field operator group
  -> validate operator
  -> resolve variables from context
  -> compile relation joins / exists queries
  -> execute logical plan through the bound database adapter
```

任何一步失败都应给出可解释错误，而不是降级成 raw SQL。

## Agent 注意事项

- 本页是规划文档，不代表当前代码已经可用。
- AST 字段使用完整 key：`kind`、`version`、`collection`、`root`、`path`、`operator`、`value`、`quantifier`。
- `path` 在 AST 中使用数组，不使用 dot-string。
- 根节点统一为 `group`。
- 日期字段只使用 `$date...` operator。
- to-many relation 使用 `relation` 节点。
- 变量使用 `{ "kind": "variable", "path": "$user.id" }`。
- 不在 AST 中放 raw SQL、tableName 或 columnName。
