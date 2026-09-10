---
title: 数据库 Dialect 拆分推进路线
description: 记录 @nocobase/db 的 Dialect 实现拆分现状、剩余边界、目标架构、分阶段任务和验收标准。
---

# 数据库 Dialect 拆分推进路线

本文是 `@nocobase/db` 的架构演进记录，不是当前 API 使用手册。它回答两个问题：

1. 哪些 Dialect 能力已经从 `@nocobase/db` 拆到独立包；
2. 要达到“core 不判断具体 Dialect，app-server 只安装实际使用的驱动”，后续还需要完成什么。

当前基线：2026-09-11。CLI 暂不纳入本阶段实现范围，但文末记录它与最终方案的衔接要求。

## 目标定义

“拆分干净”在本文中采用两个严格标准：

### Core 的标准

`@nocobase/db` 可以提供通用的 DatabaseManager、Connection、Query、Repository、Migration、Seed 和 Schema 编排能力，但不应该：

- 通过 `dialect === 'oracle'`、`dialect === 'sqlite'` 等条件分派具体数据库行为；
- 通过 `client.client.config.client === 'mysql2'` 等 native Knex client 名称反推数据库能力；
- 直接加载或依赖 `pg`、`mysql2`、`better-sqlite3`、`oracledb`、`tedious` 等数据库驱动；
- 持有某个数据库专用的连接解析、Schema Inspector、DDL 编译器、值转换器或 SQL 片段；
- 把五种内置数据库写死为第三方 Dialect 扩展必须遵守的实现分支。

公共配置类型可以保留稳定的 `dialect` 标识，但运行时行为应该由已注册的 driver strategy 提供。

### app-server 的标准

`@nocobase/app-server` 应该是应用组合根，而不是所有数据库实现的宿主。目标是：

- app-server 不静态加载五个 Dialect 包；
- 应用只安装自己选择的 `@nocobase/db-*` 包；
- app-server 从应用组合配置或注入的 registry 获取 driver；
- 未安装对应 Dialect 包时，启动阶段给出明确错误；
- SQLite 文件准备、数据库默认值和连接参数归一化由组合根或对应 driver 提供，不在 app-server 中复制五套数据库分支。

这两个标准必须同时满足，才算完成最终拆分。

## 当前状态

### 已完成的包级拆分

以下能力已经归属到对应的 Dialect 包：

| 能力                                   | 当前归属                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| native driver 依赖                     | `@nocobase/db-postgres`、`@nocobase/db-mysql`、`@nocobase/db-sqlite`、`@nocobase/db-oracle`、`@nocobase/db-mssql` |
| Knex client 加载                       | 各 Dialect 包的 driver descriptor                                                                                 |
| 连接参数解析                           | 各 Dialect 包的 `resolveConnection`                                                                               |
| Schema Inspector                       | 各 Dialect 包的 `inspectors/`                                                                                     |
| pool 配置                              | 各 Dialect 包的 `configurePool`                                                                                   |
| capability profile                     | 各 Dialect 包的 `capabilities`                                                                                    |
| SQLite / Oracle precise integer client | `db-sqlite`、`db-oracle`                                                                                          |
| SQLite decimal helper                  | `db-sqlite`                                                                                                       |
| PostgreSQL `pg-query-stream`           | `db-postgres`                                                                                                     |

`@nocobase/db` 当前不再声明上述 native driver 依赖，也不再保留原先的具体 Inspector、连接 resolver、pool hook 和 precise integer 实现。

当前支持两种连接方式：

```ts
import postgres from '@nocobase/db-postgres';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  drivers: { postgres },
  connections: {
    main: {
      dialect: 'postgres',
      host: process.env.DB_HOST,
    },
  },
});
```

```ts
const database = createDatabaseManager({
  connections: {
    main: postgres({
      host: process.env.DB_HOST,
    }),
  },
});
```

未注册 Dialect 时，core 会拒绝创建连接，并提示安装和注册对应的 `@nocobase/db-*` 包。

### 尚未完成的两条严格标准

| 目标                      | 当前状态 | 主要原因                                                          |
| ------------------------- | -------- | ----------------------------------------------------------------- |
| core 不判断具体 Dialect   | 未完成   | Query、Repository、Schema Builder 和值转换层仍有具体 Dialect 分支 |
| app-server 只安装实际驱动 | 未完成   | app-server 静态依赖并加载五个 Dialect 包                          |

因此，当前阶段是“native driver 和连接基础设施已拆分”，还不是“完全 Dialect-agnostic 的 core”。

## Core 剩余边界

### Schema Builder

`packages/libs/db/src/schema/internal/knex/adapter.ts` 仍包含大量具体数据库实现，例如：

