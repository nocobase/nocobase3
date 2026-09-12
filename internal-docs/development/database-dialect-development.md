---
title: Database Dialect 扩展开发
description: NocoBase v3 中新增、测试和集成 @nocobase/db-<dialect> 的开发规范。
---

# Database Dialect 扩展开发

本文是 NocoBase v3 Database Dialect 拆分的第一版开发规范。它面向维护
`@nocobase/db`、新增 `@nocobase/db-<dialect>`、维护数据库测试以及执行迁移
任务的开发者和 Agent。

目标是把一个数据库引擎的实现收敛到自己的 package。新增 Dialect 时，应该只
新增或修改对应的 `db-<dialect>`、应用组合入口和必要的共享测试 contract，
不应该为了增加一个数据库而修改 `@nocobase/db` 的业务实现或 core 测试。

CLI 不在本文范围内。

## 设计目标

拆分完成后，依赖方向应保持为：

```text
@nocobase/db
  公共抽象、生命周期、AST、通用 builder/query/repository/schema 实现
        ↑
@nocobase/db-testkit
  不选择数据库的共享 integration contract、fixture 和 assertion
        ↑
@nocobase/db-<dialect>
  连接配置、native driver、Knex client、SQL strategy、Inspector 和测试
        ↑
应用组合入口
  安装并注册当前应用实际使用的 Dialect
```

有四条必须长期保持的边界：

1. `@nocobase/db` 不导入 `@nocobase/db-postgres`、`@nocobase/db-mysql` 等
   具体包。
2. 具体数据库的 SQL、catalog 查询、native driver 行为和类型转换属于对应
   Dialect package。
3. `@nocobase/db-testkit` 可以复用公共行为，但不能维护 Dialect 列表，也
   不能根据 Dialect 名称选择连接。
4. 应用只安装并注册自己需要的 driver；Database core 不负责自动安装或加载
   所有 driver。

“拆分干净”的验收标准不是目录已经分开，而是新增 `foo` 时，core 的生产代码
和 core 测试不需要增加 `foo` 分支、`foo` union、`foo` import 或 `foo` 的
catalog SQL。

## 两种使用方式

Dialect package 导出一个 factory。factory 同时携带自己的连接配置和 driver
descriptor，因此支持显式注册和直接传入两种形式。

### 显式注册

```ts
import foo from '@nocobase/db-foo';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  drivers: {
    foo,
  },
  connections: {
    main: {
      dialect: 'foo',
      host: process.env.DB_HOST,
    },
  },
});
```

`drivers.foo` 可以是 Dialect factory，也可以是 factory 的 `.driver` descriptor。
注册后，core 根据连接中的 `dialect` 找到 descriptor，再由 descriptor 解析
连接和 runtime。

### 直接传入 factory

```ts
import foo from '@nocobase/db-foo';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  connections: {
    main: foo({
      host: process.env.DB_HOST,
    }),
  },
});
```

factory 返回的配置至少要包含：

```ts
{
  dialect: 'foo',
  databaseDriver: foo.driver,
}
```

两种写法必须得到等价的连接行为。core 会校验显式注册的 driver、factory
返回的 driver 和连接 `dialect` 是否一致，并拒绝把一个 Dialect 的 driver
用于另一个 Dialect。

## Dialect package 契约

新 package 的基础结构建议如下：

```text
packages/libs/db-foo/
├── src/
│   ├── index.ts                 # factory、driver descriptor、公开类型
│   ├── json.ts                  # JSON filter/value strategy（如果需要）
│   ├── numeric.ts               # numeric/decimal strategy（如果需要）
│   ├── temporal.ts              # temporal strategy（如果需要）
│   ├── precise-integers.ts      # BIGINT/精确整数边界（如果需要）
│   └── inspectors/
│       └── foo.ts               # physical schema inspector
├── tests/
│   ├── config.test.ts
│   ├── factory.test.ts
│   ├── runtime.test.ts
│   ├── inspector-strategies.test.ts
│   ├── inspector.test.ts
│   ├── json-filter.test.ts
│   ├── temporal-sql.test.ts
│   └── integration/
│       ├── adapter.ts
│       ├── contract.test.ts
│       ├── core-suite.test.ts
│       └── foo-specific.test.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── eslint.config.js
```

