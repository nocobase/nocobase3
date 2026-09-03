---
title: DB 文档目录
description: 按公开 API、Agent 任务、开发维护、内部实现、未来提案和历史归档列出 @nocobase/db 的完整文档地图。
---

# DB 文档目录

本页列出 `@nocobase/db` 的全部文档。编写当前业务代码时，优先阅读“开始使用”“Agent 任务指南”和各公开 API 主题；`internals/`、`proposals/` 与 `archive/` 具有不同的使用边界。

## 如何选择

| 目标              | 从这里开始                                                                           |
| ----------------- | ------------------------------------------------------------------------------------ |
| 第一次使用 DB 包  | [DB 概览](./overview.md)和[快速开始](./quick-start.md)                               |
| 让 Agent 实现业务 | [Agent 任务路由](./agent/task-router.md)                                             |
| 按 API 名查文档   | [API 索引](./reference/api-index.md)                                                 |
| 维护 DB 包源码    | [源码与测试布局](./development/package-layout.md)和[内部实现](./internals/README.md) |

| 文档区域                | 用途                                 | 能否指导当前业务代码     |
| ----------------------- | ------------------------------------ | ------------------------ |
| 公开主题与 `reference/` | 当前 API、行为与类型参考             | 可以；类型声明是最终依据 |
| `agent/`                | 从业务任务路由到 API、代码位置和验证 | 可以                     |
| `development/`          | 维护 DB 包、Migration 和 Seed        | 仅用于对应维护任务       |
| `internals/`            | 当前内部实现和诊断                   | 不应据此绕过公开 API     |
| `proposals/`            | 尚未实现的设计                       | 不可以                   |
| `archive/`              | 已被替代的历史材料                   | 不可以                   |

## 开始使用

- [`@nocobase/db` 概览](./overview.md)：理解包的能力、对象关系、阅读路径和当前边界。
- [快速开始](./quick-start.md)：运行 DatabaseManager、Migration、Seed、Query、Transaction 和 Collections 的最小完整流程。

## Agent 任务指南

- [AI Agent 数据库开发入口](./agent/index.md)：查看 Agent 核心对象、最高优先级规则和能力状态。
- [Agent 任务路由](./agent/task-router.md)：根据业务目标选择 API、文件位置、必读文档和最低验证。
- [使用 Migration 实现业务 Schema 变更](./agent/implement-schema-change.md)：新增或修改 Collection、Field、Index 和 Constraint。
- [使用 Query 和 Transaction 实现数据访问](./agent/implement-data-access.md)：实现记录查询、写入和原子操作。
- [使用 Seed 实现安装默认数据](./agent/implement-seed-data.md)：创建幂等的一次性安装数据。
- [选择 Collections、Schema Inspector 与 Metadata API](./agent/work-with-collections-and-metadata.md)：区分物理 Schema、完整 Collection 和补充 Metadata。
- [接入外部数据库](./agent/connect-external-database.md)：配置 external Connection 并组合 Inspector、Module Metadata、Collections 和 Query。
- [Agent 实现护栏](./agent/guardrails.md)：检查禁止接口、事务、命名、Migration 和跨数据库约束。
- [Agent 验证指南](./agent/verification.md)：按变更范围选择测试、类型检查、构建和多方言验证。

## 核心概念

- [核心概念入口](./concepts/README.md)：建立 Collection、Metadata 和命名的基础心智模型。
- [Collection 概念](./concepts/collection.md)：区分逻辑 Collection、物理数据库对象、Metadata 和记录查询。
- [Metadata 概念](./concepts/metadata.md)：区分物理事实、补充 Metadata 和解析后的 CollectionDefinition。
- [命名概念](./concepts/naming/overview.md)：区分逻辑名、Connection 相对查询标识符和物理名称。
- [`tablePrefix` 表前缀](./concepts/naming/table-prefix.md)：理解 Connection 默认前缀、Collection 覆盖和 Query 边界。
- [`underscored` 命名规则](./concepts/naming/underscored.md)：理解默认命名转换和各入口的作用范围。

## DatabaseManager 与 Connection

- [Database 概览](./database/overview.md)：从 Manager 选择 Connection，并理解快捷 API 与连接级能力。
- [`createDatabaseManager()`](./database/create-database-manager.md)：配置并创建应用级 DatabaseManager。
- [数据库连接配置](./database/connections.md)：配置 SQLite、PostgreSQL、MySQL、Oracle、SQL Server、命名和 external 模式。
- [DatabaseManager](./database/database-manager.md)：使用默认连接快捷 API、Migrator、Seeder 和生命周期方法。
- [DatabaseConnection](./database/database-connection.md)：使用 dialect、builder、query、collections、schemaInspector 和 collectionMetadata。
- [Database Transaction](./database/transactions.md)：通过 Manager 或 Connection 事务传播同一个事务 Connection。

