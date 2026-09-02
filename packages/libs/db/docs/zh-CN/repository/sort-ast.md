# Sort AST

> **状态：规划中。** Sort AST 当前尚未实现或导出，只用于 Repository 设计讨论，不要生成到运行时代码。

> 状态：规划设计，暂未实现。

Sort AST 是 Repository 排序意图的结构化表示。它用于 TypeScript、HTTP、CLI、file sync
和未来持久化配置，明确区分：

- 当前 Collection 的直接字段排序；
- 通过纯 to-one relation path 的字段排序；
- 通过 to-many relation 聚合值的排序。

基本示例：

```json
{
  "kind": "sort",
  "version": 1,
  "collection": "orders",
  "items": [
    {
      "by": {
        "kind": "field",
        "field": "createdAt"
      },
      "direction": "desc",
      "nulls": "last"
    },
    {
      "by": {
        "kind": "field",
        "field": "id"
      },
      "direction": "asc",
      "nulls": "last"
    }
  ]
}
```

数组顺序就是排序优先级。上例先按 `createdAt` 倒序，再用 `id` 升序消除并列记录的
不确定性。

## 设计目标

Sort AST 要满足以下目标：

- 可序列化，不依赖 `-createdAt`、`createdAt DESC` 或 tuple 简写。
- 可解释，每个排序项明确说明排序目标、方向和空值位置。
- 可校验，运行时根据 Collection metadata 检查字段类型和 relation 基数。
- 无歧义，to-one relation field 和 to-many aggregate 使用不同节点。
- 跨数据库，明确 NULL、空关系、空集合和稳定分页语义。
- 可组合，同一个 Sort AST 可以放在根查询或 Select AST 的 relation 节点中。
- 权限安全，排序字段和关系路径不能绕过字段与记录权限。
- 与数据库解耦，不暴露 raw SQL、collation、tableName 或 columnName。

Sort AST 本身已经是可序列化协议，不需要再设计链式 Sort Builder。

## TypeScript 草案

```ts
export interface SortAst {
  kind: 'sort';
  version: 1;
  collection?: string;
  items: readonly SortItemNode[];
}

export interface SortItemNode {
  by: SortTargetNode;
  direction: SortDirection;
  nulls?: SortNullsPosition;
}

export type SortTargetNode =
  | SortFieldTarget
  | SortRelationFieldTarget
  | SortRelationCountTarget
  | SortRelationValueAggregateTarget;

export interface SortFieldTarget {
  kind: 'field';
  field: string;
}

export interface SortRelationFieldTarget {
  kind: 'relationField';
  relation: readonly string[];
  field: string;
}

export interface SortRelationCountTarget {
  kind: 'relationAggregate';
  relation: readonly string[];
  aggregate: 'count';
  field?: never;
}

export interface SortRelationValueAggregateTarget {
  kind: 'relationAggregate';
  relation: readonly string[];
  aggregate: 'sum' | 'avg' | 'min' | 'max';
  field: string;
}

export type SortDirection = 'asc' | 'desc';
export type SortNullsPosition = 'first' | 'last';
```

`collection` 可用于独立持久化和跨边界校验。放入 Repository operation 或 relation
selection 时可以省略，由当前查询节点提供 Collection 上下文；如果同时提供，则必须与
当前节点一致。

## 为什么不用字符串简写

V1 不接受：

```json
["-createdAt", "id"]
```

```json
["createdAt DESC", "id ASC"]
```

```json
{
  "createdAt": "desc",
  "id": "asc"
}
```

```json
[
  ["createdAt", "desc"],
  ["id", "asc"]
]
```

这些形态分别存在内部字符串语法、对象顺序、位置参数和错误定位问题，也无法自然扩展
`nulls`、relation field 和 aggregate。结构化数组稍长，但 JSON Schema、Agent 和运行时
都只需要处理一种明确形式。

## 直接字段排序

当前 Collection 的直接字段使用 `field` target：

