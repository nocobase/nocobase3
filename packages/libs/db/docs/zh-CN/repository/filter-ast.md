# Filter AST

> **状态：规划中。** Filter AST 当前尚未实现或导出，只用于 Repository 设计讨论，不要生成到运行时代码。

> 状态：规划设计，暂未实现。

Filter AST 是 Repository Filter Builder 的结构化结果。它用于在代码、HTTP、CLI、file sync、权限配置和未来持久化场景之间传递同一套筛选条件。

Filter Builder 更适合 TypeScript 代码：

```ts
filter.and([
  filter.select('status').eq('paid'),
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
  | '$in'
  | '$notIn'
  | '$match'
  | '$notMatch'
  | '$anyOf'
  | '$noneOf'
  | '$isTruly'
  | '$isFalsy'
  | '$exists'
  | '$notExists'
  | '$neq'
  | '$childIn'
  | '$childNotIn';

export type FilterScalar = string | number | boolean | null;

export type FilterValue =
  FilterScalar | FilterVariable | readonly (FilterScalar | FilterVariable)[];

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
filter.select('status').eq('paid');
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
- `id` 的 operator group 是否允许 `$eq`。

`empty()`、`notEmpty()`、`isTrue()`、`isFalse()`、`exists()`、`notExists()` 这类不需要业务入参的方法，可以在 AST 中省略 `value`。如果后续要兼容 NocoBase 既有 object filter，序列化层可以按目标格式补出 `true` 之类的占位值。

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
  filter: (filter) => filter.id('createdBy.id').eq(filter.variable('$user.id')),
});
```

编译时应按以下规则处理变量：

- 从 `context` 解析变量值。
- `$user.id` 表示读取 `context.user.id`，不是读取 `context.$user.id`。
- 缺失变量默认抛错。
- 变量解析结果进入 SQL bindings。
- 不把变量拼接进 SQL 字符串。
- 不要求 TypeScript 代码作者直接写 `{{$user.id}}`。

## Object DSL 兼容

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

Repository V1 不建议把这种 object filter 形态作为主要代码 API，但可以把它作为兼容层或序列化目标之一。推荐方向是：

```text
Filter Builder -> Filter AST -> compiler -> QueryAdapter / existing NocoBase filter object
```

也就是说，Filter AST 是 Repository 内部更稳定、更可解释的中间表示；旧 object filter 可以由 adapter 生成或消费，但不应成为 Agent 写 TypeScript 代码的首选形态。

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
      filter.id('createdBy.id').eq(filter.variable('$user.id')),
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
  -> compile to QueryAdapter
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
