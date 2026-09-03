---
title: 数据库任务路由
description: 根据业务目标选择 @nocobase/db 的 Migration、Seed、Query、Collections、Schema Inspector 或 Metadata 用法。
---

# 数据库任务路由

先判断要改变或读取的对象，再选择公开入口。一个需求包含多种变更时应分别选择实现层；例如“新增表并写入默认状态”通常需要一个 Migration 和一个 Seed。

| 业务任务                                     | 推荐入口                                        | 用法说明                                                                 |
| -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| 创建或修改 Collection、字段、索引、约束      | Migration 中的 `builder`                        | [Migration](../migration/overview.md)、[Builder](../builder/overview.md) |
| 回填、转换或清理历史数据                     | Migration 中的 `query`                          | [定义 Migration](../migration/define-migration.md)                       |
| 写入安装默认角色、权限、配置或字典           | Seed 中的 `query`                               | [Seed](../seed/overview.md)                                              |
| 运行时查询或修改记录                         | `db.query()` / `connection.query`               | [Query](../query/overview.md)                                            |
| 原子执行多个操作                             | `db.transaction()` / `connection.transaction()` | [事务](../database/transactions.md)                                      |
| 读取完整 Collection 定义                     | `connection.collections`                        | [Collections](../collections/overview.md)                                |
| 检查真实表、列、索引或约束                   | `connection.schemaInspector`                    | [Schema Inspector](../schema-inspector/overview.md)                      |
| 更新 title、description 或 relation metadata | `connection.collectionMetadata`                 | [Collection Metadata](../collection-metadata/overview.md)                |
| 接入外部数据库                               | External Connection + Metadata Store            | [接入外部数据库](./connect-external-database.md)                         |
| 使用方言特有能力                             | 检查能力后使用 `connection.client()`            | [DatabaseConnection](../database/database-connection.md)                 |
| Collection-aware Repository CRUD             | 当前不可用                                      | Query 不是 Repository                                                    |

## 常见任务组合

### 新增或修改业务 Schema

- 先阅读[实现 Schema 变更](./implement-schema-change.md)，再按需进入 [Builder](../builder/overview.md) 和 [Migration 测试](../migration/testing.md)。

### 编写业务查询

- 先阅读[实现数据访问](./implement-data-access.md)，再按需进入 Select、Where、Mutation 或 Transaction 专题。

### 添加默认数据

- 先阅读[实现 Seed 数据](./implement-seed-data.md)，再按需进入[定义 Seed](../seed/define-seed.md)和[创建 Seeder](../seed/create-seeder.md)。

### 外部数据库接入

- 先阅读[接入外部数据库](./connect-external-database.md)，再根据目标组合[连接配置](../database/connections.md)、[Schema Inspector](../schema-inspector/overview.md)、[Collections](../collections/overview.md)和 [Collection Metadata](../collection-metadata/overview.md)。

实现前需要确认当前边界时阅读[实现护栏](./guardrails.md)；完成后根据[验证指南](./verification.md)选择验证范围。精确参数和返回类型始终以 TypeScript 类型声明为准。
