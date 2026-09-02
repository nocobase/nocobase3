# Select AST

> **状态：规划中。** Select AST 当前尚未实现或导出，只用于 Repository 设计讨论，不要生成到运行时代码。

> 状态：规划设计，暂未实现。

Select AST 是 Repository 查询结果形状的结构化表示。它统一描述根 Collection 的标量
字段投影、关系加载、嵌套关系投影，以及关系节点自己的筛选和排序。

TypeScript、HTTP、CLI、file sync 和未来持久化配置应尽量使用同一结构：

```json
{
  "kind": "select",
  "version": 1,
  "collection": "orders",
  "root": {
    "kind": "selection",
    "fields": ["id", "orderNo", "amount"],
    "relations": [
      {
        "kind": "relation",
        "field": "customer",
        "select": {
          "kind": "selection",
          "fields": ["id", "name"]
        }
      },
      {
        "kind": "relation",
        "field": "items",
        "select": {
          "kind": "selection",
          "fields": ["id", "quantity"],
          "relations": [
            {
              "kind": "relation",
              "field": "product",
              "select": {
                "kind": "selection",
                "fields": ["id", "name"]
              }
            }
          ]
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
    ]
  }
}
```

## 设计目标

Select AST 要满足以下目标：

- 可序列化，TypeScript、HTTP、CLI 和持久化配置使用同一棵选择树。
- 可解释，标量字段和 relation 节点使用不同属性，不依赖 dot-string 猜测语义。
- 可校验，运行时根据 Collection metadata 校验字段、关系、目标 Collection 和基数。
- 可推导，TypeScript 可以根据选择树推导最终返回结构。
- 可组合，relation 节点可以递归包含 Select AST、Filter AST 和 Sort AST。
- 可执行，编译器可以生成批量关系加载计划，避免 N+1 查询和根记录重复。
- 权限安全，每一级字段、关系和目标记录都可以独立应用授权约束。
- 与数据库解耦，不暴露 tableName、columnName、join、raw SQL 或方言参数。

`select` 描述返回什么；它不负责决定根记录是否匹配，也不负责根记录的顺序。根查询的
筛选和排序仍分别使用 Filter AST 和 Sort AST。

## TypeScript 草案

```ts
export interface SelectAst {
  kind: 'select';
  version: 1;
  collection?: string;
  root: SelectNode;
}

export interface SelectNode {
  kind: 'selection';
  fields?: readonly string[];
  relations?: readonly SelectRelationNode[];
}

export interface SelectRelationNode {
  kind: 'relation';
  field: string;
  select: SelectNode;
  filter?: FilterAst;
  sort?: SortAst;
}
```

这里的 `FilterAst` 和 `SortAst` 都相对于 relation 的目标 Collection 解析，而不是根
Collection。详细设计分别见 [Filter AST](./filter-ast.md) 和 [Sort AST](./sort-ast.md)。

V1 不在 relation 节点中加入 `limit` 和 `offset`。对每个父记录分别分页需要窗口函数、
横向连接或等价的批量加载策略，不能把根查询的分页参数直接下推到整个目标 Collection。
这项能力应在跨数据库执行语义明确后再扩展。

## 根节点与规范形态

Select AST 的根节点始终是 `selection`：

```json
{
  "kind": "select",
  "version": 1,
  "collection": "orders",
  "root": {
    "kind": "selection",
    "fields": ["id", "orderNo"]
  }
}
```

AST 中不接受以下简写：

```json
["id", "orderNo"]
```

```json
{
  "id": true,
  "orderNo": true
}
```

```json
{
  "fields": ["id", "customer.name"]
}
```

统一的 `kind`、`version`、`root` 和节点形态可以让消费端只处理一种协议，也能让错误
路径精确指向 `root.relations[1].select.fields[0]`。

## 标量字段投影

当前 selection 节点的直接标量字段放在 `fields`：

```json
{
  "kind": "selection",
  "fields": ["id", "orderNo", "amount"]
}
```

字段使用当前 Collection 上的 Field 逻辑名。V1 不允许：

- relation Field 混入 `fields`；
- `customer.name` 之类的 relation path；
- tableName 或 columnName；
- `*` 通配符；
- raw expression、函数或别名；
- 重复字段。

默认语义：

| 输入                | 语义                                                      |
| ------------------- | --------------------------------------------------------- |
| `select` 整体省略   | 返回根 Collection 默认允许读取的标量字段，不自动加载关系  |
| `fields` 省略       | 返回当前节点默认允许读取的标量字段                        |
| `fields: []`        | 不返回当前节点的显式标量字段，可以只返回所选择的 relation |
| `relations` 省略/空 | 不加载 relation                                           |

“默认标量字段”不是数据库的 `SELECT *`。Repository 应先根据 Collection metadata 解析
可输出的直接标量字段，再与授权系统允许的输出字段求交集。relation、内部字段和不可读字段
不能因为 `fields` 省略而被自动返回。

