# DatabaseConfig

`DatabaseConfig` 用于创建 `DatabaseManager`。

```ts
interface DatabaseConfig {
  default?: string;
  connections: Record<string, ConnectionConfig>;
  metadataStore?: CollectionMetadataStore;
}
```

## 基础配置

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

`default` 指定默认连接名。如果不写，会使用 `connections` 中的第一个连接。

## ConnectionConfig

用户配置只描述数据库类型和连接参数，不暴露内部 adapter 配置：

```ts
type ConnectionConfig =
  SqliteConnectionConfig | PostgresConnectionConfig | MysqlConnectionConfig;
```

公共配置：

```ts
interface BaseConnectionConfig {
  naming?: NamingOptions;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore;
  managed?: boolean;
  debug?: boolean;
  pool?: unknown;
  driverOptions?: Record<string, unknown>;
}
```

`dialect` 是必填字段。`driver` 是底层 Node.js 数据库驱动，通常不写，由 `dialect` 自动推导：

| dialect    | 默认 driver      |
| ---------- | ---------------- |
| `sqlite`   | `better-sqlite3` |
| `postgres` | `pg`             |
| `mysql`    | `mysql2`         |

`driver` 如果显式填写，必须和 `dialect` 匹配。

SQLite：

```ts
interface SqliteConnectionConfig extends BaseConnectionConfig {
  dialect: 'sqlite';
  driver?: 'better-sqlite3';
  filename: string;
}
```

PostgreSQL：

```ts
type PostgresConnectionConfig = BaseConnectionConfig & {
  dialect: 'postgres';
  driver?: 'pg';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  schema?: string | readonly string[];
  ssl?: boolean | Record<string, unknown>;
};
```

MySQL：

```ts
type MysqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mysql';
  driver?: 'mysql2';
  charset?: string;
  timezone?: string;
  ssl?: boolean | Record<string, unknown>;
} & (
    | {
        socketPath: string;
        host?: never;
        port?: never;
        database?: string;
        username?: string;
        password?: string;
      }
    | {
        host?: string;
        port?: number;
        database?: string;
        username?: string;
        password?: string;
        socketPath?: never;
      }
  );
```

用户配置使用 `username`，内部会转换成底层 driver 需要的 `user`。

MySQL 的 `socketPath` 是另一种连接目标，可以和 `database`、`username`、`password` 一起使用，但不要和 `host`、`port` 混用。

`driverOptions` 只放当前类型未覆盖的底层 driver 参数。常用连接参数必须平铺，不要放进 `driverOptions`。当前不提供连接 URL 配置方式，也不要在 `driverOptions` 里写 `connectionString` 或 `uri`。

用户配置中不要写 `adapter`、`client` 或 `connection`。默认 adapter 是 Knex，内部会把用户配置归一化成 Knex 需要的 `client` 和 `connection`。

## naming

```ts
type NamingOptions = {
  underscored?: boolean;
  tablePrefix?: string;
};
```

`underscored` 控制是否把逻辑名转换为小写下划线，默认 `true`；`tablePrefix` 是 Connection 上的默认表前缀。Collection 可以局部覆盖两项配置，但不支持注入自定义 `namingStrategy`。

`naming` 是 connection 级默认命名配置。Collection 可以通过 `collection.naming(...)` 覆盖。

更完整规则见 [命名概念](../concepts/naming.md)。

## metadataStore

`metadataStore` 可以放在 manager 级，也可以放在 connection 级：

```ts
const db = createDatabaseManager({
  metadataStore,
  connections: {
    main: {
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_DATABASE,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    },
  },
});
```

connection 级 `metadataStore` 优先于 manager 级 `metadataStore`。

## defineDatabase

`defineDatabase()` 是类型辅助函数：

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

它只返回传入配置，不创建 `DatabaseManager`。
