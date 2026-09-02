---
title: AI Agent 数据库开发入口
description: 面向编写 NocoBase 业务代码的 AI Agent，提供任务路由、API 选择、实现护栏和验证入口。
---

# AI Agent 数据库开发入口

本组文档帮助 Agent 先选对实现层，再生成可编译、可测试的代码。不要从 API 名称猜实现方式；先根据业务任务阅读[任务路由](./task-router.md)。

## 核心对象

```text
createDatabaseManager(config)
  -> DatabaseManager
       -> connection(name?)
       -> builder(name?)
       -> query(name?)
       -> transaction(fn, name?)
       -> createMigrator(options)
       -> createSeeder(options)
            |
            v
       DatabaseConnection
         -> builder
         -> query
         -> collections
         -> transaction()
         -> schemaInspector
         -> collectionMetadata
```

`DatabaseManager` 上的 `connection()`、`builder()` 和 `query()` 是方法。`DatabaseConnection` 上的 `builder`、`query`、`collections`、`schemaInspector` 和 `collectionMetadata` 是属性。

## 五条最高优先级规则

1. 持久化业务 Schema 变更写成新的 Migration；不要在应用启动时临时修改 Schema。
2. Migration 的结构变更使用 `builder`，数据变更使用 `query`；Seed 只初始化数据。
3. 事务内只使用回调参数里的 `connection`，不要回到外层 `db`。
4. Builder 和 Collections 使用 Collection 逻辑名；Schema Inspector 使用物理数据库 identity。
5. Repository 尚未实现；不要生成 `db.repository()` 或 `connection.repository()`。

## 按任务继续

| 任务                            | 阅读                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| 创建或修改业务 Schema           | [实现 Schema 变更](./implement-schema-change.md)                  |
| 编写运行时查询和事务            | [实现数据访问](./implement-data-access.md)                        |
| 添加安装默认数据                | [实现 Seed 数据](./implement-seed-data.md)                        |
| 读取 Collection 或维护 Metadata | [Collection 与 Metadata](./work-with-collections-and-metadata.md) |
| 接入外部数据库                  | [接入外部数据库](./connect-external-database.md)                  |
| 检查禁止项和危险边界            | [实现护栏](./guardrails.md)                                       |
| 确认测试和完成条件              | [验证指南](./verification.md)                                     |

## 当前 API 状态

- 当前可用：DatabaseManager、DatabaseConnection、Builder、Query、Collections、Schema Inspector、Migration、Seed、Collection Metadata。
- 高级逃生口：`connection.schema`、`connection.client()`、独立 `createMigrator()`、独立 `createSeeder()`。
- 规划中、不可生成：Repository、Select AST、Filter Builder、Filter AST、Sort AST、Writable File Metadata Store。
