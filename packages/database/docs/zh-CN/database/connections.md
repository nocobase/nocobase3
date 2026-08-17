# 数据库连接

数据库连接由 `createDatabaseManager()` 创建。它返回 `DatabaseManager`，支持默认连接和多个命名连接。

## SQLite

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      driver: 'knex',
      client: 'better-sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    },
  },
});
```

## PostgreSQL

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      driver: 'knex',
      client: 'pg',
      connection: {
        host: '127.0.0.1',
        port: 15432,
        user: 'nocobase',
        password: 'nocobase',
        database: 'nocobase_collection_builder',
      },
    },
  },
});
```

## MySQL

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      driver: 'knex',
      client: 'mysql2',
      connection: {
        host: '127.0.0.1',
        port: 13306,
        user: 'nocobase',
        password: 'nocobase',
        database: 'nocobase_collection_builder',
      },
    },
  },
});
```

## 多连接

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      driver: 'knex',
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    },
    analytics: {
      driver: 'knex',
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    },
  },
});

await db.builder('analytics').createCollection('events', (collection) => {
  collection.increments('id');
});
```

## 命名配置

`naming` 是 connection 级配置，Builder 会用它把 Collection 逻辑名推导为数据库物理名：

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      driver: 'knex',
      client: 'pg',
      connection: process.env.DATABASE_URL,
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    },
  },
});
```

这个配置下：

```text
orderItems -> tbl_order_items
createdAt -> created_at
```

Collection 可以用 `collection.naming(...)` 覆盖 connection 级配置，也可以用 `tableName`、`columnName` 显式指定物理名。

更完整的规则见 [命名映射](../builder/naming.md)。

## defineDatabase

`defineDatabase()` 是一个类型辅助函数：

```ts
const config = defineDatabase({
  default: 'main',
  connections: {
    main: {
      driver: 'knex',
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    },
  },
});

const db = createDatabaseManager(config);
```

## Agent 注意事项

- `createDatabaseManager()` 是运行时入口。
- `defineDatabase()` 只帮助定义配置，不创建 manager。
- 当前 connection driver 只有 `knex`。
- `db.builder()`、`db.query()`、`db.connection()` 是 lazy handle，不需要 `await`。
- `db.client()` 需要 `await`，因为它返回底层 driver client。
- `tablePrefix` 放在 connection 的 `naming` 下，Collection 可覆盖。
