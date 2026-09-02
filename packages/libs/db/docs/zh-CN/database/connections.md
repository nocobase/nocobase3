---
title: 数据库连接配置
description: 配置 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server Connection，以及命名和外部 Schema 行为。
---

# 数据库连接配置

数据库连接由 `createDatabaseManager()` 创建。它返回 `DatabaseManager`，支持默认连接和多个命名连接。

创建流程和默认连接行为见 [`createDatabaseManager()`](./create-database-manager.md)。本页只解释各方言和 Connection 配置。

## SQLite

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: ':memory:',
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
      dialect: 'postgres',
      host: '127.0.0.1',
      port: 15432,
      username: 'nocobase',
      password: 'nocobase',
      database: 'nocobase_collection_builder',
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
      dialect: 'mysql',
      host: '127.0.0.1',
      port: 13306,
      username: 'nocobase',
      password: 'nocobase',
      database: 'nocobase_collection_builder',
    },
  },
});
```

## Oracle

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'oracle',
      host: '127.0.0.1',
      port: 11521,
      serviceName: 'FREEPDB1',
      username: 'nocobase',
      password: 'nocobase',
    },
  },
});
```

底层使用 `oracledb` Thin mode，不需要 Oracle Instant Client。`serviceName` 是必填配置，不要用 `database` 代替。

## SQL Server

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'mssql',
      host: '127.0.0.1',
      port: 1433,
      database: 'nocobase',
      username: 'sa',
      password: process.env.DB_PASSWORD,
      encrypt: true,
      trustServerCertificate: false,
    },
  },
});
```

底层使用 Knex 的 `mssql` dialect 和 `tedious` driver。本地 Docker 使用自签名证书时可以设置 `encrypt: false`、`trustServerCertificate: true`；生产环境不要把信任自签名证书作为默认配置。

## 多连接

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: ':memory:',
    },
    analytics: {
      dialect: 'sqlite',
      filename: ':memory:',
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
      dialect: 'postgres',
      host: '127.0.0.1',
      port: 15432,
      username: 'nocobase',
      password: 'nocobase',
      database: 'nocobase_collection_builder',
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

Collection 可以用 `collection.naming({ underscored, tablePrefix })` 覆盖 Connection 命名配置。`underscored` 默认是 `true`；`tablePrefix: ''` 表示清除继承的前缀。不能显式指定任意物理名。

更完整的概念见 [命名概念](../concepts/naming.md)，端到端行为见 [underscored 命名规则](../concepts/underscored.md) 和 [tablePrefix 表前缀](../concepts/table-prefix.md)，Builder 编译规则见 [Builder 命名映射](../builder/naming.md)。

## defineDatabase

`defineDatabase()` 是一个类型辅助函数：

```ts
const config = defineDatabase({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: ':memory:',
    },
  },
});

const db = createDatabaseManager(config);
```

## Agent 注意事项

- `createDatabaseManager()` 是运行时入口。
- `defineDatabase()` 只帮助定义配置，不创建 manager。
- 用户配置必须写 `dialect`，`driver` 只在需要覆盖默认数据库驱动时填写。
- 不在用户配置中写 `adapter`、`client` 或 `connection`。
- 当前不提供连接 URL 配置方式，不写 `url`、`connectionString` 或 `uri`。
- MySQL 的 `socketPath` 可以和 `database`、`username`、`password` 一起使用，但不要和 `host`、`port` 混用。
- `db.builder()`、`db.query()`、`db.connection()` 是 lazy handle，不需要 `await`。
- `db.connection().client()` 需要 `await`。默认 Knex adapter 下，它返回 Knex 实例。
- `tablePrefix` 放在 connection 的 `naming` 下，Collection 可覆盖。