## Collection Builder

- [Collection Builder 总览](./builder/overview.md)：选择 `db.builder()` 或 `connection.builder`，并理解 Schema 变更边界。
- [创建 Collection](./builder/create-collection.md)：通过 Object DSL 或 Fluent DSL 创建数据库表。
- [修改 Collection](./builder/alter-collection.md)：新增、修改或删除 Field、Index 和 Constraint。
- [Builder 字段定义](./builder/fields.md)：配置 Field 类型、默认值和物理列选项。
- [Builder 关系字段](./builder/relations.md)：定义四种 Relation Metadata，并区分本地列和数据库外键。
- [Builder 约束与索引](./builder/constraints-and-indexes.md)：定义完整性约束、性能索引并处理当前能力限制。
- [创建与维护 View Collection](./builder/view-collections.md)：创建、替换和刷新 View 或 Materialized View。
- [Builder 命名](./builder/naming.md)：处理 `underscored`、`tablePrefix` 和 rename 安全边界。
- [Builder 方言能力](./builder/dialect-capabilities.md)：处理不同数据库的 warning、fallback 和 strict 模式。
- [批量应用 CollectionOperation](./builder/apply-operations.md)：执行结构化操作、dry-run、SQL 预览和影响审计。

## QueryAdapter

- [QueryAdapter 概览](./query/overview.md)：选择数据库层查询入口并理解 Query 与 Repository 的边界。
- [select 查询](./query/select.md)：选择字段、设置别名、分页并使用终止方法。
- [where 条件](./query/where.md)：使用三参条件、ExpressionBuilder、exists 和子查询。
- [join](./query/joins.md)：使用跨数据库 join 和 callback join。
- [聚合与 having](./query/aggregates.md)：使用聚合表达式、groupBy 和 having。
- [数据写入](./query/mutations.md)：执行 insert、update、delete 并防止意外全表操作。
- [Query 命名归一化](./query/naming.md)：理解 identifier 转换、结果 key 和 Collection naming 边界。
- [Query 编译与清除条件](./query/compile.md)：检查编译 SQL、复用不可变 Query Builder 并清除查询片段。

## Collections 与 Metadata

- [`connection.collections`](./collections/overview.md)：读取、列举、扫描、刷新和校验完整 Collection。
- [Collection Metadata 概览](./collection-metadata/overview.md)：选择 Metadata Document、Store、Service 或完整 Collection 入口。
- [Metadata Store 与后端](./collection-metadata/metadata-store.md)：配置 Store，并理解 revision 和 compare-and-swap。
- [`connection.collectionMetadata`](./collection-metadata/collection-metadata-service.md)：读取和更新 Collection、Field 与 Relation Metadata。

## Schema Inspector

- [`connection.schemaInspector`](./schema-inspector/overview.md)：通过物理 identity 只读检查数据库结构。
- [Schema Inspector 示例](./schema-inspector/examples.md)：查看五种数据库的读取、分页、扫描和完整性示例。

## Migration

- [Migration 概览](./migration/overview.md)：理解定义、加载、执行历史、锁和回滚。
- [`defineMigration()`](./migration/define-migration.md)：编写自包含、不可变且可回滚的 Migration 文件。
- [`db.createMigrator()`](./migration/create-migrator.md)：绑定 Migration Source 并执行 `latest()`、`upTo()` 或 `rollback()`。
- [Migration 测试](./migration/testing.md)：通过真实 Migrator 验证 Schema、Metadata、数据和回滚结果。

## Seed

- [Seed 概览](./seed/overview.md)：理解一次性安装数据、加载、执行和历史记录。
- [`defineSeed()`](./seed/define-seed.md)：编写幂等、事务安全且不可变的 Seed 文件。
- [`db.createSeeder()`](./seed/create-seeder.md)：绑定 Seed Source，处理 checksum、锁和失败重试。

## API Reference