不是每个 Dialect 都需要所有文件。文件是否存在由实际行为决定，不要为了
对齐目录而创建空 strategy。

package 至少应提供：

- `foo(options?)` factory；
- `foo.dialect`；
- `foo.driver`；
- `DatabaseDriverDefinition` 所需的 `knexClient`；
- `resolveConnection`；
- Dialect 需要时的 `resolveKnexClient` 或 `createKnexClient`；
- `createRuntime`；
- `createSchemaInspector`。

生产代码放在 `src/`，测试放在 package 根目录的 `tests/`。不要把测试放在
`src/` 旁边，也不要让 Dialect package 直接依赖
`@nocobase/db/tests` 的内部文件。

## Driver descriptor

core 只消费 descriptor 提供的能力，不知道 descriptor 内部如何连接数据库。
典型结构如下：

```ts
import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
} from '@nocobase/db';

const fooDriver: DatabaseDriverDefinition<'foo'> = {
  dialect: 'foo',
  packageName: '@nocobase/db-foo',
  nativeDriver: 'foo-native-driver',
  knexClient: 'foo',
  resolveKnexClient: () => FooKnexClient,
  resolveConnection: (config: ConnectionConfig) => ({
    connection: {
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
    },
  }),
  createRuntime: (context) => ({
    dialect: context.dialect,
    capabilities: context.capabilities,
    query: {},
    repository: {},
    schema: {},
    numeric: {},
  }),
  createSchemaInspector: (context) => new FooSchemaInspector(context),
};

export default function foo(
  options: FooConnectionOptions = {},
): FooConnectionConfig & {
  dialect: 'foo';
  databaseDriver: typeof fooDriver;
} {
  return {
    ...options,
    dialect: 'foo',
    databaseDriver: fooDriver,
  };
}

foo.dialect = 'foo' as const;
foo.driver = fooDriver;
```

实际实现应使用仓库当前的类型和 Knex API；上面的代码只表示边界，不要求
所有 Dialect 使用同样的文件拆分方式。

### `resolveConnection`

`resolveConnection` 负责把 Dialect 自己的连接配置转换成 Knex 的
`connection` 对象，通常还包括：

- host、port、database、username、password；
- service name、socket path 或 instance name；
- schema/search path；
- TLS/SSL；
- Dialect native driver 需要的 driver options；
- pool 的默认值和连接级覆盖。

具体字段由 Dialect 自己解释。core 不应为每个新数据库增加环境变量字段、连接
默认值或 catalog 逻辑。

不要把 `undefined` 无条件传给 native driver。默认值应在 Dialect package
内部确定，并通过 unit test 固定下来。

### Knex client

Knex 作为底层依赖直接由 core 使用，不新增 `db-knex` 中间 package。
Dialect package 负责：

- 声明 native driver；
- 声明或解析 Knex client；
- 处理本地 Knex subclass；
- 配置 driver-specific pool；
- 处理 native driver 的返回值和错误边界。

例如 PostgreSQL 的 `pg` 和 `pg-query-stream` 是 PostgreSQL package 的运行时
依赖，因为 PostgreSQL repository stream 会在生产代码中加载它们。只在测试中
使用的 helper 才放在 `devDependencies`。

## Runtime strategy

Dialect 的差异通过 `createRuntime` 返回的 strategy 注入 core adapter。
strategy 应按行为拆分，而不是在一个文件中维护大型 Dialect `switch`。

