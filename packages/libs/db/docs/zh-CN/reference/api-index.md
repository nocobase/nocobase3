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

- `findMany({ select?, filter?, sort?, limit?, offset?, context? })`
- `findOne({ select?, filter?, sort?, context? })`：必须至少提供 `filter` 或非空
  `sort`
- `count({ filter?, context? })`
- `exists({ filter?, context? })`
- `create({ values })`
- `update({ filter, values })` 或显式全量更新 `update({ all: true, values })`
- `delete({ filter })` 或显式全量删除 `delete({ all: true })`

`update()` 和 `delete()` 都是批量操作，返回 `{ affectedCount }`；缺失 `filter` 不能隐式
表示全量写入。`select` 使用 Select AST 描述标量字段和 relation 结果树；`sort` 使用
Sort AST 区分直接字段、to-one relation field 和 to-many relation aggregate。

规划中的筛选条件优先使用 `filter: (filter) => ...` 的 Filter Builder；HTTP、CLI 和
持久化配置使用结构化 AST。详见 [Repository 概览](../repository/overview.md)、
[Select AST](../repository/select-ast.md)、[Filter Builder](../repository/filter-builder.md)、
[Filter AST](../repository/filter-ast.md) 和 [Sort AST](../repository/sort-ast.md)。

## Migration

Migration 入口：

- `defineMigration(definition)`：唯一合法的 migration 文件定义方式。
- `database.createMigrator(options)`：创建绑定当前 Database Manager 的 migration runner。
- `createMigrator({ database, ...options })`：底层 migration runner 工厂。
- `migrator.latest()`：执行所有 pending migrations。
- `migrator.rollback()`：回滚最近一批 migrations。
- `validateMigrations(options)`：校验 migration 文件格式和名称一致性。

Migration 可以使用 `{ directory, packageName? }` 加载单个来源，也可以使用 `sources: [{ packageName, directory }]` 加载多个 package。所有 migration 的 `name` 必须全局唯一，执行顺序按 `name` 排序。

Migration context 顶层只暴露 `builder`、`query` 和 `connection`。不在顶层公开 `schema`；底层 adapter client 兜底通过 `connection.client()`。

详见 [Migration](../migration/overview.md) 和 [Migration 维护清单](../migration/maintenance.md)。

## Seed

Seed 入口：

- `defineSeed(definition)`：定义一次性安装数据初始化。
- `database.createSeeder(options)`：创建绑定当前 Database Manager 的 seed runner。
- `createSeeder({ database, ...options })`：底层 seed runner 工厂。
- `seeder.run()`：执行 pending seeds。
- `loadSeeds(options)`：加载并校验 seed sources。
- `validateSeeds(options)`：只校验 seed 文件。

Seed 支持 `{ directory, packageName? }` 和 `sources: [{ packageName, directory }]`。所有 seed 的 `name` 全局唯一并决定执行顺序。Seed context 只暴露 `query` 和 `connection`。

详见 [Seed](../seed/overview.md) 和 [Seed 维护清单](../seed/maintenance.md)。

## Builder

- `createCollection(name, input, options?)`
- `createCollections(inputs, options?)`
- `hasCollection(name)`
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
- `apply(operations, options?)`

## Metadata