- [`@nocobase/db` API 索引](./reference/api-index.md)：按公开导出和对象查找参考文档。
- [`DatabaseConfig`](./reference/database-config.md)：查看 Manager、Connection、方言、命名和 Metadata Store 配置类型。
- [`BuilderExecOptions`](./reference/builder-options.md)：查看 dry-run、SQL 预览、Metadata 同步和 strict 等选项。
- [`BuilderResult`](./reference/builder-result.md)：查看 operation、SQL、warning 和影响等级。
- [`CollectionDefinition`](./reference/collection-definition.md)：查看 Collection、Naming、Constraint 和 Index 类型。
- [`FieldDefinition`](./reference/field-definition.md)：查看普通 Field 和 Relation Field 类型。
- [`CollectionOperation`](./reference/collection-operation.md)：查看 Builder 结构化执行计划格式。
- [Collection Metadata Document](./reference/collection-metadata-document.md)：查看文档类型、定义辅助、严格校验和 Store 合同。
- [旧 Collection 定义转换](./reference/legacy-collection-metadata-extraction.md)：仅在显式迁移旧完整定义时使用 `extractLegacyCollectionMetadata()`。
- [QueryAdapter API](./reference/query-api.md)：查看 Query、ExpressionBuilder 和各类终止方法的接口。
- [DB 术语表](./reference/glossary.md)：查找当前架构中的核心术语。

## 开发与维护

- [DB 包源码与测试布局](./development/package-layout.md)：按职责定位源码模块与最低测试范围。
- [DB 包集成测试](./development/integration-testing.md)：运行 SQLite 和其他四种数据库的集成测试。
- [Migration 维护清单](./development/migration-maintenance.md)：维护 Migration 接口、不变性、事务和测试。
- [Seed 维护清单](./development/seed-maintenance.md)：维护 Seed 接口、顺序、事务和历史记录。

## 当前内部实现

> 本组文档用于维护或诊断 `@nocobase/db`，不应据此绕过公开 API。

- [内部实现入口](./internals/README.md)：选择 Collection、Metadata 或 Schema Inspector 内部主题。

### Collection 解析

- [Collection 当前架构](./internals/collection/architecture.md)：理解 Physical Schema、Metadata、Resolver、Registry 和 Builder 的关系。
- [Collection 解析生命周期](./internals/collection/resolution-lifecycle.md)：跟踪命名索引、读取、解析、缓存、失效和事务传播。
- [Collection Resolver](./internals/collection/resolver.md)：理解合并顺序、命名、结构冲突和完整性 warning。
- [Collection Registry](./internals/collection/registry.md)：理解 Naming Index、并发加载、generation 和 Relation 图校验。

### Metadata

- [Metadata Store 内部契约](./internals/metadata/store.md)：理解权威来源、Store 接口、CAS 和事务不变式。
- [Metadata Store 后端](./internals/metadata/store-backends.md)：理解 Database、Module、In-memory 和 Transaction 后端。
- [Collection Metadata Service](./internals/metadata/service.md)：理解 patch、校验、冲突和 Registry 失效流程。

### Schema Inspector

- [Schema Inspector 内部架构](./internals/schema-inspector/architecture.md)：理解公共接口、方言适配层和组件边界。
- [物理 Schema 模型](./internals/schema-inspector/physical-schema-model.md)：理解 Collection、Column、Constraint、Index 和 inspection 数据结构。
- [Schema Inspector 方言行为](./internals/schema-inspector/dialects.md)：比较五种数据库的 schema 范围和不完整读取语义。
- [分页、完整性与错误](./internals/schema-inspector/pagination-and-errors.md)：理解 filter、cursor、inspection status 和稳定错误码。

## 未来提案

> 以下接口尚未实现或导出，不能用于当前业务代码。

- [未来提案入口](./proposals/README.md)：了解 Proposal 与当前 API 的边界。
- [Repository 提案](./proposals/repository/overview.md)：候选的 Collection-aware 查询与写入层。
- [Filter Builder 提案](./proposals/repository/filter-builder.md)：候选的可组合筛选 DSL。
- [Filter AST 提案](./proposals/repository/filter-ast.md)：候选的筛选条件序列化模型。
- [Select AST 提案](./proposals/repository/select-ast.md)：候选的字段与 Relation 选择模型。
- [Sort AST 提案](./proposals/repository/sort-ast.md)：候选的排序表达模型。

## 历史归档

> 以下页面只用于理解版本或设计演进，不能作为当前 API 合同。

- [历史归档入口](./archive/README.md)：查看归档规则和当前替代文档。
- [Collection 确定性物理命名设计历史](./archive/design-history/deterministic-collection-naming.md)：记录命名简化的影响分析。
- [v2 到 v3 的数据源模型变化](./archive/version-history/v2-v3-data-source-model.md)：记录 DataSource、Collection、Field 和查询模型的版本变化。