- Oracle identity column；
- Oracle `TIMESTAMP WITH TIME ZONE` 主键和唯一约束限制；
- Oracle alter column 的 nullable 归一化；
- Oracle drop index 容错；
- Oracle `number`、`varchar2`、`char`、`binary_float` 和 `binary_double` 映射；
- MSSQL `nvarchar`、`nchar` 和 filtered index predicate；
- SQLite date/time 到 text 的映射；
- 五种数据库的 datetime / datetimeTz 物理类型；
- foreign key 的 `onDelete`、`onUpdate` 和 deferrable 差异。

当前 Schema Inspector 已经拆分，但 Schema Builder 仍是一个通过 `this.dialect` 分支的共享实现。下一步要把它拆成通用操作编排和 Dialect-owned compiler。

### Query 层

`packages/libs/db/src/query/internal/knex/adapter.ts` 仍直接判断 native client，例如：

- Oracle aggregate result 的 `fetchTypeHandler`；
- SQLite decimal aggregate 和排序；
- SQLite decimal comparison、between 和 having。

Query core 应该接收已注册的 Query strategy，不能重新读取 `client.client.config.client`。

### Repository 层

`packages/libs/db/src/repository/internal/knex-execution-adapter.ts` 仍包含：

- Oracle LOB 读取和 returning 处理；
- SQLite decimal transport；
- MySQL / MSSQL numeric precision 和 scale 上限；
- binary comparison 的 Dialect SQL；
- boolean storage codec；
- Oracle、SQLite 和其他 Dialect 的结果转换。

这些逻辑属于 Repository execution strategy 或 value strategy，不应该继续堆在通用 execution adapter 中。

### 独立的 SQL 和值模块

以下模块仍然按 native client 或 Dialect 字符串分支：

- `src/repository/internal/temporal-sql.ts`
- `src/repository/json-filter.ts`
- `src/repository/boolean.ts`
- `src/numeric/aggregate.ts`
- `src/schema/inspector/shared/type-normalization.ts`
- `src/schema/inspector/shared/column-capabilities.ts`

其中 Inspector 的共享归一化 helper 可以继续保留，但不能让它成为 core 对五种数据库完整行为的唯一实现入口。需要明确哪些是纯粹的格式解析，哪些是 Dialect-owned policy。

## app-server 剩余边界

当前 `packages/app/app-server/src/database/manager.ts` 静态导入并注册：

```ts
import postgres from '@nocobase/db-postgres';
import mysql from '@nocobase/db-mysql';
import sqlite from '@nocobase/db-sqlite';
import oracle from '@nocobase/db-oracle';
import mssql from '@nocobase/db-mssql';
```

并固定传入：

```ts
drivers: {
  (postgres, mysql, sqlite, oracle, mssql);
}
```

因此 `@nocobase/app-server/package.json` 目前运行时依赖五个 Dialect 包。即使应用只使用 SQLite，其他 Dialect 的 package 和 native driver 仍可能进入安装树和启动加载路径。

app-server 还有以下 Dialect-specific 逻辑：

- `database/manager.ts` 中各数据库的默认 host、port、database、serviceName、filename 和 socketPath；
- `database/ownership.ts` 中按 Dialect 生成连接标识；
- `database/storage.ts` 中 SQLite 文件目录准备；
- `database/config.ts` 中五种 Dialect 的配置 schema；
- 环境变量和配置文件中的 `DB_DIALECT` 约束。

这些逻辑需要在“应用组合根”“Dialect package”“通用 app-server”之间重新分配，而不是简单把静态 import 改成动态 import。

## 目标架构

目标结构如下：

```mermaid
flowchart LR
  App[Generated application] --> Registry[Application driver registry]
  Registry --> Driver[One selected @nocobase/db-* package]
  Driver --> Strategy[Dialect runtime strategy]
  Strategy --> Core[@nocobase/db core]
  Core --> Knex[Knex shared runtime]
  Core --> Runtime[Manager / Query / Repository / Schema]
```

其中：

- core 只依赖 strategy contract；
- Dialect 包实现 strategy contract，并拥有 native driver；
- app-server 消费 registry，不拥有五种 Dialect 的静态实现；
- 生成应用决定自己安装哪个 Dialect 包；
- 一个应用可以有多个连接，但每个连接必须绑定一个已经安装并注册的 driver；
- 如果未来要在同一个应用中使用多个数据库，应用可以显式安装多个 Dialect 包，但这应该是应用选择，而不是 app-server 的默认依赖。

## Strategy 契约原则

后续不要先把现有文件机械搬到五个包，再重新复制一份 `KnexRepositoryExecutionAdapter`。需要先定义按行为拆分的 strategy contract。

建议遵守以下原则：

1. **core 传递抽象上下文，不传递 native client 名称。**
   strategy 可以拿到 Knex client、连接配置和字段元数据，但 core 不再通过字符串判断驱动。

