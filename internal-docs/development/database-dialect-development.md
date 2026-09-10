---
title: Database Dialect 扩展开发
description: NocoBase v3 中新增、测试和发布 @nocobase/db-<dialect> 的开发规范。
---

# Database Dialect 扩展开发

本文说明如何新增 `@nocobase/db-<dialect>`。目标是让 Dialect 的连接配置、Knex 适配、SQL strategy、Schema Inspector 和测试都由自己的 package 负责；新增 Dialect 时不需要修改 `@nocobase/db` 的核心实现。

## 架构边界

```text
@nocobase/db                 公共抽象、生命周期、AST 和通用实现
        ↑
@nocobase/db-testkit         可参数化的共享测试 contract
        ↑
@nocobase/db-<dialect>       连接、driver、strategy、Inspector 和测试
```

`@nocobase/db` 不导入具体 Dialect，也不维护固定的 Dialect union 或按 Dialect 分派的 SQL。app-server 是组合入口，按部署需求安装并注册实际使用的 Dialect。`@nocobase/db-testkit` 只用于测试，不负责连接、环境变量、数据库启动或清理。

新增实现不应把具体数据库 SQL 放回 core，也不应在 core 测试 helper 中静态导入所有 Dialect。

## Package 结构

```text
packages/libs/db-foo/
├── src/
│   ├── index.ts
│   ├── connection.ts
│   ├── json.ts
│   ├── numeric.ts
│   ├── temporal.ts
│   └── inspectors/foo.ts
├── tests/
│   ├── factory.test.ts
│   ├── runtime.test.ts
│   ├── type-strategy.test.ts
│   ├── inspector.test.ts
│   ├── json.test.ts
│   ├── temporal.test.ts
│   └── integration/
│       ├── adapter.ts
│       ├── contract.test.ts
│       └── foo-specific.test.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── eslint.config.js
```

生产代码放在 `src/`，测试放在 `tests/`。真实数据库测试即使原来位于 `unit` 目录，也应按实际依赖归类为 integration 或 Dialect-specific test。

## Driver 和两种初始化方式

Dialect 必须导出 factory，并在 factory 返回的配置中携带 `dialect` 和 `databaseDriver`：

```ts
import foo from '@nocobase/db-foo';
import { createDatabaseManager } from '@nocobase/db';

createDatabaseManager({
  drivers: { foo },
  connections: {
    main: { dialect: 'foo', host: process.env.DB_HOST },
  },
});

createDatabaseManager({
  connections: {
    main: foo({ host: process.env.DB_HOST }),
  },
});
```

两种方式最终必须产生等价的连接行为。driver definition 通常包括：

- `dialect`、`packageName`、`nativeDriver` 和 `knexClient`；
- `resolveConnection`，将 Dialect 配置转换为 Knex 配置；
- `resolveKnexClient` 或 `createKnexClient`；
- `createRuntime`，提供 query、repository、schema 等 strategy；
- `createSchemaInspector`，创建该数据库的 Inspector。

`resolveConnection` 应处理默认值、`driverOptions`、pool、schema、TLS/SSL 等字段，并避免把无意义的 `undefined` 传给 Knex。具体连接字段由 Dialect 自己定义，core 不解析所有数据库的环境变量。

## Runtime 扩展点

按行为拆分文件，避免把所有分支写进 `index.ts`：

| 扩展点 | 典型内容 |
| --- | --- |
| Query | aggregate、分页、returning、identifier quoting、数据库表达式 |
| Repository | JSON filter、numeric mutation、boolean/temporal 编解码、upsert |
| Schema | decimal、float、bigint、JSON、unsigned、generated column、默认值 |
| Inspector | schemas、tables、views、columns、indexes、foreign keys、constraints |
| Native adapter | stream、driver 返回值转换、原生错误和连接行为 |

`PRAGMA`、`information_schema`、`sys.*`、`user_*` 等 catalog SQL 属于对应 Dialect 的 Inspector。类似 `pg-query-stream` 的运行时依赖也必须由 PostgreSQL package 自己加载，不能由 core 加载。

## 依赖声明

`@nocobase/db` 通常作为 peer dependency，以保证进程中只有一个 core 实例；开发时可用 workspace dev dependency 解析。native driver 和生产代码实际加载的辅助包放在 Dialect 的 `dependencies`：

