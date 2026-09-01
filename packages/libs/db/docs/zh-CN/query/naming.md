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

Collection 可以单独覆盖 `tablePrefix`，所以底层 Query 无法仅凭逻辑 Collection 名推导所有物理表名。需要 Collection-aware 查询时，应由 Repository 或 Collection Registry 提供解析后的表名。

完整契约、实现边界和测试清单见 [tablePrefix 表前缀](../concepts/table-prefix.md)。

## Agent 注意事项

- camelCase identifier 默认转换为 snake_case；Connection 可以配置 `underscored: false`。
- 显式 `select()` 保留调用方输入的结果 key，`selectAll()` 才自动映射未显式命名的下划线 key。
- Query 不读取 Collection 级 `underscored` 覆盖。
- Query 自动添加 Connection 的表前缀，但不读取 Collection 局部覆盖。
- Query 表来源参数不写 Connection 前缀；完整物理表访问使用底层 connection client。
- 不要生成 `tableName`、`columnName` 映射来影响 Query。

更完整的规则见 [命名概念](../concepts/naming.md)。