当 `fields: []` 但选择了 relation 时，Repository 可以在内部读取主键、source key 或
foreign key 以完成关系组装；这些依赖字段若未被显式选择，必须在最终返回前移除。

## Relation 节点

关系使用显式 `relation` 节点：

```json
{
  "kind": "relation",
  "field": "customer",
  "select": {
    "kind": "selection",
    "fields": ["id", "name"]
  }
}
```

`field` 必须是父 selection 对应 Collection 上的直接 relation Field。嵌套关系通过递归
节点表达，不使用 dot-string：

```json
{
  "kind": "relation",
  "field": "items",
  "select": {
    "kind": "selection",
    "fields": ["id", "quantity"],
    "relations": [
      {
        "kind": "relation",
        "field": "product",
        "select": {
          "kind": "selection",
          "fields": ["id", "name"]
        }
      }
    ]
  }
}
```

relation 节点的 `select` 必填。即使希望返回目标 Collection 的默认标量字段，也要显式
写空的规范 selection：

```json
{
  "kind": "relation",
  "field": "customer",
  "select": {
    "kind": "selection"
  }
}
```

这样 AST 中每一级返回形状都有明确节点，也为 relation-local filter 和 sort 提供稳定的
目标 Collection 作用域。

同一个 selection 节点中，每个 relation Field 最多出现一次。以下形态应拒绝，而不是
静默合并：

```json
{
  "kind": "selection",
  "relations": [
    {
      "kind": "relation",
      "field": "items",
      "select": { "kind": "selection", "fields": ["id"] }
    },
    {
      "kind": "relation",
      "field": "items",
      "select": { "kind": "selection", "fields": ["quantity"] }
    }
  ]
}
```

要求调用方提交一棵无重复关系节点的规范树，可以避免两个节点的 filter、sort 和字段
投影如何合并产生歧义。旧 `appends` 路径的兼容 adapter 可以先合并路径，再生成规范 AST。

## Relation 返回形状

Relation Field 的 metadata 决定返回基数：

| relation 类型              | 返回形状              | 无匹配或无权访问时 |
| -------------------------- | --------------------- | ------------------ |
| `belongsTo`、`hasOne`      | 目标记录对象或 `null` | `null`             |
| `hasMany`、`belongsToMany` | 目标记录数组          | `[]`               |

已请求的 relation key 必须存在于结果中，不能因为没有关联记录而省略。没有在 Select AST 中
请求的 relation 则不应出现在结果中。

选择 to-many relation 不得改变根记录的基数。即使底层使用 join，Repository 也必须保证：

- 每条根记录只在根结果中出现一次；
- 根 `limit` 和 `offset` 作用于去重后的根记录；
- 根 `count()` 不受关系展开影响；
- relation 数组在父记录下独立组装。

## Relation Filter

Relation 节点可以使用目标 Collection 的 Filter AST 限制返回的关联记录：

```json
{
  "kind": "relation",
  "field": "items",
  "select": {
    "kind": "selection",
    "fields": ["id", "quantity"]
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
  }
}
```

这个 filter 只决定每条订单返回哪些 `items`，不决定订单本身是否进入根结果。需要筛选
“至少存在一条 quantity 大于 0 的 item 的订单”时，必须在根 Filter AST 使用 relation
quantifier。两种语义不能隐式互换。

授权系统对目标 Collection 追加的记录约束必须与 relation filter 使用 `and` 合并，不能
由调用方 filter 覆盖。

## Relation Sort

Relation 节点的 Sort AST 只排序该 relation 返回的记录：

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

这里的 `createdAt` 根据 `items` 的目标 Collection metadata 解析。它不会排序根 orders。
要按 `customer.name` 或 `items` 的聚合值排序根 orders，应在根查询使用 Sort AST 的
`relationField` 或 `relationAggregate` target，详见 [Sort AST](./sort-ast.md)。

to-one relation 节点可以带 sort，但它没有可观察的数组排序效果，V1 应拒绝这种无意义
输入。relation-local sort 只适用于 to-many relation。

## 完整示例

查询已付款订单，选择客户和数量大于 0 的订单项，并按订单项创建时间倒序排列：

```json
{
  "select": {
    "kind": "select",
    "version": 1,
    "collection": "orders",
    "root": {
      "kind": "selection",
      "fields": ["id", "orderNo", "amount"],
      "relations": [
        {
          "kind": "relation",
          "field": "customer",
          "select": {
            "kind": "selection",
            "fields": ["id", "name"]
          }
        },
        {
          "kind": "relation",
          "field": "items",
          "select": {
            "kind": "selection",
            "fields": ["id", "quantity", "createdAt"],
            "relations": [
              {
                "kind": "relation",
                "field": "product",
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
      ]
    }
  },
  "filter": {
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
}
```

