# API 索引

本页列出当前原型中主要 public API。详细类型见同目录下的 reference 文档。

## Database

- `defineDatabase(config)`：类型辅助函数，返回传入配置。
- `createDatabaseManager(config)`：创建 `DatabaseManager`。
- `DatabaseManager`：管理默认连接和命名连接。
- `DatabaseConnection`：表示一个具体数据库连接。
- `QueryAdapter`：基础查询适配器。

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

- [CollectionDefinition](./collection-definition.md)
- [FieldDefinition](./field-definition.md)
- [CollectionOperation](./collection-operation.md)
- [BuilderExecOptions](./builder-options.md)
- [BuilderResult](./builder-result.md)
- [术语表](./glossary.md)