```json
{
  "by": {
    "kind": "field",
    "field": "createdAt"
  },
  "direction": "desc",
  "nulls": "last"
}
```

`field` 使用 Field 逻辑名。V1 可以允许有确定数据库表示和排序语义的直接标量字段，
例如 string、number、boolean、date、datetime、time、UUID 和 select。应拒绝：

- relation Field；
- object / JSON 整体；
- 未声明可排序的 virtual field；
- 不存在或无权排序的字段；
- raw expression；
- tableName 或 columnName。

是否允许 large text 或特定计算字段应由 Field metadata 的 sortable capability 明确声明，
不能按数据库方言悄悄放宽。

## Relation 节点内部排序

当 Sort AST 放在 Select AST 的 to-many relation 节点中，它排序该 relation 返回的数组：

```json
{
  "kind": "relation",
  "field": "items",
  "select": {
    "kind": "selection",
    "fields": ["id", "createdAt"]
  },
  "sort": {
    "kind": "sort",
    "version": 1,
    "items": [
      {
        "by": {
          "kind": "field",
          "field": "createdAt"
        },
        "direction": "desc",
        "nulls": "last"
      }
    ]
  }
}
```

这里的当前 Collection 是 `items` 的目标 Collection。这个 sort：

- 只改变每个父记录下 `items` 数组的顺序；
- 不改变根记录顺序、数量、分页和 count；
- 应自动使用目标 Collection 的唯一键作为稳定 tie-breaker；
- 只对 to-many relation 有可观察意义，to-one relation 节点应拒绝 local sort。

## 按 to-one Relation Field 排序父记录

要按 `customer.name` 排序 orders，使用 `relationField`：

```json
{
  "by": {
    "kind": "relationField",
    "relation": ["customer"],
    "field": "name"
  },
  "direction": "asc",
  "nulls": "last"
}
```

嵌套 to-one 路径继续使用 relation 数组：

```json
{
  "by": {
    "kind": "relationField",
    "relation": ["customer", "region"],
    "field": "name"
  },
  "direction": "asc",
  "nulls": "last"
}
```

路径上的每一级都必须是 to-one relation，例如 `belongsTo` 或 `hasOne`。终点 `field`
必须是目标 Collection 上可排序的直接标量字段。

不允许普通 `field` target 使用 `customer.name`，也不允许 `relationField` 穿过 to-many：

```json
{
  "by": {
    "kind": "relationField",
    "relation": ["items"],
    "field": "price"
  },
  "direction": "desc"
}
```

一个订单可能有多个 item price，无法判断应使用最小值、最大值、总和还是平均值。此类
需求必须显式使用 `relationAggregate`。

用于排序的 relation 不要求同时出现在 Select AST 中。`select` 决定返回什么，`sort`
决定返回顺序；Repository 可以创建内部 join 或子查询，但不能把未选择的 relation 泄漏
到结果中。

## 按 to-many Relation Aggregate 排序父记录

to-many relation 必须明确聚合语义。

按 items 数量排序：

```json
{
  "by": {
    "kind": "relationAggregate",
    "relation": ["items"],
    "aggregate": "count"
  },
  "direction": "desc"
}
```

按 items 总金额排序：

```json
{
  "by": {
    "kind": "relationAggregate",
    "relation": ["items"],
    "aggregate": "sum",
    "field": "amount"
  },
  "direction": "desc",
  "nulls": "last"
}
```

按最新评论时间排序：

```json
{
  "by": {
    "kind": "relationAggregate",
    "relation": ["comments"],
    "aggregate": "max",
    "field": "createdAt"
  },
  "direction": "desc",
  "nulls": "last"
}
```

V1 对 relation aggregate path 建议限制为：零个或多个 to-one relation，后接一个终点
to-many relation。路径中出现多个 to-many 会产生连接乘积和重复计数，应拒绝，直到有
显式的分段聚合设计。

Aggregate 与字段规则：

