---
title: 数据库 Dialect 拆分推进路线
description: 记录 @nocobase/db 的 Dialect 独立化架构、扩展步骤、当前边界和验收标准。
---

# 数据库 Dialect 拆分推进路线

本文记录 `@nocobase/db` 从内置方言分支迁移到独立 Dialect package 的最终架构。CLI 和
create-app 的交互仍属于后续工作；数据库内核、驱动包、app-server 组合边界已经按本文完成。

## 完成标准

“拆分干净”采用两个标准：

### `@nocobase/db` core

- core 只编排 DatabaseManager、Connection、Query、Repository、Migration、Seed 和 Schema。
- core 不通过 `dialect === 'sqlite'` 或 native Knex client 名称分派数据库行为。
- core 不加载 `pg`、`mysql2`、`better-sqlite3`、`oracledb`、`tedious` 等 native driver。
- core 不持有具体数据库的连接参数解析、Inspector、DDL、SQL、值编码或结果解码实现。
- 新 Dialect 可以使用开放的 Dialect 标识和自有连接配置，不需要修改 core 的 Dialect union。

core 中仍然存在的 Dialect 比较只用于一致性校验，例如“连接配置绑定的 driver
是否与 driver descriptor 的标识相同”。这类校验不会选择数据库行为。

### `@nocobase/app-server`

- app-server 不静态导入任何具体 Dialect package。
- 应用组合根显式安装并注入自己需要的 driver registry。
- 连接默认值、路径归一化、ownership 标识和本地存储准备由 Dialect descriptor 提供。
- 未安装或未注册 driver 时，由统一 registry/manager 报出连接名和 Dialect 上下文。
- 一个应用可以按连接注册多个 Dialect；app-server 不把某个 Dialect 当成全局唯一实现。

## 当前架构

```mermaid
flowchart LR
  App[Generated application] --> Registry[Application driver registry]
  Registry --> Driver[One or more @nocobase/db-* packages]
  Driver --> Descriptor[DatabaseDriverDefinition]
  Descriptor --> Runtime[Dialect runtime strategies]
  Runtime --> Core[@nocobase/db core]
  Core --> Knex[Knex shared runtime]
```

`@nocobase/db` 只依赖 Knex 和 strategy contract。每个 Dialect package 同时拥有：

- native driver 和 Knex client；
- `resolveConnection`、pool 配置和连接级能力；
- Query、Repository、Schema、Inspector 的 runtime strategy；
- 应用侧的连接默认值和路径归一化；
- managed database ownership 标识；
- 本地数据库文件或其他本地资源的准备逻辑。

## 已完成的实现

### Core runtime strategy

`DatabaseDriverDefinition` 提供以下几类扩展点：

- `createRuntime`：Query、Repository、Schema、Numeric 等运行时策略；
- `resolveKnexClient` / `createKnexClient`：Knex client 和 native driver；
- `resolveConnection`：native connection 参数；
- `createSchemaInspector`：物理 Schema Inspector；
- `normalizeConnection`：应用级默认值和路径归一化；
- `resolveOwnershipTarget`：managed connection 的稳定身份；
- `prepareStorage`：本地存储准备。

Connection 创建后把 runtime strategy 附加到 Knex client 和事务 client。Query、
Repository、Schema 和 Inspector 都从该上下文取得策略，执行器不再读取
`client.client.config.client` 来猜测 Dialect。

已经下沉到对应 Dialect package 的行为包括：

| 行为                                                                     | 归属                                 |
| ------------------------------------------------------------------------ | ------------------------------------ |
| native driver、Knex client、pool                                         | 各 `@nocobase/db-*`                  |
| Connection 参数解析                                                      | 各 package 的 `resolveConnection`    |
| Query aggregate、排序和数据库特殊结果处理                                | `createRuntime().query` / `.numeric` |
| Repository temporal、JSON、boolean、numeric、binary、stream 和 returning | `createRuntime().repository`         |
| Schema column type、foreign key、predicate 和特殊 DDL                    | `createRuntime().schema`             |
| Schema Inspector 类型归一化和 capability policy                          | 各 package 的 Inspector              |
| SQLite 文件路径和目录创建                                                | `@nocobase/db-sqlite`                |
| PostgreSQL `pg-query-stream`                                             | `@nocobase/db-postgres`              |
| Oracle LOB、MSSQL precision、MySQL temporal range 等                     | 对应 Dialect package                 |

### app-server registry

`@nocobase/app-server` 只接受 `databaseDrivers` registry。默认模板显式注册
`@nocobase/db-sqlite`，因此默认应用只安装并加载 SQLite 实现。其他模板或应用可以注入
任意已安装的 Dialect package。

