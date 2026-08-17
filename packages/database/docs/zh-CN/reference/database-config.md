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

`default` 指定默认连接名。如果不写，会使用 `connections` 中的第一个连接。

## ConnectionConfig

当前 V1 只实现 Knex driver：

```ts
interface KnexConnectionConfig extends BaseConnectionConfig {
  driver: 'knex';
  client: string;
  connection?: unknown;
  pool?: unknown;
  useNullAsDefault?: boolean;
  searchPath?: string[];
}
```

公共配置：

```ts
interface BaseConnectionConfig {
  driver: string;
  schema?: string;
  naming?: NamingOptions;
  namingStrategy?: NamingStrategy;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore;
  managed?: boolean;
  debug?: boolean;
}
```

## naming

```ts
type NamingOptions = {
  underscored?: boolean;
  tablePrefix?: string;
};
```

`naming` 是 connection 级默认命名配置。Collection 可以通过 `collection.naming(...)` 覆盖。

更完整规则见 [命名概念](../concepts/naming.md)。

## metadataStore

`metadataStore` 可以放在 manager 级，也可以放在 connection 级：

```ts
const db = createDatabaseManager({
  metadataStore,
  connections: {
    main: {
      driver: 'knex',
      client: 'pg',
      connection: process.env.DATABASE_URL,
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
      driver: 'knex',
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    },
  },
});

const db = createDatabaseManager(config);
```

它只返回传入配置，不创建 `DatabaseManager`。
