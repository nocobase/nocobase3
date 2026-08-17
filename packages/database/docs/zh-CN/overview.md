# 概览

本项目验证一套以 Collection 为中心的数据建模体系。Collection 是应用层 DSL，不直接等同于数据库表结构。它向下屏蔽数据库方言差异，向上为应用、插件、CLI、HTTP API 和 Agent 提供统一的数据模型描述。

## 主线

```text
Collection DSL -> Collection Builder -> Schema Adapter -> Database
```

当前已经实现的是上面这条 Builder 主线。它负责从 Collection DSL 创建或修改数据库结构，并同步应用层元数据。

目标架构中还有另一条路径：

```text
Database Schema -> Inspector -> Collection Generator -> Collection DSL
```

`Collection Generator` 用于已有数据库场景，但当前原型还没有实现。

## 为什么需要 Collection

数据库之间存在数据类型、索引、约束、视图、schema、comment 等差异。如果应用和 Agent 直接操作数据库 Schema，就会被具体数据库方言绑定。

Collection 提供一层稳定的应用抽象：

- `collection.name` 是应用层名称。
- `collection.tableName` 是物理表或视图名覆盖。
- `field.name` 是应用层字段名。
- `field.columnName` 是物理列名覆盖。
- `title`、`description` 是应用层元信息。
- `db.comment`、`db.nativeType` 是数据库层配置。

## 当前模块

- `CollectionBuilder`：创建、修改、删除 Collection 和字段。
- `CollectionOperation[]`：可解释的变更计划，适合 Agent 和 file sync diff。
- `SchemaAdapter`：底层数据库 schema 操作接口。
- `KnexSchemaAdapter`：第一版 Knex 实现。
- `DatabaseManager`：管理多数据库连接。
- `QueryAdapter`：当前很薄的查询适配器，Repository 尚未实现。
- `InMemoryCollectionMetadataStore`：当前原型使用的内存元数据存储。

## 文档地图

- 快速理解主线见 [快速开始](./quick-start.md)。
- Builder 用法见 [Builder API 总览](./builder/overview.md)。
- 命名策略见 [命名映射](./builder/naming.md)。
- 数据库连接见 [数据库连接](./database/connections.md)。
- 真实数据库测试见 [集成测试](./testing/integration.md)。
- 类型参考见 [Reference](./reference/api-index.md)。
- 术语统一见 [术语表](./reference/glossary.md)。

## Agent 注意事项

Agent 的推荐 DSL 取决于输出载体：

- 写 migration 文件、插件代码或其他 TypeScript 代码时，优先使用 Fluent DSL。
- 调用 HTTP API、CLI，或生成 `collection.json` 这类可序列化配置时，优先使用 Object DSL。
- 做 file sync、snapshot diff、执行计划审计或批量 apply 时，优先使用 `CollectionOperation[]`。
- `db.query()` 只做物理查询名的轻量归一化，不读取 Collection metadata。

对 destructive 操作，例如 `dropField`、`dropCollection`，应先使用：

```ts
await builder.apply(operations, {
  dryRun: true,
  previewSql: true,
});
```
