# 源码与测试目录结构

这份目录结构面向开发者和 Agent。原则是按职责分层，而不是按底层实现的临时文件名堆放。

## 源码目录

```text
src/
  index.ts

  collection/
    index.ts
    types.ts
    builder/
      builder.ts
      index.ts
    compiler/
      compiler.ts
      index.ts
    fluent/
      index.ts

  database/
    index.ts
    config.ts
    connection.ts
    manager.ts
    factory.ts
    capabilities.ts
    drivers/
      index.ts
      knex/
        index.ts
        config.ts
        client.ts
        connection.ts
        driver.ts

  metadata/
    index.ts
    store.ts
    in-memory-store.ts

  naming/
    index.ts
    strategy.ts
    default-strategy.ts
    utils.ts

  query/
    index.ts
    types.ts
    adapters/
      knex/
        index.ts
        adapter.ts

  schema/
    index.ts
    adapter.ts
    capabilities.ts
    adapters/
      knex/
        index.ts
        adapter.ts
```

## 分层说明

`collection/` 是应用层 Collection DSL。它包含 Builder、编译器、Fluent DSL 和 Collection 类型。

`schema/` 是数据库 schema operation 层。`CollectionBuilder` 编译出的操作最终交给这里的 adapter 执行。

`database/` 是连接管理层，负责多 connection、driver 实例化、事务、client 生命周期，以及把 `builder`、`query`、`schema` 绑定到具体连接。

`query/` 是数据库层 QueryAdapter。V1 的公开类型放在 `query/types.ts`，Knex 实现放在 `query/adapters/knex/`。

`metadata/` 是 Collection metadata 存储接口与默认内存实现。

`naming/` 是逻辑名和数据库 identifier 之间的命名策略，例如 `underscored`、`tablePrefix`、索引名和外键名生成。

## 测试目录

```text
test/
  unit/
    builder/
    database/
    metadata/
    naming/
    schema/
      adapter.test.ts
      adapters/
        knex/
          adapter.test.ts

  integration/
    README.md
    helpers.ts
    builder/
      create-collection.test.ts
      alter-collection.test.ts
      relations.test.ts
      constraints-indexes.test.ts
      view-collection.test.ts
      metadata-only.test.ts
      apply-dry-run.test.ts
      rename-collection.test.ts
      naming.test.ts
      capabilities.test.ts
    query/
      select.test.ts
      where.test.ts
      joins.test.ts
      subquery.test.ts
      aggregates.test.ts
      mutations.test.ts
      transactions.test.ts
      naming.test.ts
      compile.test.ts
```

## 测试分层说明

`test/unit/` 测纯逻辑和编译结果，可以使用 recording adapter 或内存实现，但不应该依赖真实数据库状态。

`test/integration/` 测真实数据库连接，不是 SQLite 专属。默认跑 SQLite，设置 `INTEGRATION_DB_CONNECTIONS=all` 后同一批用例会跑 SQLite、PostgreSQL、MySQL。

`test/integration/builder/` 覆盖 Collection Builder 到真实 DDL 的行为。

`test/integration/query/` 覆盖 QueryAdapter 到真实 SQL 执行的行为。Query 测试按能力拆分，例如 select、where、join、subquery、aggregate、mutation，而不是按内部实现类拆分。

## Agent 注意事项

- 新增 public API 时，优先在对应分层的 `index.ts` 暴露，避免让调用方依赖深层实现文件。
- 新增 Builder 行为时，通常需要同时补 `test/unit/builder/` 和 `test/integration/builder/`。
- 新增 Query 行为时，优先补 `test/integration/query/`，因为 QueryAdapter 的价值在真实数据库行为。
- 不要在 `db.query()` 测试中假设它会读取 Collection metadata；这属于未来 Repository 的职责。