| aggregate | `field`  | 允许的终点字段                      |
| --------- | -------- | ----------------------------------- |
| `count`   | 必须省略 | 不适用                              |
| `sum`     | 必须提供 | number、integer、decimal 等数值字段 |
| `avg`     | 必须提供 | number、integer、decimal 等数值字段 |
| `min`     | 必须提供 | metadata 声明可比较的标量字段       |
| `max`     | 必须提供 | metadata 声明可比较的标量字段       |

Repository 不能在发现 to-many 后自动猜测 aggregate。

## 空关系和 NULL

Sort AST 必须定义跨数据库一致的空值行为。

`nulls` 仅接受：

```ts
'first' | 'last';
```

省略时默认 `last`，不使用数据库方言默认值。底层不原生支持 `NULLS FIRST/LAST` 时，
QueryAdapter 或编译器应使用等价的可绑定表达式实现。

关系排序值规则：

| 场景                                 | 排序值 |
| ------------------------------------ | ------ |
| to-one relation 不存在或不可见       | `null` |
| to-many `count` 空集合               | `0`    |
| to-many `sum` 空集合                 | `0`    |
| to-many `avg` / `min` / `max` 空集合 | `null` |

这些是 Repository 语义，不应随 PostgreSQL、MySQL 或 SQLite 改变。

## 稳定排序

只按非唯一字段排序会让 offset 分页出现重复或遗漏：

```json
{
  "kind": "sort",
  "version": 1,
  "items": [
    {
      "by": {
        "kind": "field",
        "field": "createdAt"
      },
      "direction": "desc"
    }
  ]
}
```

Repository 应根据 metadata 生成稳定的执行排序：

```text
createdAt DESC NULLS LAST, id ASC
```

建议规则：

1. 保留调用方声明的排序优先级。
2. 如果已声明字段不能唯一确定当前 Collection 的记录，追加缺失的主键字段。
3. 复合主键按 metadata 顺序追加。
4. 已覆盖某个唯一约束时不再追加主键。
5. relation-local sort 追加目标 Collection 的唯一键。
6. 根 relationField 或 relationAggregate sort 仍追加根 Collection 的唯一键。
7. View 没有可识别唯一键且使用分页时，应要求显式提供可证明稳定的排序或报错。

自动 tie-breaker 是执行计划的一部分，不修改调用方提交或持久化的 Sort AST，也不把隐藏
字段加入最终输出。

当 `sort` 省略或 `items: []` 时，Repository 默认按当前 Collection 主键升序稳定排序。
如果业务确实需要无序的底层查询，应使用 `db.query()`，而不是让 Repository 返回方言
相关的任意顺序。

## 重复排序项

同一个 Sort AST 中不能重复声明等价 target：

```json
{
  "kind": "sort",
  "version": 1,
  "items": [
    {
      "by": { "kind": "field", "field": "createdAt" },
      "direction": "asc"
    },
    {
      "by": { "kind": "field", "field": "createdAt" },
      "direction": "desc"
    }
  ]
}
```

这类输入应报错，不使用“最后一个覆盖前一个”或自动去重。relation path 和 aggregate
参数都参与 target 等价性判断。

## 权限与侧信道

排序可以泄露未返回字段的信息，因此 `select` 未包含某字段不代表它可以绕过权限参与
排序。V1 建议：

- 直接排序字段必须具有读取和排序权限；
- relation path 上每个 relation Field 必须允许访问；
- relation 终点字段必须具有读取和排序权限；
- relationAggregate 只聚合授权后可见的目标记录；
- 授权 filter 必须进入 join、子查询或预聚合范围；
- 不可见的 to-one 目标按 `null` 排序；
- 不允许通过 raw expression、隐藏 columnName 或聚合未授权字段绕过约束。

未来如果需要“允许排序但不允许返回”的字段，应设计显式 `sort` capability，不能默认
把所有底层字段开放给排序。

## 编译策略

不同 target 可以使用不同执行计划：

