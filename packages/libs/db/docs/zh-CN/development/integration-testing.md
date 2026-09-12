---
title: DB 包集成测试
description: 说明各 @nocobase/db dialect 的集成测试环境与命令。
---

# DB 包集成测试

`tests/integration` 是真实数据库连接测试，不是 mock，也不是 SQLite 专属目录。
每个 dialect package 自己拥有测试用的 Docker Compose 文件；运行该
package 的 `test:integration` 会自动创建隔离的 Compose project、分配随机
host port、等待数据库健康、执行测试，并在结束后删除容器和 volume。

同一批 Collection Builder 用例可以跑在：

- SQLite
- PostgreSQL
- MySQL
- Oracle
- SQL Server
- Dameng

## 默认测试

默认使用内存 SQLite：

```bash
pnpm --filter @nocobase/db-sqlite test:integration
```

## 覆盖率

```bash
npm run test:coverage
```

覆盖率统计只包含 `src/**/*.ts` 中有运行时行为的源码，不包含入口 barrel、纯类型文件、`dist` 和测试文件。

## 运行真实数据库测试

每个数据库的集成测试入口会自动管理数据库容器：

```bash
pnpm --filter @nocobase/db-postgres test:integration
pnpm --filter @nocobase/db-mysql test:integration
pnpm --filter @nocobase/db-oracle test:integration
pnpm --filter @nocobase/db-mssql test:integration
pnpm --filter @nocobase/db-dameng test:integration
```

Oracle、SQL Server 和 Dameng 镜像较大，启动时间更长。SQL Server 和
Dameng 的入口会在数据库健康后自动运行各自的初始化 service。

每次运行使用随机 host port，因此多个 dialect 或多个相同 dialect 的
测试进程可以同时运行，互不共享容器、网络和 volume。

## 全矩阵测试

```bash
pnpm --filter @nocobase/db test:integration:all
```

`all` 依次调用 SQLite、PostgreSQL、MySQL、Oracle、SQL Server 和 Dameng
各自的 `test:integration` 入口。每个入口都只清理自己创建的 Compose
project。

## 指定数据库

`@nocobase/db` 中的 `test:integration:<database>` 命令只是转发到对应
dialect package。优先直接调用 dialect package；临时组合多个数据库时，
可以直接向 Vitest 传递连接矩阵：

```bash
INTEGRATION_DB_CONNECTIONS=postgres,mysql pnpm exec vitest run tests/integration
INTEGRATION_DB_CONNECTIONS=oracle,mssql pnpm exec vitest run tests/integration
```

Oracle 测试使用 `gvenzl/oracle-free:23-slim-faststart` 和 `oracledb` Thin mode，不需要 Oracle Instant Client。

SQL Server 可以直接运行 `pnpm --filter @nocobase/db-mssql test:integration`。测试使用 `mcr.microsoft.com/mssql/server:2022-latest` 和 `tedious`；Apple Silicon 通过 `linux/amd64` 模拟运行，因此启动时间会更长。`mssql-init` 会创建独立的 `nocobase_collection_builder` 测试数据库。

底层 helper 也支持使用 `DB_CONNECTION` 指定单个连接：

```bash
DB_CONNECTION=postgres pnpm exec vitest run tests/integration
```

## 保留调试环境

测试结束时会自动清理数据库容器。需要保留失败现场时，可以使用：

```bash
KEEP_TEST_DB=1 pnpm --filter @nocobase/db-mysql test:integration
```

该选项会输出本次 Compose project 名称；排查完成后使用对应 dialect
package 的 Compose 文件和 project name 手动执行 `docker compose down
--volumes --remove-orphans`。

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

## 维护注意事项

- 修改 Builder 编译或 adapter 行为后，应跑 `pnpm --filter @nocobase/db test:integration:all`。
- SQLite 通过不代表 PostgreSQL、MySQL、Oracle、SQL Server 或 Dameng 一定通过。
- 方言问题应优先通过真实集成测试验证。
