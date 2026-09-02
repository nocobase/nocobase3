# Collection Builder Prototype

这是一个用于验证 Collection Builder、数据库连接管理和真实数据库兼容性的 TypeScript 原型。

当前原型的重点是：保留 `Collection` 作为应用层数据模型抽象，通过 `CollectionBuilder` 把 Collection DSL 编译并应用到底层数据库 Schema。默认底层适配器基于 Knex，如有需要可以增加其他适配器。

## 核心目标

- 用 Collection DSL 屏蔽数据库方言差异。
- 用 Collection Builder 管理建表、改表、字段、约束、索引和视图。
- 用 metadata-only API 补充应用层元信息，而不修改数据库结构。
- 用 `CollectionOperation[]` 表达可解释、可 dry-run、适合 Agent apply/diff 的变更计划。
- 用真实数据库集成测试验证 SQLite、PostgreSQL、MySQL、Oracle、SQL Server 的行为。

## 快速开始

```ts
import { createDatabaseManager } from '@nocobase/db';

const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: ':memory:',
    },
  },
});

await db.builder().createCollection('orders', (collection) => {
  collection.increments('id');
  collection.belongsTo('customer', 'customers');
  collection.decimal('amount', { precision: 12, scale: 2 });
});

await db.destroy();
```

## 文档入口

- [快速开始](./docs/zh-CN/quick-start.md)
- [整体概览](./docs/zh-CN/overview.md)
- [Collection 概念](./docs/zh-CN/concepts/collection.md)
- [Metadata 概念](./docs/zh-CN/concepts/metadata.md)
- [命名概念](./docs/zh-CN/concepts/naming.md)
- [Builder API 总览](./docs/zh-CN/builder/overview.md)
- [QueryAdapter 概览](./docs/zh-CN/query/overview.md)
- [Migration](./docs/zh-CN/migration/overview.md)
- [Migration 测试](./docs/zh-CN/migration/testing.md)
- [Repository 规划](./docs/zh-CN/repository/overview.md)
- [Repository Select AST 规划](./docs/zh-CN/repository/select-ast.md)
- [Repository Filter Builder 规划](./docs/zh-CN/repository/filter-builder.md)
- [Repository Filter AST 规划](./docs/zh-CN/repository/filter-ast.md)
- [Repository Sort AST 规划](./docs/zh-CN/repository/sort-ast.md)
- [数据库概览](./docs/zh-CN/database/overview.md)
- [真实数据库集成测试](./docs/zh-CN/testing/integration.md)
- [源码与测试目录结构](./docs/zh-CN/development/source-layout.md)
- [Agent 开发指南](./docs/zh-CN/development/agent-guide.md)
- [API 索引](./docs/zh-CN/reference/api-index.md)
- [术语表](./docs/zh-CN/reference/glossary.md)

## 文档目录结构

```text
README.zh-CN.md
docs/
  zh-CN/
    quick-start.md
    overview.md
    concepts/
      collection.md
      metadata.md
      database-abstraction.md
      naming.md
    builder/
      overview.md
      create-collection.md
      alter-collection.md
      naming.md
      fields.md
      relations.md
      constraints-and-indexes.md
      view-collections.md
      metadata-only.md
      apply-operations.md
      dialect-capabilities.md
    database/
      overview.md
      connections.md
      manager-and-connection.md
      transactions.md
    query/
      overview.md
      select.md
      where.md
      joins.md
      aggregates.md
      mutations.md
      naming.md
      compile.md
    migration/
      overview.md
      testing.md
      maintenance.md
    repository/
      overview.md
      select-ast.md
      filter-builder.md
      filter-ast.md
      sort-ast.md
    testing/
      integration.md
    development/
      source-layout.md
      agent-guide.md
    reference/
      api-index.md
      database-config.md
      query-api.md
      collection-definition.md
      field-definition.md
      collection-operation.md
      builder-options.md
      builder-result.md
      glossary.md
```

## 常用命令

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
```

默认集成测试使用内存 SQLite：

```bash
npm run test:integration
# 或使用显式名称
npm run test:integration:sqlite
```

单独启动并测试 PostgreSQL：

```bash
npm run test:db:up:postgres
npm run test:integration:postgres
```

单独启动并测试 MySQL：

```bash
npm run test:db:up:mysql
npm run test:integration:mysql
```

单独启动并测试 Oracle：

```bash
npm run test:db:up:oracle
npm run test:integration:oracle
```

单独启动并测试 SQL Server：

```bash
npm run test:db:up:mssql
npm run test:integration:mssql
```

启动并测试包括 SQLite 在内的完整数据库矩阵：

```bash
npm run test:db:up:all
npm run test:integration:all
```

停止并清理测试数据库：

```bash
npm run test:db:down
```

## 当前边界

- 当前只实现了 Collection Builder，没有实现 Collection Generator。
- 当前没有 Repository、Repository Select AST、Repository Filter Builder、Repository
  Filter AST、Repository Sort AST、Model、Transformer。
- Schema Adapter 默认基于 Knex。
- `check` constraint 已建模，但还没有完整编译到 SQL。
- `dropConstraint` 当前实现仍较基础，后续需要按 constraint 类型增强。
- `BuilderExecOptions` 中 `ifNotExists`、`ifExists`、`transaction` 是预留扩展，当前不要把它们当成运行时保证；当前主要验证 `dryRun`、`previewSql`、`syncMetadata` 和 `strict`。
