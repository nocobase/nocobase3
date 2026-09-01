---
title: underscored 命名规则
description: 说明 underscored 从 Connection 配置到 Collection Builder、Query 的完整行为、转换边界与迁移要求。
---

# underscored 命名规则

`underscored` 控制逻辑 Collection 和 Field 名是否转换为小写下划线形式。它属于 `NamingOptions`，默认值是 `true`：

```ts
interface NamingOptions {
  underscored?: boolean;
  tablePrefix?: string;
}
```

## 转换规则

启用 `underscored` 时，当前转换算法依次执行：

1. 在小写字母或数字与紧随其后的大写字母之间插入 `_`；
2. 把连续的连字符或空白替换为 `_`；
3. 把结果转换为小写。

```ts
export function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}
```

常见结果：

| 逻辑名称       | `underscored: true` | `underscored: false` |
| -------------- | ------------------- | -------------------- |
| `orderItems`   | `order_items`       | `orderItems`         |
| `createdAt`    | `created_at`        | `createdAt`          |
| `Sales Orders` | `sales_orders`      | `Sales Orders`       |
| `sales-orders` | `sales_orders`      | `sales-orders`       |
| `order_items`  | `order_items`       | `order_items`        |
| `OAuth2Tokens` | `oauth2_tokens`     | `OAuth2Tokens`       |
| `userID`       | `user_id`           | `userID`             |
| `APIKeys`      | `apikeys`           | `APIKeys`            |

连续大写字母不会被当作独立单词分词，因此 `APIKeys` 当前得到 `apikeys`，不是 `api_keys`。这个算法属于物理 Schema 的兼容契约；修改算法可能改变已有表名和列名，必须通过 Migration 处理。

## Connection 配置

Connection 提供 Builder 和 Query 使用的默认命名配置：

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'postgres',
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    },
  },
});
```

对应的默认物理名称是：

```text
orderItems.createdAt -> tbl_order_items.created_at
```

`tablePrefix` 按原样拼接在转换后的 Collection 名称前，只作用于表、普通 View 和物化 View，不作用于 Field。

前缀的继承、Query 边界和迁移要求见 [tablePrefix 表前缀](./table-prefix.md)。

## Collection Builder

Builder 合并 Connection 和 Collection 的 naming：

```text
effectiveNaming = merge(connection.naming, collection.naming)
normalized(name) = effectiveNaming.underscored ? snakeCase(name) : name
物理表名 = effectiveNaming.tablePrefix + normalized(collectionName)
物理列名 = normalized(fieldName)
```

Collection 只覆盖自己显式提供的属性。下面的 Collection 继承 Connection 的 `tablePrefix: 'tbl_'`，只关闭 `underscored`：

```ts
await db.builder().createCollection('auditLogs', (collection) => {
  collection.naming({ underscored: false });
  collection.datetime('createdAt');
});
```

结果是：

```text
tbl_auditLogs.createdAt
```

也可以同时覆盖两项：

```ts
collection.naming({
  underscored: false,
  tablePrefix: 'archive_',
});
```

这会得到 `archive_auditLogs.createdAt`。`tablePrefix: ''` 表示显式清除 Connection 的表前缀。

Relation、Index、Constraint 和结构化 View 中仍然使用逻辑名，Builder 会用相关 Collection 自己的 effective naming 解析物理名称。例如：

```ts
collection.belongsTo('createdBy', 'users');
```

产生的隐式本地外键列是：

```text
underscored: true  -> created_by_id
underscored: false -> createdBy_id
```

后缀 `_id` 是 Relation 外键规则的一部分，不受 `underscored` 开关影响。

## Query

`db.query()` 是底层数据库 Query 接口，不读取 Collection Metadata。它使用 Connection 的 `underscored` 和 `tablePrefix`，但不读取 Collection 局部 naming 覆盖。

| 配置来源                 | Builder | Query  |
| ------------------------ | ------- | ------ |
| Connection `underscored` | 使用    | 使用   |
| Collection `underscored` | 使用    | 不读取 |
| Connection `tablePrefix` | 使用    | 使用   |
| Collection `tablePrefix` | 使用    | 不读取 |

默认 `underscored: true` 时：

```ts
await db.query().selectFrom('orderItems').select('createdAt').execute();
```

如果 Connection 同时设置 `tablePrefix: 'tbl_'`，Query 会使用物理 identifier `tbl_order_items.created_at`。如果设置 `underscored: false`，同一段调用会使用 `tbl_orderItems.createdAt`。

下面两个配置的差异只来自 `underscored`，`tablePrefix` 始终按原样拼接：

```ts
// 使用 tbl_order_items.order_no
naming: {
  underscored: true,
  tablePrefix: 'tbl_',
}

