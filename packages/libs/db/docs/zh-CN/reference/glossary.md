---
title: DB 术语表
description: 定义 @nocobase/db 当前实现中的 Collection、Metadata、命名、连接、查询、Migration 和 Seed 术语。
---

# DB 术语表

| 术语                        | 中文说明                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Collection                  | 应用层数据模型抽象，可以映射到表、视图或物化视图。                                                  |
| Collection DSL              | 描述 Collection 的结构化定义语言。                                                                  |
| Collection Builder          | 执行 Collection 创建和变更的核心 API。                                                              |
| CollectionOperation         | `builder.apply()` 接收并从根入口导出的结构化 Schema 执行计划类型。                                  |
| Field                       | Collection 的应用层字段。                                                                           |
| Column                      | 数据库物理列。                                                                                      |
| `field.name`                | 应用层字段名。                                                                                      |
| `collection.name`           | 应用层 Collection 名称。                                                                            |
| `naming.underscored`        | 是否把逻辑表名和字段名转换为小写下划线，默认 `true`。                                               |
| `naming.tablePrefix`        | Connection 默认、可由 Collection 局部覆盖的物理表或视图名前缀，不作用于列名。                       |
| Deterministic naming        | 通过 `underscored` 和表前缀配置从逻辑名确定性生成物理名。                                           |
| 逻辑名                      | 应用层名称，例如 Collection 名和 Field 名。                                                         |
| 物理名                      | 数据库对象名称，例如 table、view、column 名。                                                       |
| Metadata                    | 数据库无法完整表达的应用层补充语义，例如 title、description 和 relation。                           |
| Metadata Store              | 保存补充 Collection Metadata 文档的后端，通过 Manager 或 Connection 配置。                          |
| Collection Metadata Service | `connection.collectionMetadata` 暴露的读取、更新、校验和并发控制服务。                              |
| Connection Collections      | `connection.collections` 暴露的完整 Collection 解析、列举、缓存和校验入口。                         |
| `db.comment`                | 数据库层 comment，不等同于应用层 description。                                                      |
| Constraint                  | 数据完整性约束，例如 primary、unique、foreign key。                                                 |
| Index                       | 查询性能索引。                                                                                      |
| SchemaAdapter               | Builder 和底层数据库 schema builder 之间的适配接口。                                                |
| KnexSchemaAdapter           | 当前基于 Knex 的 SchemaAdapter 实现。                                                               |
| DatabaseManager             | 管理默认连接和命名连接的入口。                                                                      |
| DatabaseConnection          | 一个具体数据库连接。                                                                                |
| Dialect                     | 用户配置中的数据库类型，例如 `sqlite`、`postgres`、`mysql`、`oracle`、`mssql`。                     |
| Database driver             | 用户配置中的底层 Node.js 数据库驱动，例如 `better-sqlite3`、`pg`、`mysql2`、`oracledb`、`tedious`。 |
| Adapter client              | 内部 adapter 暴露的底层 client。默认 Knex adapter 下，`connection.client()` 返回 Knex 实例。        |
| QueryAdapter                | 数据库层 Query Builder，不是 Repository。                                                           |
| Connection 相对查询标识符   | Query 接收的不带 Connection 前缀的表或字段标识符；Query 会应用 Connection naming。                  |
| Schema Inspector            | 使用物理 identity 只读检查数据库表、View、字段、Index 和 Constraint 的连接级入口。                  |
| Migration                   | 版本化数据库变更文件。                                                                              |
| Migrator                    | Migration 执行器，负责加载文件、执行 pending Migration、写 History、控制事务和 Lock。               |
| Migration History           | 记录已执行 migration 的数据库表。                                                                   |
| Migration Lock              | 避免多个进程同时执行 migration 的锁。                                                               |
| Seed                        | 只向前执行的初始化数据文件，不用于 Schema 变更或历史数据迁移。                                      |
| Seeder                      | Seed 执行器，负责加载文件、执行 Pending Seed、写 History 和控制事务。                               |

## 命名规则

文档文件名、API 名、类型名保持英文。中文文档中的概念解释可以使用中文，但不要翻译 API 名称。

例如：

- 使用 `createCollection`，不要写成“创建集合方法”。
- 使用 `CollectionOperation` 或 `builder.apply()`，不要写成“集合操作”。
- 使用 `SchemaAdapter`，不要写成“结构适配器”。

## 使用注意事项

代码和 API 说明应优先使用英文 API 名和类型名，中文只用于解释含义。涉及命名映射时，应按照[命名概念](../concepts/naming/overview.md)明确区分逻辑名、Connection 相对查询标识符和物理名。

Repository、Select AST、Filter Builder、Filter AST、Sort AST 和 Mutation AST 当前未实现，不属于本术语表描述的当前 API；相关名词只在 [Repository 提案](../proposals/repository/overview.md)中使用。
