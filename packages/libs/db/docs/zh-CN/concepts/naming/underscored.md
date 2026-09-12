---
title: underscored 命名规则
description: 说明 underscored 的默认值、确定性转换算法，以及 Connection、Collection Builder 和 Query 的作用边界。
---

# `underscored` 命名规则

`underscored` 控制逻辑 Collection 和 Field 名是否转换为小写下划线形式。它属于 `NamingOptions`，默认值是 `true`。

## 转换算法

启用时依次执行：

1. 在小写字母或数字与紧随其后的大写字母之间插入 `_`；
2. 把连续连字符或空白替换为 `_`；
3. 把结果转换为小写。

```ts
export function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}
```

| 逻辑名称       | `underscored: true` | `underscored: false` |
| -------------- | ------------------- | -------------------- |
| `orderItems`   | `order_items`       | `orderItems`         |
| `createdAt`    | `created_at`        | `createdAt`          |
| `Sales Orders` | `sales_orders`      | `Sales Orders`       |
| `sales-orders` | `sales_orders`      | `sales-orders`       |
| `OAuth2Tokens` | `oauth2_tokens`     | `OAuth2Tokens`       |
| `APIKeys`      | `apikeys`           | `APIKeys`            |

连续大写字母不会被自动分成单词，因此 `APIKeys` 得到 `apikeys`，而不是 `api_keys`。不要使用另一套 snake_case 算法预测物理名称。

## Connection 与 Collection

Connection 提供默认值：

```ts
const db = createDatabaseManager({
  connections: {
    main: {
      dialect: 'postgres',
      naming: { underscored: true },
    },
  },
});
```

Collection 可以局部覆盖：

```ts
await db.builder().createCollection('auditLogs', (collection) => {
  collection.naming({ underscored: false });
  collection.datetime('createdAt');
});
```

此时该 Collection 的物理名称保留为 `auditLogs.createdAt`。Collection 未明确提供的 naming 属性继续继承 Connection。

## Builder 与 Query

| 配置来源                 | Builder | Query  |
| ------------------------ | ------- | ------ |
| Connection `underscored` | 使用    | 使用   |
| Collection `underscored` | 使用    | 不读取 |

Query 中显式 `select()`、Alias 和 `selectAll()` 的结果 key 还具有独立规则，详见 [Query 命名归一化](../../query/naming.md)。不要仅根据 `underscored` 推断查询结果对象的 Key。

## 修改已有配置

修改现有 Collection 的 `underscored` 可能改变表名、列名和依赖对象名称。生产数据库必须通过显式 Migration 完成重命名，不能只修改 Connection 或 Collection 配置。

## 使用规则

- 未明确配置时按 `underscored: true` 理解。
- 使用本文给出的实际转换算法，不要自行猜测缩写分词。
- Builder 代码同时检查 Connection 默认值和 Collection 覆盖。
- Query 只应用 Connection 配置，不读取 Collection 覆盖。
- 修改已有数据库的配置前先编写 Migration。

## 继续阅读

- [命名概念](./overview.md)
- [`tablePrefix` 表前缀](./table-prefix.md)
- [Builder 命名与跨数据库兼容](../../builder/portability.md)
- [Query 命名归一化](../../query/naming.md)