| target kind         | 常见编译策略                       |
| ------------------- | ---------------------------------- |
| `field`             | 当前表列排序                       |
| `relationField`     | to-one join 或等价相关子查询       |
| `relationAggregate` | 相关聚合子查询、预聚合派生表或 CTE |

to-many aggregate 不应直接展开 join 后对根结果分页，否则会造成根记录重复、limit 错误和
count 错误。无论底层采用哪种策略，都必须保证排序和分页作用在“一条根记录一行”的逻辑
结果集上。

Sort AST 不允许调用方指定 join 类型或强制某种 SQL 计划。查询计划由 Repository 根据
metadata、权限、方言 capability 和成本选择。

## 完整示例

按客户名称升序、items 总金额降序排列订单，最后由 Repository 自动追加根主键：

```json
{
  "kind": "sort",
  "version": 1,
  "collection": "orders",
  "items": [
    {
      "by": {
        "kind": "relationField",
        "relation": ["customer"],
        "field": "name"
      },
      "direction": "asc",
      "nulls": "last"
    },
    {
      "by": {
        "kind": "relationAggregate",
        "relation": ["items"],
        "aggregate": "sum",
        "field": "amount"
      },
      "direction": "desc",
      "nulls": "last"
    }
  ]
}
```

逻辑执行顺序：

```text
customer.name ASC NULLS LAST
  -> authorized SUM(items.amount) DESC NULLS LAST
  -> orders.id ASC
```

`customer` 和 `items` 不需要出现在 Select AST 中，除非调用方也希望返回它们。

## 校验流程

Repository 编译 Sort AST 时建议按以下顺序校验：

```text
Sort AST
  -> validate kind and version
  -> resolve current collection
  -> preserve item priority order
  -> resolve target kind
  -> validate direct field or relation path
  -> validate relation cardinality
  -> validate aggregate and terminal field compatibility
  -> authorize path, field and aggregate scope
  -> normalize nulls default
  -> reject duplicate targets
  -> derive stable unique tie-breaker
  -> choose dialect-capable execution plan
  -> compile to QueryAdapter
```

错误必须包含 Sort AST item 下标、Collection、Field 或 relation path。例如：

```text
sort.items[0].by.relation traverses to-many field "items"; use
kind "relationAggregate" and choose an explicit aggregate.
```

## V1 边界

Sort AST V1 建议支持：

- 当前 Collection 直接标量字段排序；
- Select AST 中 to-many relation 返回数组的局部排序；
- 纯 to-one relation path 的终点字段排序父记录；
- 单个终点 to-many relation 的 `count`、`sum`、`avg`、`min`、`max` 聚合排序；
- `asc` / `desc`；
- `nulls: first` / `last`，默认 `last`；
- metadata 校验、权限校验和自动稳定 tie-breaker。

V1 暂不支持：

- raw expression、SQL fragment、函数或方言 collation；
- locale、自然排序、大小写或重音模式；
- 包含多个 to-many segment 的 relation aggregate path；
- aggregate-local Filter AST；
- window function、排名和随机排序；
- 字符串、tuple、object map 或链式 Builder 简写。

## Agent 注意事项

- 本页是规划文档，不代表当前代码已经可用。
- `items` 永远是数组，数组顺序就是排序优先级。
- 每个 item 使用完整的 `by`、`direction` 和可选 `nulls`。
- 当前 Collection 直接字段使用 `kind: "field"`。
- 纯 to-one 路径使用 `kind: "relationField"`，relation path 使用字符串数组。
- to-many 排序父记录必须使用 `kind: "relationAggregate"` 并显式选择 aggregate。
- 排序 relation 返回数组时，把 Sort AST 放在该 Select relation 节点中。
- 用于排序的 relation 不要求同时出现在 Select AST 中。
- 不使用 `-createdAt`、`createdAt DESC`、tuple 或 object map 简写。
- 不在 AST 中放 raw SQL、tableName、columnName、join 类型或方言 option。
