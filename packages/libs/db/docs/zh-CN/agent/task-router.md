---
title: Agent 任务路由
description: 根据业务目标选择 @nocobase/db API、代码落点、必读文档和最低验证。
---

# Agent 任务路由

先在下表定位任务，再阅读对应工作流。一个需求包含多种变更时，分别选择实现层；例如“新增表并写入默认状态”通常需要一个 Migration 和一个 Seed。

| 业务任务                                     | 首选入口                                        | 通常的代码位置              | 不要使用                     |
| -------------------------------------------- | ----------------------------------------------- | --------------------------- | ---------------------------- |
| 创建 Collection、字段、索引或约束            | `defineMigration()` 中的 `builder`              | `database/migrations/*.ts`  | 应用启动代码中的临时 DDL     |
| 修改已有 Schema                              | 新的 `defineMigration()`                        | 新 Migration 文件           | 修改已发布 Migration         |
| 回填、转换或清理历史数据                     | Migration 中的 `query`                          | `database/migrations/*.ts`  | Seed                         |
| 写入安装默认角色、权限、配置或字典           | `defineSeed()` 中的 `query`                     | `database/seeds/*.ts`       | Builder                      |
| 运行时查询或修改记录                         | `db.query()` / `connection.query`               | Service、handler 或业务模块 | Schema Inspector             |
| 原子执行多个操作                             | `db.transaction()` / `connection.transaction()` | 业务 Service                | 回调内重新调用外层 `db`      |
| 连续操作指定连接                             | `db.connection(name)`                           | 当前业务模块                | 每行重复传 connection name   |
| 读取完整 Collection 定义                     | `connection.collections`                        | Schema/Metadata 消费代码    | Schema Inspector             |
| 检查真实表、列、索引或约束                   | `connection.schemaInspector`                    | 外部接入、同步或诊断代码    | Collections                  |
| 更新 title、description 或 relation metadata | `connection.collectionMetadata`                 | Metadata 管理逻辑           | Builder DDL                  |
| 声明静态 Metadata 文档                       | `defineCollectionMetadata()`                    | Metadata 模块               | 未校验的随意对象             |
| 接入外部数据库                               | `schemaManagement: 'external'` + Metadata Store | 数据库配置与 Metadata 模块  | Migration 或真实 Builder DDL |
| 使用方言特有能力                             | 检查 `dialect`/`capabilities` 后使用 `client()` | 极少数适配代码              | 默认使用 raw SQL             |
| Collection-aware Repository CRUD             | 当前不可用                                      | —                           | `db.repository()`            |

## 最小阅读集

### 新增或修改业务 Schema

1. [实现 Schema 变更](./implement-schema-change.md)
2. [定义 Migration](../migration/define-migration.md)
3. [Builder 总览](../builder/overview.md)
4. [Migration 测试](../migration/testing.md)

### 编写业务查询

1. [实现数据访问](./implement-data-access.md)
2. [QueryAdapter 总览](../query/overview.md)
3. 按需阅读 Select、Where、Mutation 或 Transaction 页面

### 添加默认数据

1. [实现 Seed 数据](./implement-seed-data.md)
2. [定义 Seed](../seed/define-seed.md)
3. [创建 Seeder](../seed/create-seeder.md)

### 外部数据库接入

1. [接入外部数据库](./connect-external-database.md)
2. [连接配置](../database/connections.md)
3. [Schema Inspector](../schema-inspector/overview.md)
4. [Collections](../collections/overview.md)
5. [Collection Metadata](../collection-metadata/overview.md)

## 输出前检查

- 是否选对了代码位置，而不只是选对了 API？
- 是否区分 Manager 方法和 Connection 属性？
- 是否按[命名概念](../concepts/naming/overview.md)区分逻辑名、Connection 相对查询标识符和物理 identity？
- 是否保持事务 Connection 贯穿整个回调？
- 是否没有使用规划中或底层未导出的接口？
- 是否按[验证指南](./verification.md)运行了对应检查？
