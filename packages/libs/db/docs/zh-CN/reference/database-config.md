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
  | SqliteConnectionConfig
  | PostgresConnectionConfig
  | MysqlConnectionConfig
  | OracleConnectionConfig
  | MssqlConnectionConfig;
```

公共配置：

```ts
interface BaseConnectionConfig {
  naming?: NamingOptions;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore;
  schemaManagement?: 'managed' | 'external';
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
| `oracle`   | `oracledb`       |
| `mssql`    | `tedious`        |

`driver` 如果显式填写，必须和 `dialect` 匹配。

### schemaManagement

`schemaManagement` 声明 NocoBase 是否拥有这个 Connection 的物理 Schema，默认值是 `'managed'`：

- `'managed'`：允许通过 Builder/Schema Adapter 执行 DDL，也允许运行 Migration。
- `'external'`：真实 DDL 和 Migration 会以 `SCHEMA_MANAGEMENT_NOT_ALLOWED` 拒绝；Builder dry-run 和 SQL
  预览仍然可用。

该配置不控制业务记录权限。外部 Schema 仍可通过 Query API 查询、插入、更新或删除记录，最终是否允许由
数据库权限和上层 ACL 决定。`connection.client()` 是底层逃生口，不经过 Schema guard；直接用它执行 DDL
时，调用者自行负责遵守 Schema 所有权边界。

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

Oracle：

```ts
type OracleConnectionConfig = BaseConnectionConfig & {
  dialect: 'oracle';
  driver?: 'oracledb';
  host?: string;
  port?: number;
  serviceName: string;
  username?: string;
  password?: string;
};
```

Oracle 使用 `serviceName`，内部组合为 `host:port/serviceName` 形式的 `connectString`。`oracledb` 6 默认使用 Thin mode，不要求安装 Oracle Instant Client。

SQL Server：

```ts
type MssqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mssql';
  driver?: 'tedious';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};
```

SQL Server 底层使用 Knex 的 `mssql` dialect 和 `tedious` driver。`encrypt` 控制传输加密；本地自签名测试环境可以设置 `trustServerCertificate: true`，生产环境应优先使用受信任证书。

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

> 本节说明当前基于 Store 实例的 API。目标命名 Store 配置，以及从完整
> `CollectionDefinition` 记录迁移的方案，见
> [Metadata Store 设计](../collection/metadata-store.md) 和
> [Metadata Store 后端](../collection/metadata-store-backends.md)。当前配置类型尚未实现这些目标设计。

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
