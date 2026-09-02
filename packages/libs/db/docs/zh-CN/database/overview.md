---
title: Database 概览
description: 创建 DatabaseManager，选择 DatabaseConnection，并理解 Manager 快捷 API 与连接级能力。
---

# Database 概览

运行时从 `createDatabaseManager(config)` 开始。返回的 `DatabaseManager` 管理默认连接和命名连接；`DatabaseConnection` 表示其中一个具体数据库上下文。

## 阅读顺序

1. [`createDatabaseManager()`](./create-database-manager.md)
2. [DatabaseManager API](./database-manager.md)
3. [DatabaseConnection API](./database-connection.md)
4. [连接配置](./connections.md)
5. [事务](./transactions.md)

## Manager 快捷入口

```ts
const connection = db.connection();
const builder = db.builder();
const query = db.query();
```

它们分别对应默认 Connection：

```ts
db.connection();
db.connection().builder;
db.connection().query;
```

连续操作命名连接时，优先保留 Connection：

```ts
const analytics = db.connection('analytics');

await analytics.query.selectFrom('events').selectAll().execute();
```

## 选择连接级能力

| 需求                   | API                             |
| ---------------------- | ------------------------------- |
| 数据库方言             | `connection.dialect`            |
| Schema/Collection 变更 | `connection.builder`            |
| 数据查询与写入         | `connection.query`              |
| 完整 Collection        | `connection.collections`        |
| 事务                   | `connection.transaction()`      |
| 物理 Schema 检查       | `connection.schemaInspector`    |
| 补充 Metadata          | `connection.collectionMetadata` |

`builder`、`query` 等在 Connection 上是属性；它们在 Manager 上是接受可选连接名的快捷方法。
