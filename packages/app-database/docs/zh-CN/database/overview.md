# Database 概览

Database 层负责连接管理，不负责定义 Collection，也不直接承载业务 Repository。

当前主入口是：

```ts
const db = createDatabaseManager(config);
```

`createDatabaseManager()` 返回 `DatabaseManager`，它管理默认连接和多个命名连接。

## 层级关系

```text
DatabaseManager
  -> DatabaseConnection
       -> builder
       -> query
       -> schema
       -> client()
       -> transaction()
```

Manager 级快捷方法：

```ts
db.connection();
db.builder();
db.query();
db.transaction();
```

这些快捷方法等价于访问默认 connection：

```ts
db.connection().builder;
db.connection().query;
db.connection().client();
db.connection().transaction();
```

命名连接可以通过参数访问：

```ts
db.builder('analytics');
db.query('analytics');
db.connection('analytics').client();
db.transaction(fn, 'analytics');
```

更长的代码更推荐先取 connection：

```ts
const analytics = db.connection('analytics');

await analytics.builder.createCollection('events', (collection) => {
  collection.increments('id');
});

const events = await analytics.query
  .selectFrom('events')
  .select(['id'])
  .execute();
```

## 文档地图

- [连接配置](./connections.md)
- [DatabaseManager 和 DatabaseConnection](./manager-and-connection.md)
- [事务](./transactions.md)
- [Repository 概览（规划中）](../repository/overview.md)
- [DatabaseConfig 参考](../reference/database-config.md)

## Agent 注意事项

- `createDatabaseManager()` 是运行时入口。
- `defineDatabase()` 只是配置类型辅助函数，不创建连接。
- `db.connection()`、`db.builder()`、`db.query()` 是 lazy handle，不需要 `await`。
- `db.connection().client()` 需要 `await`。默认 Knex adapter 下，它返回 Knex 实例。
- transaction 内应使用回调参数里的 `connection`，不要回到外层 `db`。
- `db.repository()` 是规划接口，当前尚未实现。