| strategy | 适合放入的行为 |
| --- | --- |
| `query` | aggregate 结果、聚合排序、decimal aggregate、数据库表达式、identifier quoting |
| `repository` | JSON filter、numeric mutation、boolean/temporal 编解码、upsert、stream options、returning |
| `schema` | column type、generated column、unsigned、默认值、foreign key、drop index |
| `numeric` | BIGINT/decimal aggregate SQL、native result 能力、精确数值投影 |
| `Inspector` | schemas、tables、views、columns、indexes、foreign keys、constraints |
| native adapter | stream、原生错误、driver 返回值、连接池和事务差异 |

`PRAGMA`、`information_schema`、`sys.*`、`user_*` 等 catalog 查询只能出现在
对应 Dialect 的 inspector 或测试 adapter 中。

多个数据库都需要的行为有三种归属判断：

- 如果是公共抽象行为，放在 `@nocobase/db`；
- 如果是公共可验证的行为，放在 `@nocobase/db-testkit` 的 contract；
- 如果依赖具体 SQL、类型或 driver，留在 `@nocobase/db-<dialect>`。

不要为了让多个 Dialect 通过而把具体 SQL “抽象”为一套包含多种分支的
shared helper。那只是把 central helper 换了一个位置。

## 应用组合和依赖

应用组合入口负责安装和注册 driver。`@nocobase/app-server` 本身不应依赖
所有具体 native driver。

模板或应用可以这样注册：

```ts
import sqlite from '@nocobase/db-sqlite';
import { registerAppDatabaseDrivers } from '@nocobase/app-server/database';

export const databaseDrivers = { sqlite };

registerAppDatabaseDrivers(databaseDrivers);
```

自定义应用需要 PostgreSQL 时，只安装并注册
`@nocobase/db-postgres`；不应因为 core 支持五种数据库就安装五套 native
driver。

应用中可以通过 `databaseDrivers` 传入局部注册，或者通过
`registerAppDatabaseDrivers` 注册全局组合入口。最终 manager 收到的是：

```ts
{
  drivers: {
    foo,
  },
  connections: {
    main: {
      dialect: 'foo',
      // foo 自己定义并解析的字段
    },
  },
}
```

依赖声明按“谁在运行时加载”判断：

| 使用位置 | 声明位置 |
| --- | --- |
| Dialect `src/` 的生产代码、native driver、stream helper | `dependencies` |
| `@nocobase/db` 运行时宿主 | `peerDependencies` |
| shared contract、测试、lint、TypeScript、构建工具 | `devDependencies` |

新增 native addon 时，检查生成应用的 `allowBuilds` 配置和
`create-app` 的 driver build 列表。纯 JavaScript driver 不应被加入 native
build 列表。

修改依赖后运行：

```bash
CI=true pnpm install --no-frozen-lockfile
```

并提交同步后的 lockfile。

## 测试归属

测试按“行为是否依赖具体数据库”归属，不按历史目录归属。

### Core unit

`packages/libs/db/tests/unit` 只保留不依赖具体数据库的内容，例如：

- manager 注册、连接生命周期和错误；
- migration/seed policy；
- AST 和通用 query/repository 行为；
- naming strategy；
- cursor、公共参数校验和公共错误；
- metadata、collection resolver 等公共实现。

core unit 不应静态导入任何 `@nocobase/db-<dialect>`。

### Dialect unit

`packages/libs/db-<dialect>/tests` 负责：

- factory 和 driver metadata；
- 连接字段解析、默认值和错误；
- Knex client 和 native driver；
- runtime strategy；
- SQL 编译；
- JSON、numeric、temporal 和 binary 边界；
- Inspector；
- Dialect-specific capability 和返回值。

如果一个测试需要真实数据库、native driver 或真实 catalog，即使它过去在
core 的 `unit` 目录，也应迁移到对应 Dialect package 的 integration 或
Dialect-specific test。

### Shared contract

`@nocobase/db-testkit` 提供可参数化的 contract、fixture 和 assertion。它的
职责是验证多个数据库都必须满足的公共行为，例如：

