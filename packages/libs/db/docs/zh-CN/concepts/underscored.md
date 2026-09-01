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

`db.query()` 是底层数据库 Query 接口，不读取 Collection Metadata。它只使用 Connection 的 `underscored`，且创建 Query naming strategy 时会忽略 `tablePrefix`。

| 配置来源                 | Builder | Query      |
| ------------------------ | ------- | ---------- |
| Connection `underscored` | 使用    | 使用       |
| Collection `underscored` | 使用    | 不读取     |
| Connection `tablePrefix` | 使用    | 不自动添加 |
| Collection `tablePrefix` | 使用    | 不读取     |

默认 `underscored: true` 时：

```ts
await db.query().selectFrom('tblOrderItems').select('createdAt').execute();
```

Query 会使用物理 identifier `tbl_order_items.created_at`。如果 Connection 设置 `underscored: false`，同一段调用会保留 `tblOrderItems.createdAt`。

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
- 生成底层 Query 时只依赖 Connection 的 `underscored`，并显式处理表前缀和 Collection 局部覆盖。
- 修改已有数据库的 `underscored` 前，先生成可审查的 Migration，不要直接改生产配置。