app-server 的连接 manager、ownership 和 storage 代码只调用 descriptor hooks，不包含
具体 Dialect 分支。配置 schema 的 `dialect` 是非空字符串，以便第三方 Dialect 不需要
修改 app-server 的配置 union。

### 开放配置类型

内置连接仍然提供严格的 `SqliteConnectionConfig`、`PostgresConnectionConfig`、
`MysqlConnectionConfig`、`OracleConnectionConfig` 和 `MssqlConnectionConfig` 字段提示。
第三方 Dialect 使用 `ExtensibleDatabaseConfig<TConnection>`：

```ts
import {
  createDatabaseManager,
  type BaseConnectionConfig,
  type DatabaseDriverDefinition,
  type ExtensibleDatabaseConfig,
} from '@nocobase/db';

type CockroachConnection = BaseConnectionConfig & {
  dialect: 'cockroach';
  host: string;
  port: number;
};

const cockroachDriver: DatabaseDriverDefinition<'cockroach'> = {
  dialect: 'cockroach',
};

const config = {
  drivers: { cockroach: cockroachDriver },
  connections: {
    main: {
      dialect: 'cockroach' as const,
      host: 'db.example.test',
      port: 26257,
    },
  },
} satisfies ExtensibleDatabaseConfig<CockroachConnection>;

const database = createDatabaseManager(config);
```

新增 `cockroach` package 时不需要把 `'cockroach'` 加入 `@nocobase/db` 的 union，也不需要
修改 core 的 manager、Query、Repository 或 Schema adapter。

## 新增 Dialect 的标准步骤

后续 Agent 或开发者新增 Dialect 时，按下面顺序处理：

1. 创建 `packages/libs/db-<name>`，只依赖 `@nocobase/db`、Knex 和该数据库的 native
   driver。
2. 导出 `<name>Driver` 和 `<name>` factory。factory 返回带
   `dialect`、`driver`、`databaseDriver` 的自描述连接。
3. 在 descriptor 中实现该 Dialect 实际需要的 `resolveConnection`、Knex client、
   capabilities、Inspector 和 runtime strategy。
4. 实现 `normalizeConnection`、`resolveOwnershipTarget` 和 `prepareStorage`；没有某项
   行为时省略 hook。
5. 在应用组合根安装并注册 package：

   ```ts
   import custom from '@nocobase/db-custom';
   import { createDatabaseManager } from '@nocobase/db';

   const database = createDatabaseManager({
     drivers: { custom },
     connections: {
       main: { dialect: 'custom', endpoint: process.env.DB_ENDPOINT },
     },
   });
   ```

6. 在 Dialect package 内增加该行为的 unit、Inspector、Builder、Query、Repository 和
   integration tests；不要把分支补回 `@nocobase/db`。
7. 只在应用模板或部署项目中添加实际需要的 package。多 Dialect 应用显式安装并注册
   多个 package。

## 验收矩阵

当前实现已验证：

| 维度                        | 验收结果                                                        |
| --------------------------- | --------------------------------------------------------------- |
| core native 依赖            | `@nocobase/db` 不声明五种 native driver                         |
| core Dialect 行为审计       | core 和 app-server database runtime 无具体 Dialect 行为分支     |
| strategy                    | SQLite、PostgreSQL、MySQL、Oracle、MSSQL 均提供对应 runtime     |
| factory / registry          | 两种连接写法均有测试                                            |
| Query / Repository / Schema | `@nocobase/db` 测试 198 个文件，1267 通过，1 个跳过             |
| app-server                  | 23 个测试文件，206 个测试通过                                   |
| Dialect package build       | 五个 `@nocobase/db-*` package build 通过                        |
| app-server build            | build、server dependency verification 通过                      |
| 模板                        | default、examples 检查通过；hub 的 targeted tests 和 build 通过 |
| changeset                   | `node scripts/validate-changesets.mjs` 通过                     |

推荐的回归命令：

```bash
pnpm --filter @nocobase/db check
pnpm --filter @nocobase/app-server check
pnpm --filter @nocobase/db-sqlite build
pnpm --filter @nocobase/db-postgres build
pnpm --filter @nocobase/db-mysql build
pnpm --filter @nocobase/db-oracle build
pnpm --filter @nocobase/db-mssql build
```

## 当前边界

CLI、create-app 的 Dialect 选择、安装依赖生成和安装插件中的 Dialect 表单仍保留产品
层面的已知选项。这些代码不属于 DB core，本阶段按既定范围暂不改造。后续接入新 Dialect
到生成应用时，需要让 create-app 根据实际选择写入 package 依赖和 registry，并同步
native build 配置。

默认模板继续选择 SQLite 是应用产品默认值，不是 core 对 Dialect 的依赖。应用切换到
PostgreSQL、MySQL、Oracle、MSSQL 或第三方 Dialect 时，只需由应用组合根安装对应包并
注册 driver。