外层的 `select` 和 `filter` 是 Repository operation options，不是另一个 AST 包装层。

## 权限与安全

Select AST 编译时必须逐级应用权限：

1. 校验调用方可以读取当前 Collection。
2. `fields` 显式请求无权读取的字段时拒绝查询；`fields` 省略时，默认字段集合与允许输出
   字段求交集。
3. 校验 relation Field 本身允许输出。
4. 进入目标 Collection 后重新应用目标记录和字段权限。
5. 将 relation-local filter 与授权 filter 使用 `and` 合并。
6. relation-local sort 引用的字段也必须具有相应读取和排序权限。
7. 内部加载的主键、foreign key 和 source key 不得泄漏到最终输出。

权限过滤后的 to-one 结果视为未关联并返回 `null`；to-many 中不可见的目标记录从数组中
移除。不能先无约束加载全部关系，再把权限处理交给调用方。

显式请求无权访问的 relation 也应拒绝查询，不能静默省略 relation key。这样调用方能够
区分“没有关联记录”和“无权请求这个关系”，同时保留目标记录权限过滤后的 `null` / `[]`
语义。

选择树还应受资源预算限制，例如最大深度、relation 节点总数和预计加载记录数。超过
预算应给出可解释错误，不能因为 AST 合法就允许无限递归或指数级加载。

## 加载与编译

Select AST 不规定必须使用 join。Repository 可以根据 relation 类型、分页、权限和方言
能力选择：

- to-one join；
- 批量 `IN` 查询；
- 关联表批量查询；
- DataLoader 风格分组；
- 方言等价的 eager-loading 计划。

无论使用哪种策略，都必须保持同一外部语义：

- 不产生 N+1 查询；
- 不改变根记录基数和分页；
- relation-local filter 和 sort 只作用于目标节点；
- 共享 relation 前缀只加载一次；
- 返回字段严格等于授权后的选择结果；
- 相同输入在支持的数据库上产生一致结果形状。

## `fields` / `appends` 兼容

NocoBase 既有边界可能继续接收：

```json
{
  "fields": ["id", "orderNo"],
  "appends": ["customer", "items.product.name"]
}
```

这类输入应由兼容 adapter 转换为 Select AST，再进入 metadata 校验和查询编译：

```text
legacy fields / appends
  -> normalize paths
  -> merge shared relation prefixes
  -> build Select AST
  -> validate metadata and permissions
  -> compile loading plan
```

`appends` 不是 Repository V1 的主代码 API。尤其不要继续扩展
`relation(option=value)` 之类的字符串内嵌参数；关系 filter、sort 和 select 都应使用
结构化节点。

## 校验流程

Repository 编译 Select AST 时建议按以下顺序校验：

```text
Select AST
  -> validate kind and version
  -> resolve root collection
  -> validate direct scalar fields
  -> authorize selected fields
  -> resolve each relation field and target collection
  -> authorize relation field
  -> recursively validate target selection
  -> validate relation-local Filter AST
  -> validate relation-local Sort AST
  -> detect duplicate nodes, cycles and budget overflow
  -> add hidden dependency fields to execution plan
  -> compile batched relation loading plan
  -> strip hidden fields and assemble result shape
```

任何一步失败都应给出 AST 路径、Collection 和 Field 逻辑名，不应降级成 raw SQL 或静默
忽略未知字段。

## V1 边界

Select AST V1 建议支持：

- 根和嵌套节点的直接标量字段投影；
- to-one 与 to-many relation selection；
- relation-local Filter AST；
- to-many relation-local Sort AST；
- `fields` / `appends` 到 Select AST 的边界兼容转换；
- metadata、权限、深度和节点数量校验；
- 不改变根基数的批量关系加载。

V1 暂不支持：

- relation-local `limit`、`offset` 或 cursor；
- 字段别名、表达式、聚合字段和 raw selection；
- wildcard、排除列表或同时存在 include/exclude 的双重语义；
- polymorphic relation 的不明确目标选择；
- 通过 Select AST 写入、连接或断开 relation；
- 旧式 appends 字符串中的内嵌 option 语法。

## Agent 注意事项

- 本页是规划文档，不代表当前代码已经可用。
- AST 使用完整 key：`kind`、`version`、`collection`、`root`、`fields`、`relations`、
  `field`、`select`、`filter`、`sort`。
- 标量字段放 `fields`，relation 放 `relations`；不要把 relation path 混入 `fields`。
- 每个 relation 使用独立节点，嵌套关系递归写 `select.relations`，不使用 dot-string。
- 同一 selection 节点中不要重复声明同一个 relation Field。
- relation-local filter 和 sort 相对于目标 Collection 解析。
- relation-local filter 只过滤返回的关联记录，不过滤父记录。
- 省略 `select` 不加载任何 relation。
- 不在 AST 中放 raw SQL、tableName、columnName、join 类型或方言 option。