- builder 创建 collection、view、index 和 relation；
- query/repository 的公共读写语义；
- metadata、migration、seed 和 transaction；
- portable schema inspector contract；
- stream 生命周期和返回值 contract。

共享 suite 的当前入口是：

```ts
import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { fooIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(fooIntegrationAdapter);
```

较完整的 core integration suite 由 Dialect package 安装 adapter 后加载：

```ts
import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { fooDialectIntegrationAdapter } from './adapter.js';

installDatabaseIntegrationAdapter(fooDialectIntegrationAdapter);
await import('@nocobase/db-testkit/integration-suite');
```

testkit 不应：

- 导入或选择具体 Dialect；
- 读取某个数据库的环境变量；
- 启动 Docker 或创建连接；
- 包含 `PRAGMA`、`information_schema`、`sys.*` 等数据库 catalog SQL；
- 复制五套连接配置和 cleanup。

### Dialect integration adapter

每个 Dialect package 的 `tests/integration/adapter.ts` 自己负责：

- 创建 `DatabaseManager`；
- 读取该数据库的环境变量；
- 配置临时 schema、table prefix 或 database；
- 打开和关闭 native connection；
- 设置 foreign key、session、timezone 等数据库选项；
- 提供 physical object cleanup；
- 提供 `listIndexes`、`listForeignKeys`、`listColumns`、`listObjects` 等
  catalog adapter；
- 在数据库不可用时返回明确错误。

adapter 只把 portable 操作暴露给 shared contract。数据库专属测试直接使用
自己的 adapter 和 native client，不要反向把数据库细节塞入 testkit。

## 新增 Dialect 的执行顺序

按下面顺序实现可以减少跨 package 返工：

1. 读取 `@nocobase/db` 的 public API、现有 Dialect package 和
   `@nocobase/db-testkit` 的 adapter/contract。
2. 建立 `packages/libs/db-foo` 的 package metadata、exports、TypeScript、
   ESLint、Vitest 和 README。
3. 声明 `@nocobase/db` peer dependency、native driver、Knex 和生产运行时
   helper。
4. 实现 `foo()` factory 和 `foo.driver`。
5. 实现 `resolveConnection`、Knex client、pool/storage normalization。
6. 实现 `createRuntime`，只注入 Foo 需要的 query/repository/schema/numeric
   strategy。
7. 实现 Foo 的 Schema Inspector 和 catalog 查询。
8. 先写 factory、config、runtime、SQL strategy、Inspector unit test。
9. 为 Foo 创建 integration adapter。
10. 让 Foo 调用 shared contract，并补充 Foo-specific integration test。
11. 在应用组合入口显式注册 Foo，确认只安装 Foo 实际需要的 driver。
12. 按 package 范围运行 lint、typecheck、test、integration 和 build。
13. 检查 core 没有新增 Foo import、Foo union、Foo switch 或 Foo SQL。
14. 完成一个阶段后提交独立 commit，再进入下一阶段。

每个阶段的 commit 应说明行为边界，例如：

```text
feat(db-foo): add foo dialect driver
test(db-foo): run shared integration contracts
test(db-foo): add foo inspector coverage
```

不要把未完成的 Dialect、无关的 core 重构和迁移脚本混在同一个 commit。

## Agent 工作约定

Agent 接到 Dialect 任务时，先执行：

```bash
git status --short
git log -8 --oneline
rg --files packages/libs/db packages/libs/db-testkit packages/libs/db-*
```

然后按照以下问题判断代码归属：

| 问题 | 归属 |
| --- | --- |
| 不连接数据库也能验证吗？ | `@nocobase/db` unit |
| 所有 Dialect 都必须满足吗？ | `@nocobase/db-testkit` contract |
| 需要具体 SQL、catalog、native driver 或数据库类型吗？ | `@nocobase/db-<dialect>` |
| 需要应用安装哪个 driver 吗？ | app/template composition root |

