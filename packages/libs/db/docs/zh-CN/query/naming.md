---
title: Query 命名归一化
description: 说明 QueryAdapter 的 underscored 转换、结果 key 与 Collection naming 边界。
---

# Query 命名归一化

`db.query()` 是数据库查询层，不是 Repository，也不读取 Collection Metadata。默认的 Connection naming 会把 camelCase table 和 column identifier 转为小写下划线：

Connection、Collection Builder 与 Query 的完整行为对照见 [`underscored` 命名规则](../concepts/naming/underscored.md)。

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

完整对照如下：

| `select()` 输入 | 查询的物理列 | 返回结果 key |
| --------------- | ------------ | ------------ |
| `createdAt`     | `created_at` | `createdAt`  |
| `created_at`    | `created_at` | `created_at` |

这层输入与结果 key 映射当前已经实现。它不是在执行结束后无条件把所有 key 转成 camelCase，而是显式保留调用方在 `select()` 中写下的字段名或 alias。

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

因此，`select('created_at')` 返回 `created_at`，而 `selectAll()` 读取到同一个物理列时默认返回 `createdAt`。前者有显式结果 key，后者使用未匹配列的自动映射。

## tablePrefix

`db.query()` 使用 Connection 的 `underscored` 和 `tablePrefix`，但不读取 Collection Metadata。表来源参数使用不带前缀的 Connection 相对标识符：

```ts
db.query().selectFrom('orderItems');
```

在 `underscored: true`、`tablePrefix: 'tbl_'` 时，它会查询物理表 `tbl_order_items`。不要传入 `tbl_order_items`，否则它会被当作相对标识符再次添加前缀。

Collection 可以单独覆盖 `tablePrefix`，所以底层 Query 无法仅凭逻辑 Collection 名推导所有物理表名。

完整概念见 [`tablePrefix` 表前缀](../concepts/naming/table-prefix.md)。

## 表来源、Join 和 Alias

所有引入表来源的位置都会应用 Connection naming：

- `selectFrom(table)`；
- `insertInto(table)`；
- `updateTable(table)`；
- `deleteFrom(table)`；
- `innerJoin`、`leftJoin`、`rightJoin` 和 `crossJoin` 的目标表；
- Expression Builder 中的 `selectFrom(table)`。

Alias 和字段引用不会添加 `tablePrefix`：

```ts
await db
  .query()
  .selectFrom('orders as orderRows')
  .leftJoin('customers as customerRows', (join) =>
    join.onRef('orderRows.customerId', '=', 'customerRows.id'),
  )
  .select(['orderRows.orderNo', 'customerRows.name as customerName'])
  .execute();
```

在 `underscored: true`、`tablePrefix: 'app_'` 时，关键物理标识符为：

```text
app_orders as order_rows
app_customers as customer_rows
order_rows.customer_id = customer_rows.id
```

没有 Alias 时，Qualified Reference 会解析到带前缀的物理表限定符。例如 `orders.id` 会成为 `app_orders.id`。

## 子查询

子查询中的表来源同样应用 Connection naming。关联子查询可以引用外层表或 Alias：

```ts
db.query()
  .selectFrom('orders')
  .where(({ exists, selectFrom }) =>
    exists(
      selectFrom('payments')
        .select('id')
        .whereRef('payments.orderId', '=', 'orders.id'),
    ),
  );
```

使用 `app_` 前缀时，比较表达式解析为 `app_payments.order_id = app_orders.id`。本地表来源或 Alias 与外层同名时，本地作用域优先。

## Collection 局部 naming

Query 不读取 Collection Metadata，因此不会自动应用 Collection 对 `underscored` 或 `tablePrefix` 的局部覆盖。当前可用路径是：

1. 使用 `connection.collections.getPhysical(logicalName)` 解析物理 Schema；
2. 检查返回值是否存在，并读取其中的 `schema` 和 `tableName`；
3. 只有必须使用完整物理名称时，进入 `connection.client()` 这一底层、Adapter-specific 的边界。

不要把 `getPhysical()` 返回的 `tableName` 再传给普通 Query。需要 Collection-aware 命名映射时使用 [Repository](../repository/overview.md)，传入 Collection 和字段逻辑名。

## 使用注意事项

- camelCase identifier 默认转换为 snake_case；Connection 可以配置 `underscored: false`。
- 显式 `select()` 保留调用方输入的结果 key，`selectAll()` 才自动映射未显式命名的下划线 key。
- Query 不读取 Collection 级 `underscored` 覆盖。
- Query 自动添加 Connection 的表前缀，但不读取 Collection 局部覆盖。
- Join 和子查询引入的表来源同样使用 Connection 相对标识符。
- Query 表来源参数不写 Connection 前缀；完整物理表访问使用底层 connection client。
- 不要生成 `tableName`、`columnName` 映射来影响 Query。

更完整的规则见 [命名概念](../concepts/naming/overview.md)。
