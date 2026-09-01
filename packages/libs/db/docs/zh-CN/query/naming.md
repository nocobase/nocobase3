---
title: Query 命名归一化
description: 说明 QueryAdapter 的 underscored 转换、结果 key 与 Collection naming 边界。
---

# Query 命名归一化

`db.query()` 是数据库查询层，不是 Repository，也不读取 Collection Metadata。默认的 Connection naming 会把 camelCase table 和 column identifier 转为小写下划线：

Connection、Collection Builder 与 Query 的完整行为对照见 [underscored 命名规则](../concepts/underscored.md)。

```ts
await db
  .query()
  .selectFrom('orderItems')
  .where('orderNumber', '=', 'SO-001')
  .execute();
```

等价于查询 `order_items.order_number`。如果 Connection 配置 `underscored: false`，则 identifier 保持 `orderItems.orderNumber`。

## 结果 key

`select()` 按调用方传入的字段 key 返回结果：

```ts
const row = await db
  .query()
  .selectFrom('orderItems')
  .select('createdAt')
  .executeTakeFirst();
```

SQL 查询 `created_at`，结果 key 是 `createdAt`。如果写 `select('created_at')`，结果 key 就是 `created_at`。

显式 alias 也遵循这个规则：

```ts
await db
  .query()
  .selectFrom('orders as o')
  .select(['o.orderNo as order_no', 'o.createdAt as created_at'])
  .execute();
```

结果 key 是 `order_no`、`created_at`。

## selectAll

`selectAll()` 会把未显式命名的下划线字段映射回驼峰：

```ts
const rows = await db.query().selectFrom('orderItems').selectAll().execute();
```

数据库返回的 `created_at` 会成为结果 key `createdAt`。

## tablePrefix

`db.query()` 使用 Connection 的 `underscored` 配置，但不读取 Collection Metadata，也不会自动应用 `tablePrefix`。如果物理表是 `tbl_order_items`，应写：

```ts
db.query().selectFrom('tblOrderItems');
db.query().selectFrom('tbl_order_items');
```

不能只写 `orderItems`，否则会查询 `order_items`。

Collection 可以单独覆盖 `tablePrefix`，所以底层 Query 无法仅凭逻辑 Collection 名推导所有物理表名。需要 Collection-aware 查询时，应由 Repository 或 Collection Registry 提供解析后的表名。

## Agent 注意事项

- camelCase identifier 默认转换为 snake_case；Connection 可以配置 `underscored: false`。
- Query 不读取 Collection 级 `underscored` 覆盖。
- Query 不会自动添加 Connection 或 Collection 的表前缀。
- 查询有前缀的表时，显式写出完整物理表 identifier。
- 不要生成 `tableName`、`columnName` 映射来影响 Query。

更完整的规则见 [命名概念](../concepts/naming.md)。