2. **按行为拆 strategy。**
   Temporal、JSON、Boolean、Numeric、Binary、Schema DDL、Result decoding 是不同边界，不要一开始设计一个包含所有方法的巨大接口。

3. **优先 capability / hook，减少 Dialect 名称判断。**
   例如 `supportsDecimalOrdering`、`compileTemporalType()`、`decodeReturningValue()` 比 `dialect === 'sqlite'` 更容易扩展。

4. **Dialect 包可以组合通用 helper。**
   纯粹的 SQL AST、值校验、结果行处理和 identifier 工具可以继续留在 core；只有含有数据库语义的 policy 才应该下沉。

5. **不通过 Knex client 反推 Dialect。**
   当前所有 `client.client.config.client` 的判断都应该被 driver context 或 strategy 调用替代。

6. **每个下沉点必须保留行为测试。**
   迁移实现时，先把当前分支的测试变成 strategy contract 测试，再替换实现位置。

## 分阶段任务清单

### 阶段 0：冻结边界和建立审计清单

交付：

- 列出 core 中所有具体 Dialect / native client 判断；
- 给每个判断标记为“纯解析 helper”“共享能力”“Dialect policy”；
- 确认哪些公开类型可以保持不变；
- 为每个后续阶段建立行为测试清单。

验收：

- `rg` 审计结果保存到本提案或对应阶段 PR；
- 每一个剩余字符串判断都有明确归类；
- 不再出现“搬到另一个文件但仍由 core 传入 native client 字符串”的伪拆分。

### 阶段 1：引入统一 Runtime Strategy Context

交付：

- 扩展 `DatabaseDriverDefinition` 或新增内部 runtime strategy contract；
- Connection 创建后保存已解析的 driver context；
- Query、Repository、Schema adapter 通过 context 获取 strategy；
- 删除通过 `client.client.config.client` 反推 Dialect 的新代码路径。

验收：

- core 可以使用一个自定义 dialect descriptor 完成连接初始化；
- driver descriptor 的 Dialect 标识和 Knex client 名称不再由执行器重新映射；
- 现有五个 Dialect 的行为测试全部通过。

### 阶段 2：下沉值和独立 SQL strategy

建议顺序：

1. temporal SQL；
2. boolean codec；
3. JSON filter；
4. numeric aggregate；
5. decimal comparison；
6. binary comparison。

交付：

- 每类行为有独立 strategy hook；
- `temporal-sql.ts`、`json-filter.ts`、`boolean.ts` 和 `numeric/aggregate.ts` 不再按 native client 分支；
- strategy 的输入使用逻辑操作、字段元数据和能力，而不是字符串驱动名。

验收：

- Query、Repository、Mutation、Returning、Filter、Aggregate、Sort、Pagination 和 Stream 的现有测试不回归；
- 五个 Dialect 至少各有一组对应 strategy contract 测试；
- core 中不再出现该类别的具体 Dialect 字符串。

### 阶段 3：下沉 Repository Execution Strategy

交付：

- Oracle LOB 和 returning；
- SQLite decimal transport；
- MySQL / MSSQL numeric precision policy；
- boolean、binary、JSON、temporal 结果解码；
- native driver result handling。

验收：

- `KnexRepositoryExecutionAdapter` 只编排通用流程；
- driver-specific result handling 全部通过 strategy；
- PostgreSQL stream、Oracle LOB、SQLite decimal 和 MSSQL returning 各有回归测试；
- core 不再出现对 `oracledb`、`better-sqlite3`、`mysql2`、`mssql` 的直接判断。

### 阶段 4：下沉 Schema DDL Strategy

交付：

- column type compiler；
- auto-increment / identity compiler；
- temporal type compiler；
- constraint compiler；
- foreign key action policy；
- filtered index predicate compiler；
- Oracle alter/drop special cases。

建议保留在 core 的部分：

- `SchemaOperation` AST；
- operation 顺序和事务编排；
- 通用 identifier 处理；
- `ifExists` / `ifNotExists` 的操作语义；
- 基于 strategy 输出的 SQL 审计。

验收：

- `KnexSchemaAdapter` 不再出现五种 Dialect 的 `if/else`；
- 每个 Dialect package 自己提供 DDL strategy；
- 五个 Dialect 的 schema inspector、builder、migration、metadata 测试通过；
- 现有 migration 行为和 dry-run SQL 不发生未记录的变化。

### 阶段 5：改造 app-server Driver Registry

交付：

- `createAppDatabaseManager()` 接受显式 driver registry 或已解析的 database runtime；
- app-server 删除五个 Dialect 的静态 import；
- app-server 不再默认依赖五个 Dialect 包；
- SQLite storage preparation、连接默认值和配置归一化移动到明确的组合层；
- 未安装 Dialect 时的启动错误包含包名和连接名。

