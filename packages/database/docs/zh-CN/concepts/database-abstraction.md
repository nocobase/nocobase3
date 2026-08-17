# 数据库抽象

当前原型采用分层设计，把应用层 Collection DSL 和底层数据库操作解耦。

```text
Application / Agent
        ↓
Collection DSL
        ↓
Collection Builder
        ↓
Schema Adapter
        ↓
Knex
        ↓
Database
```

## DatabaseManager

`DatabaseManager` 管理多个命名连接，并提供默认连接入口。

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
  },
});
```

## DatabaseConnection

`DatabaseConnection` 表示一个具体连接，包含：

- `builder`
- `query`
- `schema`
- `client()`
- `transaction()`
- `connect()`
- `disconnect()`

## SchemaAdapter

`SchemaAdapter` 是 Collection Builder 和具体数据库实现之间的边界。Builder 只编译出 schema operation，再交给 adapter 执行。

当前实现：

```text
CollectionBuilder -> SchemaAdapter -> KnexSchemaAdapter -> Knex
```

## QueryAdapter

`QueryAdapter` 当前只是一个薄封装，用于基础查询验证。它不是 Repository，也不是 ORM。它工作在数据库物理名层，只做 `underscored` 归一化，不读取 Collection metadata。

## Agent 注意事项

- 应用层建模不要直接使用 Knex schema builder。
- 当前可以直接使用 `db.builder()` 做 schema 变更。
- `db.query()` 只用于基础查询，复杂 Repository 设计尚未实现。
- 适配 Kysely 或其他底层实现时，应优先扩展 adapter，而不是改 Collection DSL。
- 需要 `field.name -> columnName` 查询映射时，应由未来 Repository 负责。
