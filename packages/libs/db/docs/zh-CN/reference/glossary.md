# 术语表

| 术语                      | 中文说明                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Collection                | 应用层数据模型抽象，可以映射到表、视图或物化视图。                                           |
| Collection DSL            | 描述 Collection 的结构化定义语言。                                                           |
| Collection Builder        | 执行 Collection 创建和变更的核心 API。                                                       |
| Collection Generator      | 从已有数据库元数据生成 Collection 的目标组件，当前未实现。                                   |
| CollectionOperation       | Builder 的结构化执行计划。                                                                   |
| Field                     | Collection 的应用层字段。                                                                    |
| Column                    | 数据库物理列。                                                                               |
| `field.name`              | 应用层字段名。                                                                               |
| `collection.name`         | 应用层 Collection 名称。                                                                     |
| `naming.underscored`      | 是否把逻辑表名和字段名转换为小写下划线，默认 `true`。                                        |
| `naming.tablePrefix`      | Connection 默认或 Collection 局部覆盖的物理表名前缀。                                        |
| Deterministic naming      | 通过 `underscored` 和表前缀配置从逻辑名确定性生成物理名。                                    |
| `naming.tablePrefix`      | 推导表名或视图名时添加的前缀，不作用于列名。                                                 |
| 逻辑名                    | 应用层名称，例如 Collection 名和 Field 名。                                                  |
| 物理名                    | 数据库对象名称，例如 table、view、column 名。                                                |
| Metadata                  | 应用层元信息，例如 title、description、interface、uiSchema。                                 |
| `db.comment`              | 数据库层 comment，不等同于应用层 description。                                               |
| Constraint                | 数据完整性约束，例如 primary、unique、foreign key。                                          |
| Index                     | 查询性能索引。                                                                               |
| SchemaAdapter             | Builder 和底层数据库 schema builder 之间的适配接口。                                         |
| KnexSchemaAdapter         | 当前基于 Knex 的 SchemaAdapter 实现。                                                        |
| DatabaseManager           | 管理默认连接和命名连接的入口。                                                               |
| DatabaseConnection        | 一个具体数据库连接。                                                                         |
| Dialect                   | 用户配置中的数据库类型，例如 `sqlite`、`postgres`、`mysql`、`oracle`。                       |
| Database driver           | 用户配置中的底层 Node.js 数据库驱动，例如 `better-sqlite3`、`pg`、`mysql2`、`oracledb`。     |
| Adapter client            | 内部 adapter 暴露的底层 client。默认 Knex adapter 下，`connection.client()` 返回 Knex 实例。 |
| QueryAdapter              | 数据库层 Query Builder，不是 Repository。                                                    |
| Migration                 | 版本化数据库变更文件。                                                                       |
| Migration Runner          | migration 执行器，负责加载文件、执行 pending migration、写 history、控制事务和 lock。        |
| Migration History         | 记录已执行 migration 的数据库表。                                                            |
| Migration Lock            | 避免多个进程同时执行 migration 的锁。                                                        |
| Repository                | 计划中的 Collection-aware 常规数据访问封装，当前未实现。                                     |
| Select AST                | 计划中的 Repository 结果选择树，描述标量字段、relation 和嵌套返回形状。                      |
| Repository Filter Builder | 计划中的 Repository 筛选条件代码 DSL，当前未实现。                                           |
| Filter AST                | 计划中的 Repository 筛选条件结构化表示，当前未实现。                                         |
| Sort AST                  | 计划中的 Repository 排序结构，区分直接字段、to-one relation field 和 relation aggregate。    |
| Filter operator group     | 字段类型对应的筛选操作符分组，例如 string、number、date、select、relation。                  |
| `context`                 | Repository operation 中用于解析 filter 变量的运行时上下文。                                  |
| `filter.variable()`       | 计划中的变量值表达式入口，例如 `filter.variable('$user.id')`。                               |
| Model                     | 计划中的模型封装，当前未实现。                                                               |
| Transformer               | 计划中的数据转换层，当前未实现。                                                             |

## 命名规则

文档文件名、API 名、类型名保持英文。中文文档中的概念解释可以使用中文，但不要翻译 API 名称。

例如：

- 使用 `createCollection`，不要写成“创建集合方法”。
- 使用 `CollectionOperation`，不要写成“集合操作”。
- 使用 `SchemaAdapter`，不要写成“结构适配器”。

## Agent 注意事项

Agent 生成代码或解释 API 时，应优先使用英文 API 名和类型名，中文只用于解释含义。

涉及命名映射时，应明确区分逻辑名和物理名。

涉及 Repository 查询时，应明确区分：

- Select AST：描述返回字段和 relation 结果树。
- Filter Builder：TypeScript 代码中的 callback DSL。
- Filter AST：HTTP、CLI、file sync 和持久化配置可以使用的结构化数据。
- Sort AST：描述排序优先级、目标、方向、NULL 位置和关系排序语义。
- NocoBase 既有 object filter：兼容层或序列化目标之一，不作为未来 Repository 代码 API 的首选形态。
