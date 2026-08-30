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
      dialect: 'sqlite',
      filename: ':memory:',
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

`QueryAdapter` 是数据库层 Query Builder。它不是 Repository，也不是 ORM。它工作在数据库物理名层，可以做 `underscored` 归一化，但不读取 Collection metadata。

## Repository

`Repository` 是计划中的 Collection-aware 数据访问层，当前尚未实现。它会读取 Collection
metadata，用 Collection / Field 逻辑名做常规 CRUD，通过 Select AST 表达结果形状、
Filter Builder / Filter AST 表达筛选条件，并通过 Sort AST 表达排序。

详细设计见 [Repository 概览](../repository/overview.md)、
[Select AST](../repository/select-ast.md)、[Filter Builder](../repository/filter-builder.md)、
[Filter AST](../repository/filter-ast.md) 和 [Sort AST](../repository/sort-ast.md)。

## Agent 注意事项

- 应用层建模不要直接使用 Knex schema builder。
- 当前可以直接使用 `db.builder()` 做 schema 变更。
- `db.query()` 只用于基础查询，复杂 Repository 设计尚未实现。
- 适配 Kysely 或其他底层实现时，应优先扩展 adapter，而不是改 Collection DSL。
- 需要 `field.name -> columnName` 查询映射时，应由未来 Repository 负责。
