# Query 命名归一化

`db.query()` 是数据库查询层，不是 Repository，也不读取 Collection metadata。

在 `underscored: true` 时，它允许用 camelCase 写数据库表名和列名，并把它们归一化为小写下划线：

```ts
await db.query()
  .selectFrom('tblOrderItems')
  .where('orderNumber', '=', 'SO-001')
  .execute();
```

等价于：

```ts
await db.query()
  .selectFrom('tbl_order_items')
  .where('order_number', '=', 'SO-001')
  .execute();
```

## 结果 key

`select()` 会按调用方传入的字段 key 返回结果：

```ts
const row = await db.query()
  .selectFrom('tblOrderItems')
  .select('createdAt')
  .executeTakeFirst();
```

SQL 中会查询 `created_at`，结果集 key 是 `createdAt`。

如果写 `select('created_at')`，结果集 key 就是 `created_at`。

显式 alias 也遵循这个规则：

```ts
await db.query()
  .selectFrom('orders as o')
  .select([
    'o.orderNo as order_no',
    'o.createdAt as created_at',
  ])
  .execute();
```

结果 key 是 `order_no`、`created_at`，不会自动变成 `orderNo`、`createdAt`。

## selectAll

`selectAll()` 会把未显式命名的下划线字段映射回驼峰：

```ts
const rows = await db.query()
  .selectFrom('order_items')
  .selectAll()
  .execute();
```

如果数据库返回 `created_at`，结果 key 会是 `createdAt`。

## tablePrefix

`db.query()` 不会自动应用 `tablePrefix`。如果物理表叫 `tbl_order_items`，应写：

```ts
db.query().selectFrom('tblOrderItems');
db.query().selectFrom('tbl_order_items');
```

不要写：

```ts
db.query().selectFrom('orderItems');
```

除非实际物理表就是 `order_items`。

## 不读取 Collection metadata

`db.query()` 不会做 `field.name -> columnName` 的映射：

```ts
await builder.createCollection('orders', (collection) => {
  collection.string('orderNo').columnName('order_number');
});

await db.query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .execute();
```

上面的 `orderNo` 会被归一化为 `order_no`，不会知道它应该映射到显式 `columnName: 'order_number'`。

以后需要这种元数据感知查询时，应放在 Repository 层，而不是让 `QueryAdapter` 读取 Collection metadata。

更完整的命名概念见 [命名概念](../concepts/naming.md)。
