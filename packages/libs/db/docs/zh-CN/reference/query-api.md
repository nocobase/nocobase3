---
title: QueryAdapter 用法参考
description: 根据读取、写入、条件、关联、聚合和结果形状选择 QueryAdapter API；精确签名以 TypeScript 类型声明为准。
---

# QueryAdapter 用法参考

本页解释 Query API 的选择和组合方式，不复制接口定义。精确泛型、重载、参数和返回类型以 `@nocobase/db` 导出的 TypeScript 类型声明为准。

## 选择查询入口

| 目标     | 入口            | 继续阅读                          |
| -------- | --------------- | --------------------------------- |
| 读取记录 | `selectFrom()`  | [select 查询](../query/select.md) |
| 新增记录 | `insertInto()`  | [数据写入](../query/mutations.md) |
| 更新记录 | `updateTable()` | [数据写入](../query/mutations.md) |
| 删除记录 | `deleteFrom()`  | [数据写入](../query/mutations.md) |

这四个入口返回不可变 Query Builder。链式方法返回新的查询对象，不修改之前保存的对象。

## 组合读取查询

| 需求           | 使用                                                         |
| -------------- | ------------------------------------------------------------ |
| 选择字段       | `select()` / `selectAll()`                                   |
| 去重           | `distinct()`                                                 |
| 添加条件       | `where()` / `whereRef()`                                     |
| 关联表         | `innerJoin()` / `leftJoin()` / `rightJoin()` / `crossJoin()` |
| 分组与聚合条件 | `groupBy()` / `having()` / `havingRef()`                     |
| 排序和分页     | `orderBy()` / `limit()` / `offset()`                         |

简单条件使用三参数 `where(lhs, operator, rhs)`：

```ts
const order = await db
  .query()
  .selectFrom('orders')
  .select(['id', 'orderNo'])
  .where('status', '=', 'paid')
  .executeTakeFirst();
```

组合 `and`、`or`、`not`、`between`、`exists` 或子查询时，使用 Expression Builder。不要生成二参数 `where(field, value)` 或 Knex 风格的 `orWhere()`、`whereIn()`、`whereNull()`。

完整条件用法见[where 条件](../query/where.md)，关联和聚合分别见 [join](../query/joins.md)与[聚合和 having](../query/aggregates.md)。

## 选择结果形状

| 需要的结果           | 终止方法                    |
| -------------------- | --------------------------- |
| 所有匹配行           | `execute()`                 |
| 第一行或 `undefined` | `executeTakeFirst()`        |
| 必须存在的第一行     | `executeTakeFirstOrThrow()` |
| 第一行的一个列值     | `value(column)`             |
| 所有行的一个列值数组 | `pluck(column)`             |
| 是否存在匹配行       | `exists()`                  |

选择终止方法时表达调用方真正需要的结果。不要先获取全部记录再手工截取第一行或映射单列。

## 引用列与传入值

普通字符串右值会作为参数绑定；需要引用另一列时使用 `whereRef()` 或 `eb.ref()`：

```ts
const rows = await db
  .query()
  .selectFrom('orders')
  .selectAll()
  .whereRef('updatedAt', '>', 'createdAt')
  .execute();
```

需要 OR join 条件时，在 join callback 中通过 Expression Builder 组合条件。Query API 不提供 `orOn()` 或 `orOnRef()`。

## 安全执行写操作

`updateTable()` 和 `deleteFrom()` 默认要求条件。确实需要影响全部记录时，显式调用 `allowAllRows()`，让意图在代码审查中可见。

```ts
await db
  .query()
  .updateTable('orders')
  .set({ archived: true })
  .where('status', '=', 'cancelled')
  .execute();
```

多个写操作必须共同成功或失败时，使用同一个事务回调参数中的 `connection.query`。完整写入规则见[数据写入](../query/mutations.md)和[事务](../database/transactions.md)。

## 检查和复用查询

- `compile()` 用于检查即将执行的 SQL 和绑定参数，不执行查询。
- `clearSelect()`、`clearWhere()`、`clearJoins()`、`clearGroupBy()`、`clearHaving()`、`clearOrderBy()`、`clearLimit()` 和 `clearOffset()` 按查询类型提供。
- `clear*()` 返回新的 Query Builder，适合从一个基础查询派生不同变体。

具体支持哪些 `clear*()` 方法，以当前 Query 类型声明为准。示例见[Query 编译与清除条件](../query/compile.md)。

## 能力边界

- Query 使用 Connection 级查询标识符，不读取 Collection Metadata 或 Collection 级 naming override。
- Query 不是 Collection-aware Repository，不自动解析 relation。
- Query 不提供 raw SQL API。必须使用方言特有能力时，通过 `connection.client()` 进入底层 adapter，并明确可移植性边界。
- 支持的比较操作符、表达式输入和泛型结果推导，以 `ComparisonOperator`、`ExpressionBuilder` 和各 Query 类型声明为准。

从整体能力开始阅读 [QueryAdapter 概览](../query/overview.md)。
