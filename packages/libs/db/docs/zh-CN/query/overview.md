# QueryAdapter 概览

`QueryAdapter` 是数据库层 Query Builder。它不是 Repository，也不是 ORM；它只负责用一套跨数据库的基础 API 查询和写入数据库表。

V1 按操作类型拆分入口，整体参考 Kysely：

```ts
interface QueryAdapter {
  selectFrom<TRecord extends Row = Row>(
    table: string,
  ): SelectQuery<TRecord, Row>;
  insertInto<TRecord extends Row = Row>(table: string): InsertQuery<TRecord>;
  updateTable<TRecord extends Row = Row>(table: string): UpdateQuery<TRecord>;
  deleteFrom<TRecord extends Row = Row>(table: string): DeleteQuery<TRecord>;
}
```

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

`db.query()` 不读取 Collection Metadata。它使用 Connection 的 `underscored` 配置转换 identifier，但不会理解 Collection 级 naming 覆盖，也不会自动应用 `tablePrefix`。

```ts
await builder.createCollection('orders', (collection) => {
  collection.naming({ tablePrefix: 'app_' });
  collection.string('orderNo');
});

await db
  .query()
  .selectFrom('appOrders')
  .where('orderNo', '=', 'SO-001')
  .execute();
```

上面的表和列会分别归一化为 `app_orders` 和 `order_no`。如果只写 `orders`，Query 不会从 Collection Metadata 得知 `app_` 前缀。

Repository 规划使用 Filter Builder 表达应用层条件。`db.repository()` 当前尚未实现，不要把 Repository 规划示例复制到运行时代码；详见 [Repository 概览](../repository/overview.md) 和 [Filter Builder](../repository/filter-builder.md)。

## 当前边界

- Repository 暂未实现。
- Model 暂未实现。
- Transformer 暂未实现。
- QueryAdapter 是数据库层查询接口，不是 Collection-aware 查询接口。
- V1 不提供 raw API；以后如有需要，应作为 unsafe escape hatch 单独设计。
- 复杂业务查询可以后续通过 Repository 或自定义 query 封装补充。

## Agent 注意事项

- 写查询代码时，优先使用 `selectFrom()`、`insertInto()`、`updateTable()`、`deleteFrom()`。
- 查询执行使用 `execute()`、`executeTakeFirst()`、`executeTakeFirstOrThrow()`。
- 简单条件使用三参 `where(lhs, op, rhs)`。
- 复杂条件使用 `where((eb) => ...)`。
- 不要生成二参 `where(field, value)`。
- 不要生成 `orWhere()`、`whereIn()`、`whereNull()` 等 Knex 风格快捷方法。
- 不要生成 raw SQL。
- 不要把 `QueryAdapter` 当 Repository 使用。
- 需要解析 Collection 级 `tablePrefix` 时，不要使用 `db.query()` 假装 Repository。
