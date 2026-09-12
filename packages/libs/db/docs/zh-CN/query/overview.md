---
title: QueryAdapter：数据库层查询
description: 使用 db.query() 或 connection.query 执行 select、insert、update 和 delete；Query 不读取 Collection Metadata，也不是 Repository。
---

# QueryAdapter：数据库层查询

`QueryAdapter` 是数据库层 Query Builder。它不是 Repository，也不是 ORM；它只负责用一套跨数据库的基础 API 查询和写入数据库表。

## 使用边界

| 项目                       | 内容                                 |
| -------------------------- | ------------------------------------ |
| Manager 入口               | `db.query(name?)`                    |
| Connection 入口            | `connection.query`（属性）           |
| 名称语义                   | Connection 级查询标识符              |
| Metadata-aware             | 否                                   |
| Collection naming override | 不读取                               |
| 主要副作用                 | DML                                  |
| External Connection        | 可执行记录读写，受数据库账号权限控制 |
| 不负责                     | Repository、relation-aware CRUD      |

当前 API 按操作类型提供 `selectFrom()`、`insertInto()`、`updateTable()` 和 `deleteFrom()` 四个入口，整体参考 Kysely。具体组合方式见 [QueryAdapter 用法参考](../reference/query-api.md)，精确类型以 TypeScript 声明为准。

查询执行方法也对齐 Kysely 的语义：

```ts
await query.execute();
await query.executeTakeFirst();
await query.executeTakeFirstOrThrow();
```

便捷终止方法：

```ts
await query.value('status');
await query.pluck('orderNo');
await query.exists();
```

## 基础示例

```ts
await db
  .query()
  .insertInto('orders')
  .values({
    orderNo: 'SO-001',
    amount: 99.5,
    status: 'paid',
  })
  .execute();

const rows = await db
  .query()
  .selectFrom('orders')
  .select(['id', 'orderNo', 'createdAt'])
  .where('status', '=', 'paid')
  .orderBy('createdAt', 'desc')
  .limit(20)
  .execute();
```

`execute()` 返回所有匹配行，`executeTakeFirst()` 返回第一行或 `undefined`，`executeTakeFirstOrThrow()` 在没有结果时抛错。

## 文档地图

- [select 查询](./select.md)
- [where 条件](./where.md)
- [join](./joins.md)
- [聚合和 having](./aggregates.md)
- [insert / update / delete](./mutations.md)
- [命名归一化](./naming.md)
- [compile 和 clear](./compile.md)
- [Query API 参考](../reference/query-api.md)

## 层级边界

`db.query()` 不读取 Collection Metadata。它使用 Connection 的 `underscored` 和 `tablePrefix` 转换 identifier，但不会理解 Collection 级 naming 覆盖。

完整边界见 [`tablePrefix` 表前缀](../concepts/naming/table-prefix.md)。

```ts
await builder.createCollection('orders', (collection) => {
  collection.naming({ tablePrefix: 'app_' });
  collection.string('orderNo');
});

await db.query().selectFrom('orders').where('orderNo', '=', 'SO-001').execute();
```

如果 Connection 的 `tablePrefix` 是 `app_`，上面的表和列会分别归一化为 `app_orders` 和 `order_no`。示例中的 Collection 局部前缀恰好与 Connection 一致；如果它们不同，Query 仍只使用 Connection 配置，无法从 Collection Metadata 得知局部覆盖。

需要识别 Collection 级命名、关系和 Filter 时，使用 `db.repository('orders')`；需要数据库层 join 和子查询组合时继续使用 Query。当前用法见 [Repository 概览](../repository/overview.md)。

## 当前边界

- Query 本身不提供 Collection-aware Filter；该能力由 Repository 提供。
- QueryAdapter 是数据库层查询接口，不是 Collection-aware 查询接口。
- QueryAdapter 不提供 raw SQL API。确实需要数据库专用能力时，可以通过 `await connection.client()` 获取底层 client；该逃生口不保证跨数据库可移植，也不会应用高层 Schema guard。
- 复杂业务查询应在业务模块中封装，并明确其方言和命名假设。

## 常见误用

- 写查询代码时，优先使用 `selectFrom()`、`insertInto()`、`updateTable()`、`deleteFrom()`。
- 查询执行使用 `execute()`、`executeTakeFirst()`、`executeTakeFirstOrThrow()`。
- 简单条件使用三参 `where(lhs, op, rhs)`。
- 复杂条件使用 `where((eb) => ...)`。
- 不要生成二参 `where(field, value)`。
- 不要生成 `orWhere()`、`whereIn()`、`whereNull()` 等 Knex 风格快捷方法。
- 优先使用 QueryAdapter，不要在可移植查询中生成 raw SQL；只有明确需要数据库专用能力时才使用 `connection.client()`。
- 不要把 `QueryAdapter` 当 Repository 使用。
- Query 表来源参数使用 Connection 相对标识符，不写 Connection 前缀。
- 需要解析 Collection 级 `tablePrefix` 时，不要使用 `db.query()` 假装 Repository。

## Exact BIGINT results

With the default drivers, physical BIGINT columns return exact strings,
including small values, from Query reads. Null remains null. Decoding happens
before conversion to a JavaScript number and uses physical result metadata,
including aliases and joined columns; Query does not read Collection metadata.

SQLite recognizes declared BIGINT/INT8 columns. Auto-increment keys physically
stored as INTEGER cannot be distinguished as logical bigInt by Query; use
Repository when Collection metadata must determine the result type. Expressions without a declared
column type return safe integers as numbers and larger int64 values as strings.
Oracle fetches NUMBER(p,0) with p >= 16 as strings, including its INTEGER alias
(NUMBER(38,0)); lower-precision integer columns retain number results. MySQL
uses big-number strings. PostgreSQL and SQL Server already return BIGINT strings.

This does not guarantee exact SQL arithmetic, numbers embedded
in JSON, or custom driver parsers. Keep exact input values as strings: turning a
rounded JS number into text cannot recover its original value.

Query 与 Repository 的聚合结果类型已统一，详见 [聚合规则](./aggregates.md#统一返回类型)。

### DECIMAL 读取

DECIMAL 普通字段、别名、标量子查询及 MIN/MAX 返回字符串或 null，保留数据库输出格式，
不统一去掉末尾零或补齐小数位。例如 PG/MySQL 的 `DECIMAL(..., 2)` 可以返回 `'42.00'`，
其他数据库可能返回数值相同的 `'42'`。跨库统一类型和数值，不要求字符串逐字相同。
PG/MySQL 直接使用原生驱动结果，不为 DECIMAL 读取查询 Collection 或增加文本投影；
其他数据库按需在驱动转换成 JS number 前保护精度。WHERE 和 ORDER BY 保留数值语义。
SQLite 的 REAL 存储近似值不因此变为任意精度十进制。
