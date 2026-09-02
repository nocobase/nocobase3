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
- `field.name` 是应用层字段名。
- 物理表名由可选 `tablePrefix` 和 Collection 逻辑名确定性生成。
- 物理列名由 Field 逻辑名确定性生成。
- `title`、`description` 是应用层元信息。
- `db.comment`、`db.nativeType` 是数据库层配置。

## 当前模块

- `CollectionBuilder`：创建、修改、删除 Collection 和字段。
- `CollectionOperation[]`：可解释的变更计划，适合 Agent 和 file sync diff。
- `SchemaAdapter`：底层数据库 schema 操作接口。
- `KnexSchemaAdapter`：基于 Knex 的 SchemaAdapter。
- `DatabaseManager`：管理多数据库连接。
- `QueryAdapter`：数据库层 Query Builder，Repository 尚未实现。
- `Migration`：版本化数据库变更 runner，负责加载 migration、执行 pending、写 history、控制事务和 lock。
- `Repository`：计划中的 Collection-aware 数据访问层，当前未实现。
- `Select AST`：计划中的 Repository 结果选择树，当前未实现。
- `Repository Filter Builder`：计划中的应用层筛选条件 DSL，当前未实现。
- `Sort AST`：计划中的 Repository 排序结构，当前未实现。
- `CollectionMetadataStore`：补充 Metadata 文档契约；managed Connection 默认使用持久化 Database 后端。

## 文档地图

- 快速理解主线见 [快速开始](./quick-start.md)。
- Builder 用法见 [Builder API 总览](./builder/overview.md)。
- Query 用法见 [QueryAdapter 概览](./query/overview.md)。
- Migration 用法见 [Migration](./migration/overview.md)，具体 migration 的测试模式见
  [Migration 测试](./migration/testing.md)，内部维护规则见
  [Migration 维护清单](./migration/maintenance.md)。
- Repository 规划见 [Repository 概览](./repository/overview.md)。
- Repository 结果选择设计见 [Select AST](./repository/select-ast.md)。
- Repository filter 设计见 [Filter Builder](./repository/filter-builder.md) 和 [Filter AST](./repository/filter-ast.md)。
- Repository 排序设计见 [Sort AST](./repository/sort-ast.md)。
- 命名策略见 [命名概念](./concepts/naming.md)。
- `underscored` 的转换算法和跨层行为见 [underscored 命名规则](./concepts/underscored.md)。
- Collection 的解析与 Metadata Store 设计见 [Collection 架构](./collection/architecture.md)。
- 数据库连接见 [Database 概览](./database/overview.md)。
- 真实数据库测试见 [集成测试](./testing/integration.md)。
- 开发维护说明见 [源码与测试目录结构](./development/source-layout.md) 和 [Agent 开发指南](./development/agent-guide.md)。
- 类型参考见 [Reference](./reference/api-index.md)。
- 术语统一见 [术语表](./reference/glossary.md)。

## Agent 注意事项

Agent 的推荐 DSL 取决于输出载体：

- 写 migration 文件、插件代码或其他 TypeScript 代码时，优先使用 Fluent DSL。
- Migration 文件固定使用 `export default defineMigration({})`。
- Migration context 顶层只有 `builder`、`query`、`connection`；不公开 `schema`，adapter client 只通过 `connection.client()` 兜底。
- 调用 HTTP API、CLI，或生成 `collection.json` 这类可序列化配置时，优先使用 Object DSL。
- 做 file sync、snapshot diff、执行计划审计或批量 apply 时，优先使用 `CollectionOperation[]`。
- `db.query()` 使用 Connection 的 `underscored` 配置，但不读取 Collection Metadata，也不自动应用 Collection 表前缀。
- 未来写 Repository 数据访问代码时，结果字段和 relation 使用 Select AST，排序使用
  Sort AST。
- 未来写 Repository 数据访问代码时，筛选条件优先使用 `filter: (filter) => ...` 的 Filter Builder。
- 当前 Repository、Select AST、Filter Builder、Filter AST 和 Sort AST 还没有实现，
  不要把规划接口当作可运行代码。

对 destructive 操作，例如 `dropField`、`dropCollection`，应先使用：

```ts
await builder.apply(operations, {
  dryRun: true,
  previewSql: true,
});
```