// 使用 tbl_orderItems.orderNo
naming: {
  underscored: false,
  tablePrefix: 'tbl_',
}
```

关闭 `underscored` 不等于关闭 `tablePrefix`，关闭前缀也不会改变字段转换：

| Connection naming                             | 表来源输入   | 字段输入  | 物理 identifier            |
| --------------------------------------------- | ------------ | --------- | -------------------------- |
| `{ underscored: true, tablePrefix: 'tbl_' }`  | `orderItems` | `orderNo` | `tbl_order_items.order_no` |
| `{ underscored: false, tablePrefix: 'tbl_' }` | `orderItems` | `orderNo` | `tbl_orderItems.orderNo`   |
| `{ underscored: true, tablePrefix: '' }`      | `orderItems` | `orderNo` | `order_items.order_no`     |
| `{ underscored: false, tablePrefix: '' }`     | `orderItems` | `orderNo` | `orderItems.orderNo`       |

`tablePrefix` 不会自动补充分隔符。例如 `tablePrefix: 'tbl'` 会产生 `tblorder_items`，需要 `tbl_order_items` 时必须显式配置为 `tbl_`。

### Join 和 alias

表来源使用 Collection 名转换，字段使用 Field 名转换，alias 只做 identifier 转换：

```ts
db.query()
  .selectFrom('orderItems as orderRows')
  .leftJoin('users as createdByUsers', (join) =>
    join.onRef('orderRows.createdById', '=', 'createdByUsers.id'),
  )
  .select([
    'orderRows.orderNo as orderNo',
    'createdByUsers.displayName as createdByName',
  ]);
```

使用 `underscored: true`、`tablePrefix: 'tbl_'` 时对应：

```text
tbl_order_items as order_rows
tbl_users as created_by_users
order_rows.created_by_id = created_by_users.id
```

alias 不会变成 `tbl_order_rows` 或 `tbl_created_by_users`。

### 字段输入和结果 key

`underscored` 会把 Query 中的 camelCase 字段 identifier 转成物理列名，但显式 `select()` 的结果 key 保留调用方写下的字段名。

传入 `createdAt` 时：

```ts
const row = await db
  .query()
  .selectFrom('orderItems')
  .select('createdAt')
  .executeTakeFirst();
```

实际查询物理列 `created_at`，结果仍然是：

```ts
{
  createdAt: '...';
}
```

传入 `created_at` 时：

```ts
const row = await db
  .query()
  .selectFrom('orderItems')
  .select('created_at')
  .executeTakeFirst();
```

物理列和结果 key 都保持 `created_at`：

```ts
{
  created_at: '...';
}
```

对应规则是：

| `select()` 输入 | 查询的物理列 | 返回结果 key |
| --------------- | ------------ | ------------ |
| `createdAt`     | `created_at` | `createdAt`  |
| `created_at`    | `created_at` | `created_at` |

显式 alias 最终决定返回结果 key：

```ts
select('createdAt as created_at'); // 返回 created_at
select('created_at as createdAt'); // 返回 createdAt
```

`selectAll()` 没有逐个声明调用方期望的字段 key，因此行为不同：当 Connection 使用 `underscored: true` 时，数据库返回的未匹配列会自动转回 camelCase：

```ts
const row = await db
  .query()
  .selectFrom('orderItems')
  .selectAll()
  .executeTakeFirst();

// 数据库列 created_at -> 结果 key createdAt
```

这层字段输入与结果 key 映射当前已经实现，并由 Query naming 集成测试覆盖。它不依赖 Collection Metadata，只依赖 Connection 的 `underscored` 配置。

限定到表或 alias 的 wildcard 采用相同结果映射：

```ts
// 相对表限定符会解析到 tbl_order_items.*
db.query().selectFrom('orderItems').select('orderItems.*');

// alias 保持为 order_rows.*，不会添加 tbl_
db.query().selectFrom('orderItems as orderRows').selectAll('orderRows');
```

如果某个 Collection 覆盖为 `underscored: false`，Query 不会自动发现这一点。调用方必须明确使用该 Collection 的物理 identifier，或者使用未来的 Collection-aware Repository。

## 修改配置与 Migration

Collection 创建后，修改 Connection 或 Collection 的 `underscored` 可能同时改变表名、列名、Index、Constraint、Foreign Key 和 View 引用。例如：

```text
underscored: true  -> order_items.created_at
underscored: false -> orderItems.createdAt
```

因此不能把已有数据库的 `underscored` 当作无副作用的运行时配置直接切换。生产环境需要显式 Migration 完成物理 Schema 重命名，并在同一变更中处理依赖对象。

旧 Metadata 中的 `tableName`、`columnName` 会按照当前 effective naming 校验：

- 旧物理名称与推导结果一致时允许启动，并在下一次 Metadata 写入时清理旧映射；
- 不一致时抛出 `COLLECTION_NAMING_INCOMPATIBLE`；
- 校验失败不会自动重命名生产数据库，也不会自动修改 Metadata。

## Agent 注意事项

- 未明确配置时，按 `underscored: true` 理解。
- 不要通过 `tableName` 或 `columnName` 模拟 `underscored`。
- 生成 Builder 代码前，同时检查 Connection 和目标 Collection 的 naming。
- 生成底层 Query 时使用不带前缀的 Connection 相对表标识符；Query 会应用 Connection naming，但不读取 Collection 局部覆盖。
- 显式 `select()` 的结果 key 以输入字段名或 alias 为准；不要假设所有结果都会自动转成 camelCase。
- `selectAll()` 在 `underscored: true` 时会把未显式映射的下划线结果 key 转回 camelCase。
- 修改已有数据库的 `underscored` 前，先生成可审查的 Migration，不要直接改生产配置。