每次编辑前先确认当前文件属于哪一层。发现历史 central helper 时，先拆出
公共 contract 和 Dialect adapter，再删除 central helper；不要把它完整复制到
五个 package。

Agent 不应通过“顺手在 core 增加一个 Dialect 分支”解决测试失败。先判断失败
是公共 contract、Dialect strategy、adapter cleanup、native driver 还是测试环境
配置问题。

## 验证清单

### Dialect package

```bash
pnpm --filter @nocobase/db-foo lint
pnpm --filter @nocobase/db-foo typecheck
pnpm --filter @nocobase/db-foo test
pnpm --filter @nocobase/db-foo build
pnpm --filter @nocobase/db-foo test:integration
```

### Core and testkit

```bash
pnpm --filter @nocobase/db lint
pnpm --filter @nocobase/db typecheck
pnpm --filter @nocobase/db test
pnpm --filter @nocobase/db build
pnpm --filter @nocobase/db-testkit lint
pnpm --filter @nocobase/db-testkit typecheck
pnpm --filter @nocobase/db-testkit typecheck:unit
pnpm --filter @nocobase/db-testkit typecheck:integration
pnpm --filter @nocobase/db-testkit test
```

### 发布和仓库检查

```bash
pnpm pack:check
node scripts/validate-changesets.mjs
```

纯文档或纯测试改动通常不需要 changeset；如果改变了 publishable package
的运行时输出、依赖或 public API，必须阅读 `.changeset/README.md` 并添加
覆盖所有受影响 package 的 changeset。

### 拆分检查

新增 Dialect 后运行：

```bash
rg -n \
  "@nocobase/db-(postgres|mysql|oracle|mssql|sqlite)|IntegrationDialect|IntegrationDatabaseSpec|switch .*dialect|PRAGMA|information_schema|sys\\.|user_" \
  packages/libs/db/src packages/libs/db/tests
```

这个检查允许 core 里出现描述性错误信息和开放的 `dialect` 字符串，但不应
出现具体 Dialect 的实现 import、固定 Dialect 逻辑或数据库 catalog SQL。

## 当前实现状态和剩余迁移

当前仓库已经具备：

- `@nocobase/db` 的 driver registration 和 factory 注入边界；
- `@nocobase/db-postgres`、`db-mysql`、`db-oracle`、`db-mssql`、
  `db-sqlite` package；
- `@nocobase/db-testkit` 的共享 contract 和 adapter API；
- 各 Dialect package 的 unit test 和独立 `test:integration` 入口；
- `@nocobase/db-testkit/integration-suite` 共享 integration suite 入口；
- app/template 组合入口的显式 driver registration；
- PostgreSQL 的 `pg-query-stream` 等生产依赖由对应 Dialect package 声明。

仍需持续完成的工作以代码现状为准，不能仅凭文档宣称已经结束：

- 清理 core 或 testkit 中残留的历史 central integration helper；
- 确认所有真实数据库 integration 都由对应 Dialect package 维护；
- 继续把 Dialect-specific fixture 从 `@nocobase/db/tests` 移到对应 package
  或 testkit；
- 评估 `@nocobase/db` 中当前内置 `ConnectionConfig` alias 是否还需要收敛，
  使新增 Dialect 在类型层也完全不修改 core；
- 检查 app-server、模板和生成应用只声明并安装实际使用的 driver；
- 为每个 Dialect 补齐 shared contract、Inspector、stream、numeric、
  temporal、schema management 和 native driver 边界；
- 更新 CI 和文档，使每个 Dialect 的 integration 入口都能独立运行。

最终完成的判断方式是：新增一个未在仓库中出现过的 `foo` package，只修改
`db-foo`、它的 testkit adapter、应用组合入口和必要的发布元数据，就能完成
factory、runtime、Inspector、unit、shared contract 和 integration；不需要
修改 `@nocobase/db` 的业务实现或 core 测试。
