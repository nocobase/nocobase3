# API 索引

本页列出当前可用的主要 public API。详细类型见同目录下的 reference 文档。

## Database

- `defineDatabase(config)`：类型辅助函数，返回传入配置。
- `createDatabaseManager(config)`：创建 `DatabaseManager`。
- `DatabaseManager`：管理默认连接和命名连接。
- `DatabaseConnection`：表示一个具体数据库连接。
- `QueryAdapter`：数据库层 Query Builder。

## Query

- `selectFrom(table)`
- `insertInto(table)`
- `updateTable(table)`
- `deleteFrom(table)`
- `execute()`
- `executeTakeFirst()`
- `executeTakeFirstOrThrow()`
- `value(column)`
- `pluck(column)`
- `exists()`
- `compile()`

## Repository（规划中，当前不可调用）

Repository 当前尚未实现。当前 `DatabaseManager` 没有 `db.repository()`，`DatabaseConnection` 也没有 `connection.repository()`；不要把规划接口复制到运行时代码。

规划中的入口：

- `db.repository(collectionName, connectionName?)`
- `connection.repository(collectionName)`

规划中的常规操作：

- `findMany(options?)`
- `findOne(options?)`
- `create({ values })`
- `update({ filter, values })`
- `delete({ filter })`

规划中的筛选条件优先使用 `filter: (filter) => ...` 的 Filter Builder；HTTP、CLI 和持久化配置可以使用 Filter AST。详见 [Repository 概览](../repository/overview.md)、[Filter Builder](../repository/filter-builder.md) 和 [Filter AST](../repository/filter-ast.md)。

## Migration

Migration 入口：

- `defineMigration(definition)`：唯一合法的 migration 文件定义方式。
- `createMigrator(options)`：创建 migration runner。
- `migrator.latest()`：执行所有 pending migrations。
- `migrator.rollback()`：回滚最近一批 migrations。
- `validateMigrations(options)`：校验 migration 文件格式和名称一致性。

Migration context 顶层只暴露 `builder`、`query` 和 `connection`。不在顶层公开 `schema`；底层 adapter client 兜底通过 `connection.client()`。

详见 [Migration](../migration/overview.md) 和 [Migration 维护清单](../migration/maintenance.md)。

## Builder

- `createCollection(name, input, options?)`
- `alterCollection(name, input, options?)`
- `dropCollection(name, options?)`
- `renameCollection(oldName, newName, options?)`
- `createViewCollection(name, input, options?)`
- `replaceViewCollection(name, input, options?)`
- `createMaterializedViewCollection(name, input, options?)`
- `refreshMaterializedViewCollection(name, options?)`
- `addField(collection, field, options?)`
- `alterField(collection, field, changes, options?)`
- `dropField(collection, field, options?)`
- `addIndex(collection, index, options?)`
- `dropIndex(collection, index, options?)`
- `addConstraint(collection, constraint, options?)`
- `dropConstraint(collection, constraint, options?)`
- `updateCollectionMetadata(collection, patch, options?)`
- `updateFieldMetadata(collection, field, patch, options?)`
- `apply(operations, options?)`

## Metadata

- `InMemoryCollectionMetadataStore`：当前原型使用的内存元数据存储。
- `CollectionMetadataStore`：元数据存储接口。

## Adapter

- `SchemaAdapter`：schema operation 执行接口。
- `NoopSchemaAdapter`：测试和 dry-run 友好的空实现。
- `KnexSchemaAdapter`：基于 Knex 的 schema adapter。

## Reference

- [DatabaseConfig](./database-config.md)
- [Query API](./query-api.md)
- [Migration](../migration/overview.md)
- [Migration 维护清单](../migration/maintenance.md)
- [Repository 概览（规划中）](../repository/overview.md)
- [Repository Filter Builder（规划中）](../repository/filter-builder.md)
- [Repository Filter AST（规划中）](../repository/filter-ast.md)
- [CollectionDefinition](./collection-definition.md)
- [FieldDefinition](./field-definition.md)
- [CollectionOperation](./collection-operation.md)
- [BuilderExecOptions](./builder-options.md)
- [BuilderResult](./builder-result.md)
- [术语表](./glossary.md)

## Development

- [源码与测试目录结构](../development/source-layout.md)
- [Agent 开发指南](../development/agent-guide.md)