```json
{
  "peerDependencies": { "@nocobase/db": "workspace:^" },
  "dependencies": {
    "knex": "catalog:",
    "foo-driver": "catalog:"
  },
  "devDependencies": {
    "@nocobase/db-testkit": "workspace:*"
  }
}
```

只在测试中使用的包放在 `devDependencies`。如果生产的 `stream()` 会加载 `pg-query-stream`，它必须放在 `dependencies`。新增 native driver 后，还要检查生成应用的 `allowBuilds` 配置。

## 测试分层

### Core unit

`@nocobase/db/tests/unit` 只测试公共抽象：manager 注册和生命周期、migration policy、query/repository AST、命名策略、cursor、公共参数校验和错误归一化。测试不应为了方便而加载所有具体 Dialect。

### Dialect unit

放在 `packages/libs/db-foo/tests`，覆盖 factory、连接解析、Knex client、runtime、类型策略、SQL 编译、JSON、temporal、numeric、Inspector 和 native driver 边界。

### Shared contract

`@nocobase/db-testkit` 提供参数化 contract、fixture、assertion 和生命周期约定。Dialect 包提供自己的 adapter：

```ts
defineDatabaseContractSuite({
  title: 'foo database contract',
  createContext: createFooTestContext,
});
```

testkit 不维护 Dialect 列表，不读取数据库环境变量，不启动或清理具体数据库，也不包含某个数据库的 catalog SQL。

### Integration adapter

`tests/integration/adapter.ts` 由 Dialect 包自己维护，负责真实连接、临时 schema/前缀、cleanup、identifier、fixture 和不可用数据库时的明确错误。共享 contract 和 Dialect-specific integration 都从该 adapter 启动。

## 新增 Dialect 的实施清单

- [ ] 创建 `packages/libs/db-foo`，补齐 package metadata、exports、TypeScript、ESLint 和 Vitest。
- [ ] 声明 `@nocobase/db` peer dependency 和 native runtime dependencies。
- [ ] 定义连接配置和 `foo()` factory。
- [ ] 实现 `resolveConnection`、Knex client、`createRuntime` 和 `createSchemaInspector`。
- [ ] 实现所需的 query、repository、schema、JSON、numeric、temporal strategy。
- [ ] 添加 factory、runtime、type strategy、Inspector 和边界 unit tests。
- [ ] 实现 integration adapter，调用 `@nocobase/db-testkit` shared contract。
- [ ] 添加 Foo-specific integration tests。
- [ ] 在 app-server 或应用组合入口显式注册 Foo driver，只安装实际使用的 driver。
- [ ] 添加 changeset，更新 lockfile，并运行 package checks。

## 验证命令

```bash
pnpm --filter @nocobase/db-foo lint
pnpm --filter @nocobase/db-foo typecheck
pnpm --filter @nocobase/db-foo test
pnpm --filter @nocobase/db-foo build
pnpm --filter @nocobase/db-foo test:integration
pnpm --filter @nocobase/db lint
pnpm --filter @nocobase/db typecheck
pnpm --filter @nocobase/db test
pnpm pack:check
node scripts/validate-changesets.mjs
```

完成后检查 core 是否仍然出现具体 Dialect import、固定 Dialect union、central integration helper 或按 Dialect 分派：

```bash
rg "@nocobase/db-|IntegrationDialect|IntegrationDatabaseSpec|switch .*dialect" \
  packages/libs/db/src packages/libs/db/tests
```

新增 Foo 后，这个检查不应要求修改 `@nocobase/db` 的源码或 core 测试。

## Agent 执行约定

Agent 接到新增 Dialect 任务时，先读取 `@nocobase/db` public API、现有 Dialect package、`@nocobase/db-testkit` contract 和当前 Git 状态，再按“package → driver → strategy → unit → adapter → integration → app 注入 → 验证”的顺序推进。每个阶段完成后提交独立 commit。

遇到一个新行为时按以下规则归属：依赖具体数据库 SQL 的放 Dialect package；多个 Dialect 必须满足的放 testkit contract；只依赖 core 抽象的留在 `@nocobase/db`。不要通过新增 core 分支、复制 central helper 或跳过真实数据库测试来完成迁移。

## 当前状态

运行时 Dialect 拆分、driver registry、基础 `@nocobase/db-testkit` 和 SQLite shared contract 已完成。其余 Dialect 的 contract 迁移、central integration helper 删除以及 core 测试依赖清理仍在进行中；本指南会随着迁移阶段更新。