推荐的组合方式：

```ts
createAppDatabaseManager(config, {
  drivers: {
    sqlite,
  },
});
```

或者由生成应用创建完整的 `DatabaseConfig`，app-server 只负责消费它。具体采用哪一种，需要在实现阶段根据应用模板和发布产物的依赖边界决定。

验收：

- 仅安装 SQLite 包的应用不会解析 PostgreSQL、MySQL、Oracle、MSSQL 包；
- 仅安装 PostgreSQL 包的应用不会要求 `better-sqlite3`、`oracledb` 或 `tedious`；
- app-server 的公共 API 不再隐式承诺所有内置 Dialect 都存在；
- app-server、模板和部署产物的依赖扫描通过。

### 阶段 6：应用模板与安装流程衔接

本阶段不属于当前 CLI 实现，但完成 app-server 注入后必须处理：

- 生成应用根据选定 Dialect 写入对应 `@nocobase/db-*` 依赖；
- 应用运行时 registry 与 manifest 保持一致；
- native build allowlist 只包含实际需要的 native driver；
- 改变应用 Dialect 时，给出重新安装依赖的明确流程；
- 默认模板、Examples、Hub 的配置文档和测试同步。

如果产品允许运行时切换 Dialect，则不能同时承诺“只安装一个 driver”。两者需要明确取舍。

## 需要提前决定的架构问题

### 是否把 `DatabaseDialect` 从固定 union 改为 string

保留固定 union 的优点：

- 当前五个内置 Dialect 的类型检查更强；
- app-server 配置 schema 更容易生成；
- 文档和错误信息更明确。

改为开放 string 的优点：

- 第三方 Dialect 可以不修改 core 类型；
- core 不再写死五种内置 Dialect；
- registry 可以真正插件化。

建议：在阶段 1 先保留公共 union，先完成 runtime strategy；当第三方 Dialect 注册契约稳定后，再单独评估类型开放，不要把两个高风险变化放在同一个阶段。

### app-server 是动态加载还是显式注入

动态加载可以减少应用模板改动，但会带来：

- 包名映射重新回到 app-server；
- bundler 和部署依赖扫描更难判断；
- 错误发生在运行时；
- native driver 的安装和重建更难诊断。

显式注入更容易验证依赖图，也更适合 Agent 和生成应用。当前路线优先考虑显式注入。

### 一个应用是否允许多个 Dialect

如果允许多个连接使用不同数据库，需要：

- registry 支持多个已安装 driver；
- 每个连接绑定自己的 driver；
- app-server 不能把“默认 Dialect”误当成全局唯一 Dialect；
- migration、seed、storage preparation 和 metadata store 都必须按连接处理。

如果不允许，则应该在配置层明确限制为一个应用级 Dialect。这个产品约束需要在 app-server 阶段确定。

## 验收矩阵

最终完成时至少需要验证：

| 维度            | 验收内容                                                                |
| --------------- | ----------------------------------------------------------------------- |
| core 依赖       | `@nocobase/db` 不含五种 native driver 依赖                              |
| core 字符串审计 | core 运行时代码不按具体 native client 分支                              |
| strategy        | 五个 Dialect 都实现完整 strategy contract                               |
| factory         | direct factory 和 declarative registry 两种用法都可用                   |
| schema          | create / alter / drop / view / index / constraint / migration 通过      |
| query           | filter / join / aggregate / sort / pagination / JSON 通过               |
| repository      | create / update / delete / returning / stream / decimal / temporal 通过 |
| app-server      | 只加载 registry 中提供的 Dialect                                        |
| 依赖图          | 只安装一个 Dialect 的应用可以 build、start、migrate、seed               |
| 多连接          | 若支持多个 Dialect，连接之间不会共享错误的 strategy                     |
| 错误信息        | 未安装或未注册 driver 时包含连接名、Dialect 和包名                      |
| 发布产物        | `pack:check`、runtime dependency check 和 native build check 通过       |

## 当前不在范围内

本路线暂不直接修改：

- CLI 命令实现；
- create-app 的交互和参数设计；
- 已经独立完成的 Dialect Inspector；
- 与 Dialect 拆分无关的 Repository 数值输入改造；
- 业务插件自己的数据库测试 fixture。

不过阶段 5 完成后，CLI、create-app 和三个应用模板必须重新对齐，否则生成应用仍可能声明一个 Dialect、运行时却没有对应 registry。

## 下一步建议

下一次实现从阶段 0 开始，先提交一份“Dialect 判断审计表”和 strategy contract 草案，再进入阶段 1。不要直接从 `KnexSchemaAdapter` 或 `KnexRepositoryExecutionAdapter` 搬代码；先冻结 hook 的输入、输出、错误和测试契约，才能避免把原来的五套分支复制到五个包里。
