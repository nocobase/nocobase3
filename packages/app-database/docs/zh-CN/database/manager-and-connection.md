# DatabaseManager 和 DatabaseConnection

`DatabaseManager` 管理连接集合，`DatabaseConnection` 表示一个具体连接。

## DatabaseManager

```ts
interface DatabaseManager {
  connection(name?: string): DatabaseConnection;
  builder(name?: string): CollectionBuilder;
  query(name?: string): QueryAdapter;

  connect(name?: string): Promise<DatabaseConnection>;

  transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
    name?: string,
  ): Promise<T>;

  disconnect(name?: string): Promise<void>;
  reconnect(name?: string): Promise<DatabaseConnection>;
  destroy(): Promise<void>;
}
```

`DatabaseManager` 当前没有 Repository 入口。Repository 是规划接口，当前不要在运行时代码中调用 `db.repository()`。

## DatabaseConnection

```ts
interface DatabaseConnection {
  name: string;
  driver: 'better-sqlite3' | 'pg' | 'mysql2';
  dialect: 'sqlite' | 'postgres' | 'mysql';
  capabilities: DatabaseCapabilities;

  builder: CollectionBuilder;
  query: QueryAdapter;
  schema: SchemaAdapter;

  client<T = unknown>(): Promise<T>;

  connect(): Promise<this>;
  disconnect(): Promise<void>;
  reconnect(): Promise<this>;

  transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
  ): Promise<T>;
}
```

`DatabaseConnection` 当前没有 Repository 入口。Repository 是规划接口，当前不要在运行时代码中调用 `connection.repository()`。

## lazy handle

这些方法不需要 `await`：

```ts
const connection = db.connection();
const builder = db.builder();
const query = db.query();
```

它们返回的是 lazy handle，只有实际执行数据库操作时才会创建底层连接。

## async escape hatch

`client()` 返回当前 adapter 的底层 client，因此是 async。默认 Knex adapter 下，它返回 Knex 实例，不是 `pg`、`mysql2` 或 `better-sqlite3` 的原生实例：

```ts
const knex = await db.connection().client();
```

## transaction

```ts
await db.transaction(async (connection) => {
  await connection.builder.createCollection('orders', (collection) => {
    collection.increments('id');
    collection.string('status');
  });

  await connection.query
    .insertInto('orders')
    .values({
      status: 'paid',
    })
    .execute();
});
```

## Agent 注意事项

- 普通 schema 变更使用 `db.builder()`。
- 需要底层 adapter client 能力时才使用 `db.connection().client()`。
- transaction 内应使用回调参数里的 `connection`，不要回到外层 `db`。
- 完成测试或脚本后调用 `db.destroy()`。
- Repository 是规划接口，当前尚未实现；筛选设计见 [Filter Builder](../repository/filter-builder.md)。
