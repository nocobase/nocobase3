---
title: DB 包集成测试
description: 说明 @nocobase/db 的 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server 集成测试环境与命令。
---

# DB 包集成测试

`tests/integration` 是真实数据库连接测试，不是 mock，也不是 SQLite 专属目录。

同一批 Collection Builder 用例可以跑在：

- SQLite
- PostgreSQL
- MySQL
- Oracle
- SQL Server

## 默认测试

默认使用内存 SQLite：

```bash
npm run test:integration
npm run test:integration:sqlite
```

## 覆盖率

```bash
npm run test:coverage
```

覆盖率统计只包含 `src/**/*.ts` 中有运行时行为的源码，不包含入口 barrel、纯类型文件、`dist` 和测试文件。

## 启动真实数据库

每个数据库都有对应的启动和测试命令：

```bash
npm run test:db:up:postgres
npm run test:integration:postgres

npm run test:db:up:mysql
npm run test:integration:mysql

npm run test:db:up:oracle
npm run test:integration:oracle

npm run test:db:up:mssql
npm run test:integration:mssql
```

所有启动命令都会等待数据库通过 Docker Compose healthcheck 后再返回。Oracle 和 SQL Server 镜像较大，启动时间更长。

默认端口：

```text
PostgreSQL: 127.0.0.1:15432
MySQL:      127.0.0.1:13306
Oracle:     127.0.0.1:11521/FREEPDB1
SQL Server: 127.0.0.1:11433
```

## 全矩阵测试

```bash
npm run test:db:up:all
npm run test:integration:all
```

`all` 包含 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server，因此运行前需要启动所有服务。

等价于：

```bash
INTEGRATION_DB_CONNECTIONS=all vitest run tests/integration
```

## 指定数据库

优先使用 `test:integration:<database>` 命令。临时组合多个数据库时，可以直接向 Vitest 传递连接矩阵：

```bash
INTEGRATION_DB_CONNECTIONS=postgres,mysql pnpm exec vitest run tests/integration
INTEGRATION_DB_CONNECTIONS=oracle,mssql pnpm exec vitest run tests/integration
```

Oracle 测试使用 `gvenzl/oracle-free:23-slim-faststart` 和 `oracledb` Thin mode，不需要 Oracle Instant Client。

SQL Server 可以直接运行 `npm run test:integration:mssql`。测试使用 `mcr.microsoft.com/mssql/server:2022-latest` 和 `tedious`；Apple Silicon 通过 `linux/amd64` 模拟运行，因此启动时间会更长。`mssql-init` 会创建独立的 `nocobase_collection_builder` 测试数据库。

底层 helper 也支持使用 `DB_CONNECTION` 指定单个连接：

```bash
DB_CONNECTION=postgres pnpm exec vitest run tests/integration
```

## 清理数据库

```bash
npm run test:db:down
```

## 测试设计

Integration helper 会为每个测试生成唯一表名前缀，避免并行测试互相影响。测试结束后会清理该前缀下的表和视图。

真实数据库测试目录按能力拆分：

```text
tests/integration/
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

Builder 真实测试覆盖：

- create collection
- alter collection
- relations
- constraints and indexes
- view collection
- metadata-only updates
- apply and dryRun
- rename collection

Query 真实测试覆盖：

- select / value / pluck / exists
- where expression builder
- join
- subquery
- aggregate / groupBy / having
- insert / update / delete
- transaction
- naming / underscored / alias
- compile

## Agent 注意事项

- 修改 Builder 编译或 adapter 行为后，应跑 `npm run test:integration:all`。
- SQLite 通过不代表 PostgreSQL、MySQL、Oracle 或 SQL Server 一定通过。
- 方言问题应优先通过真实集成测试验证。
