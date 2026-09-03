---
title: @nocobase/db API 索引
description: 当前已实现并公开的 Database、Builder、Query、Collections、Schema Inspector、Migration、Seed 和 Metadata API。
---

# `@nocobase/db` API 索引

本页只列当前已经实现并公开的主要 API。所有公开 API 都从根入口 `@nocobase/db` 导入；不要从源码深路径或 `internal/` 导入。Repository 等规划接口不属于当前 API。

## Database

### 创建与配置

- `createDatabaseManager(config)`：创建 `DatabaseManager`。
- `defineDatabase(config)`：配置类型辅助函数，原样返回输入。
- `DatabaseConfig` / `ConnectionConfig`：Manager 和 Connection 配置。

文档：[`createDatabaseManager()`](../database/create-database-manager.md)、[连接配置](../database/connections.md)、[`DatabaseConfig`](./database-config.md)。

### DatabaseManager

- `connection(name?)`
- `builder(name?)`
- `query(name?)`
- `transaction(fn, name?)`
- `createMigrator(options)`
- `createSeeder(options)`
- `connect(name?)`
- `disconnect(name?)`
- `reconnect(name?)`
- `destroy()`

文档：[DatabaseManager](../database/database-manager.md)。

### DatabaseConnection

- `name`
- `driver`
- `dialect`
- `schemaManagement`
- `capabilities`
- `builder`
- `query`
- `collections`
- `collectionMetadata`
- `schema`
- `schemaInspector`
- `client()`
- `connect()` / `disconnect()` / `reconnect()`
- `transaction(fn)`

文档：[DatabaseConnection](../database/database-connection.md)、[事务](../database/transactions.md)。

## Builder

- Collection：`createCollection()`、`createCollections()`、`hasCollection()`、`alterCollection()`、`dropCollection()`、`renameCollection()`
- View：`createViewCollection()`、`replaceViewCollection()`、`createMaterializedViewCollection()`、`refreshMaterializedViewCollection()`
- Field：`addField()`、`alterField()`、`dropField()`
- Index：`addIndex()`、`dropIndex()`
- Constraint：`addConstraint()`、`dropConstraint()`
- Plan：`apply()`

文档：[Builder 总览](../builder/overview.md)、[`CollectionOperation`](./collection-operation.md)、[`BuilderExecOptions`](./builder-options.md)、[`BuilderResult`](./builder-result.md)。

## Query

- 入口：`selectFrom()`、`insertInto()`、`updateTable()`、`deleteFrom()`
- 执行：`execute()`、`executeTakeFirst()`、`executeTakeFirstOrThrow()`
- 便捷结果：`value()`、`pluck()`、`exists()`
- 编译和不可变清理：`compile()`、`clearSelect()`、`clearWhere()`、`clearJoins()`、`clearGroupBy()`、`clearHaving()`、`clearOrderBy()`、`clearLimit()`、`clearOffset()`（按 Query 类型提供）

文档：[QueryAdapter 总览](../query/overview.md)、[Query API Reference](./query-api.md)。

## Collections

- `connection.collections.get(name)`
- `getPhysical(name)`
- `getResolution(name)`
- `list(options?)`
- `scan(options?)`
- `invalidate(name?)`
- `refresh(name)`
- `validateRelations(name?)`

文档：[`connection.collections`](../collections/overview.md)。

## Schema Inspector

- `listSchemas()`
- `getPhysicalCollection(identifier)`
- `listPhysicalCollections(options?)`
- `scanPhysicalCollections(options?)`

文档：[`connection.schemaInspector`](../schema-inspector/overview.md)。

## Migration

- `defineMigration(definition)`：定义 Migration 文件。
- `database.createMigrator(options)`：创建绑定当前 Manager 的 runner。
- `createMigrator({ database, ...options })`：底层工厂。
- `latest()` / `upTo(name)` / `rollback()`：执行和回滚。
- `loadMigrations(options)` / `validateMigrations(options)`：加载或只校验 sources。

文档：[Migration 概览](../migration/overview.md)、[`defineMigration()`](../migration/define-migration.md)、[`db.createMigrator()`](../migration/create-migrator.md)、[Migration 测试](../migration/testing.md)。

## Seed

- `defineSeed(definition)`：定义 Seed 文件。
- `database.createSeeder(options)`：创建绑定当前 Manager 的 runner。
- `createSeeder({ database, ...options })`：底层工厂。
- `run()`：执行 pending Seeds。
- `loadSeeds(options)` / `validateSeeds(options)`：加载或只校验 sources。

文档：[Seed 概览](../seed/overview.md)、[`defineSeed()`](../seed/define-seed.md)、[`db.createSeeder()`](../seed/create-seeder.md)。

## Collection Metadata

### 定义与校验

- `defineCollectionMetadata(document)`
- `validateCollectionMetadataDocument(input)`
- `CollectionMetadataValidationError`

### Store

- `CollectionMetadataStore`
- `ModuleCollectionMetadataStore`
- `InMemoryCollectionMetadataStore`
- `CollectionMetadataConflictError`

### Service

- `connection.collectionMetadata`
- `CollectionMetadataPatchError`

`CollectionMetadataService` 是 `connection.collectionMetadata` 的返回类型，不应由应用直接实例化。

文档：[Collection Metadata 概览](../collection-metadata/overview.md)、[Metadata Store](../collection-metadata/metadata-store.md)、[Metadata Service](../collection-metadata/collection-metadata-service.md)、[Metadata Document](./collection-metadata-document.md)。

### 专用迁移工具

- `extractLegacyCollectionMetadata(input, options?)`

该函数只用于显式转换旧完整 Collection 定义，不是普通业务 API，也不是运行时 fallback。详见[旧 Collection 定义转换](./legacy-collection-metadata-extraction.md)。

## 内部实现边界

Database 与 Transaction Metadata Store、Schema Adapter、Query Knex Adapter、Connection Factory 和 Knex Connection 都是包内实现。业务 Schema 变更使用 Builder，查询使用 `connection.query`；不要自行组合内部实现。

## 当前不可调用

Repository、Select AST、Filter Builder、Filter AST 和 Sort AST 当前是设计规划，不属于公开运行时 API。相关页面只用于未来设计讨论，不应复制到当前业务代码。

## Agent 入口

- [任务路由](../agent/task-router.md)
- [实现护栏](../agent/guardrails.md)
- [验证指南](../agent/verification.md)
