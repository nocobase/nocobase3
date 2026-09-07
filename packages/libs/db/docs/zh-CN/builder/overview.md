---
title: Collection Builder
description: 选择 Collection Schema 的变更入口、DSL 和安全执行方式，并按任务进入对应专题。
---

# Collection Builder

`CollectionBuilder` 是 Migration 中创建和演进数据库结构的主要入口。它用逻辑 Collection 和 Field 名描述 Schema 变更，并负责把它们编译为当前数据库方言可执行的操作。

## 先判断是否该用 Builder

| 任务                                     | 推荐入口                                                     |
| ---------------------------------------- | ------------------------------------------------------------ |
| 持久化业务 Schema 演进                   | 在 `defineMigration()` 的 `up()` / `down()` 中使用 `builder` |
| 工具、测试或明确授权的运行时 Schema 管理 | `db.builder(name?)` 或 `connection.builder`                  |
| 只修改标题、描述等补充信息               | `connection.collectionMetadata`                              |
| 读写业务记录                             | `db.query()` 或上层 Repository                               |

External Connection 不允许真实 DDL。对业务 Schema 的长期变更，即使 Builder 可以在运行时直接执行，也应优先落入 Migration，获得顺序、事务和回滚边界。

## 选择表达方式

| 场景                      | 推荐表示      | 原因                          |
| ------------------------- | ------------- | ----------------------------- |
| Migration、插件代码、测试 | Fluent DSL    | 易读，适合直接编写 TypeScript |
| HTTP、CLI、配置文件       | Object DSL    | 可序列化，便于校验和传输      |
| diff、批量 apply、审计    | Operation DSL | 是可保存和检查的执行计划      |

同一个任务只选择一种主要表示。Migration 中通常直接使用 Fluent DSL；完整建表、字段选择和回滚示例见[在 Migration 中管理 Collection Schema](./collection-schema.md)。不要为了统一格式，把普通 Migration 转成手写 Operation 数组。

## 能力地图

| 任务           | API                                                                         | 何时使用                                 |
| -------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| 判断是否存在   | `hasCollection()`                                                           | 初始化工具或条件式 Schema 管理           |
| 创建表         | `createCollection()`、`createCollections()`                                 | 创建一个或批量创建多个 Table Collection  |
| 演进表结构     | `alterCollection()`                                                         | 集中表达同一个 Collection 的相关变更     |
| 重命名或删除表 | `renameCollection()`、`dropCollection()`                                    | 处理完整 Collection 生命周期             |
| 修改字段       | `addField()`、`alterField()`、`dropField()`                                 | 单一 Field 变更的快捷入口                |
| 修改索引       | `addIndex()`、`dropIndex()`                                                 | 创建或删除性能索引                       |
| 修改约束       | `addConstraint()`、`dropConstraint()`                                       | 创建或删除完整性约束                     |
| 管理普通 View  | `createViewCollection()`、`replaceViewCollection()`                         | 创建或替换结构化/Raw SQL View            |
| 管理物化 View  | `createMaterializedViewCollection()`、`refreshMaterializedViewCollection()` | 在支持的方言上创建或刷新物化视图         |
| 执行结构化计划 | `apply()`                                                                   | 执行、预览或审计 `CollectionOperation[]` |

这张表用于发现能力，不替代 Types。方法参数、可选项和返回类型都以公开声明为准。

## 按任务继续阅读

| 任务                                  | 文档                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| 创建、修改、重命名或删除表结构        | [在 Migration 中管理 Collection Schema](./collection-schema.md) |
| 定义 `belongsTo`、`hasMany` 等关系    | [关系字段](./relations.md)                                      |
| 创建普通视图或物化视图                | [View Collection](./view-collections.md)                        |
| 处理逻辑名、物理名和方言差异          | [命名与跨数据库兼容](./portability.md)                          |
| dry-run、SQL 预览、批量计划和风险检查 | [执行与审计](./execution.md)                                    |

## 执行前后的检查

大多数变更返回 `BuilderResult`。自动化或 destructive 场景至少检查：

- `operations`：调用方提交的逻辑计划；
- `schemaOperations`：编译后的数据库操作；
- `warnings`：能力降级或跳过信息；
- `impact`：是否包含 destructive 影响；
- `sql`：启用 `previewSql` 后可用的 SQL 预览。

删除 Field、删除 Collection 或使用方言敏感能力前，先 dry-run。`dryRun` 只负责预览，不替代调用方的授权和确认策略。

## 边界

- 传入 Builder 的 Collection、Field、Relation、Index 和 Constraint 引用都使用逻辑名。
- `title`、`description` 等补充 Metadata 与物理 Schema 是两类事实，不要混为数据库 comment。
- 不要直接拼 Knex Schema Builder，也不要生成任意 `tableName` 或 `columnName` 映射。
- `native`、Raw SQL View 和物化视图依赖具体方言，使用前先检查兼容性。
- 类型结构查 [API 使用索引](../reference/api-index.md)，不要从源码深路径导入。