- `CollectionMetadataStore`：唯一的 V1 补充 Metadata Store 接口，读写强制使用 revision。
- `InMemoryCollectionMetadataStore`：用于测试和显式临时场景的内存 CAS 文档后端。
- `DatabaseCollectionMetadataStore`：使用自包含内部表持久化 V1 文档的可写 CAS 后端。
- `ModuleCollectionMetadataStore`：从已导入模块加载 V1 文档、使用内容 SHA revision 的只读后端。
- `TransactionCollectionMetadataStore`：为非数据库文档 Store 提供事务内隔离、CAS 回放和失败补偿的 overlay。
- `CollectionMetadataConflictError`：compare-and-swap 失败，稳定 code 为 `METADATA_CONFLICT`。
- `CollectionMetadataService`：在文档 Store 之上执行 collection/field/relation patch、校验、CAS 和提交后失效。
- `CollectionMetadataPatchError`：patch 或 update options 非法，稳定 code 为 `COLLECTION_METADATA_PATCH_INVALID`。
- `defineCollectionMetadata(document)`：为 Metadata V1 文档提供 TypeScript 类型辅助，不执行运行时校验。
- `validateCollectionMetadataDocument(input)`：严格校验并返回独立的、规范化的 Metadata V1 文档。
- `extractLegacyCollectionMetadata(input, options?)`：从旧 Collection 定义中按允许列表提取补充元数据和迁移诊断。
- `CollectionMetadataValidationError`：Metadata 文档校验错误，通过 `issues` 暴露稳定的 code、path 和 message。

`capabilities.writable` 只描述 Metadata 文档后端能否写入，不代表 Collection 记录可写，也不控制 DDL。
Writable JSON/YAML File Store 尚未实现。

## Collection Resolver

- `CollectionResolver.resolve(input)`：合并物理 Schema 与补充 Metadata，并执行单 Collection 本地校验。
- `resolveCollection(input)`：与 class 入口等价的纯函数。
- `CollectionResolutionInput`：单次解析的物理 Schema、可选 Metadata、Connection naming 和 Naming Index 上下文。
- `CollectionResolutionResult`：解析后的 Collection、原始 inspection 完整性和 warning。
- `CollectionResolutionContext`：按物理 `{ schema, tableName }` 解析目标 Collection identity。
- `CollectionResolutionError`：单 Collection 解析聚合错误，通过 `issues` 暴露稳定 code、path 和 message。

详见 [Collection Resolver 设计](../collection/collection-resolver.md)。

## Collection Registry

- `connection.collections.get(name)`：按逻辑名称惰性读取完整 `CollectionDefinition`。
- `connection.collections.getResolution(name)`：读取带 inspection 和 warnings 的完整解析结果。
- `connection.collections.list(options?)`：分页读取轻量 Collection 摘要，不解析 fields。
- `connection.collections.scan(options?)`：显式全量 introspection 与解析。
- `connection.collections.invalidate(name?)`：清理单项或全部解析缓存。
- `connection.collections.refresh(name)`：清理单项并立即重读。
- `connection.collections.validateRelations(name?)`：对一个可达关系图或全部 Collection 执行跨 Collection 校验。
- `connection.collectionMetadata`：Connection 上的 `CollectionMetadataService`。

详见 [Collection Registry 设计](../collection/collection-registry.md)。

## Adapter

- `SchemaAdapter`：schema operation 执行接口。
- `NoopSchemaAdapter`：测试和 dry-run 友好的空实现。
- `KnexSchemaAdapter`：基于 Knex 的 schema adapter。

## Reference

- [DatabaseConfig](./database-config.md)
- [Query API](./query-api.md)
- [Migration](../migration/overview.md)
- [Migration 维护清单](../migration/maintenance.md)
- [Seed](../seed/overview.md)
- [Seed 维护清单](../seed/maintenance.md)
- [Repository 概览（规划中）](../repository/overview.md)
- [Repository Select AST（规划中）](../repository/select-ast.md)
- [Repository Filter Builder（规划中）](../repository/filter-builder.md)
- [Repository Filter AST（规划中）](../repository/filter-ast.md)
- [Repository Sort AST（规划中）](../repository/sort-ast.md)
- [CollectionDefinition](./collection-definition.md)
- [Collection Metadata Document](./collection-metadata-document.md)
- [FieldDefinition](./field-definition.md)
- [CollectionOperation](./collection-operation.md)
- [BuilderExecOptions](./builder-options.md)
- [BuilderResult](./builder-result.md)
- [术语表](./glossary.md)

## Development

- [源码与测试目录结构](../development/source-layout.md)
- [Agent 开发指南](../development/agent-guide.md)
