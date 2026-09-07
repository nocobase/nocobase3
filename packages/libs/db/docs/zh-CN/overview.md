---
title: '@nocobase/db 概览'
description: 根据数据库任务选择 DatabaseManager、Builder、Query、Collections、Migration、Seed 或 Metadata。
---

# `@nocobase/db` 概览

`@nocobase/db` 提供多数据库连接管理、Collection Schema 构建、数据库层查询、事务、Migration、Seed、物理 Schema 检查和 Collection Metadata 解析。

## 按任务选择入口

| 要做什么                  | 首选入口                                              |
| ------------------------- | ----------------------------------------------------- |
| 创建数据库入口            | `createDatabaseManager()`                             |
| 修改业务 Schema           | Migration 中的 `builder`                              |
| Collection 记录与关系读写 | `db.repository(name)` / `connection.repository(name)` |
| 数据库层查询组合          | `db.query()` / `connection.query`                     |
| 原子执行多个操作          | `db.transaction()` / `connection.transaction()`       |
| 读取完整 Collection       | `connection.collections`                              |
| 检查物理数据库对象        | `connection.schemaInspector`                          |
| 更新补充 Metadata         | `connection.collectionMetadata`                       |
| 初始化安装数据            | `defineSeed()` + `db.createSeeder()`                  |

选择入口时先判断任务操作的是 Schema、业务数据、物理数据库结构，还是补充 Metadata。这些能力不能互相替代；完整判断见[任务路由](./agent/task-router.md)。

## 对象关系

```text
createDatabaseManager(config)
  -> DatabaseManager                         application scope
       -> connection(name?)
       -> builder(name?)
       -> query(name?)
       -> repository(collection, connection?)
       -> transaction(fn, name?)
       -> createMigrator(options)
       -> createSeeder(options)
            |
            v
       DatabaseConnection                    connection scope
         -> builder                          schema writes
         -> query                            record reads/writes
         -> repository(collection)           Collection-aware reads/writes
         -> collections                      resolved Collections
         -> transaction()
         -> schemaInspector                  physical schema reads
         -> collectionMetadata               supplemental metadata
```

## 推荐阅读路径

1. [快速开始](./quick-start.md)
2. 根据任务进入 [Repository](./repository/overview.md)、[Builder](./builder/overview.md)、[Query](./query/overview.md)、[Migration](./migration/overview.md)、[Seed](./seed/overview.md)或其他专题
3. 遇到名称或 Metadata 边界时阅读[核心概念](./concepts/README.md)
4. 需要按名称定位公开能力时使用[公开 API 导航](./reference/api-index.md)
5. 需要查阅全部主题时使用[完整文档目录](./toc.md)

## 文档可信级别

| 目录                                  | 用途                         | 使用边界                             |
| ------------------------------------- | ---------------------------- | ------------------------------------ |
| [`concepts/`](./concepts/README.md)   | 当前稳定概念和 API 边界      | 用于理解，不替代具体 API 文档        |
| `database/`、`builder/`、`query/` 等  | 当前公开能力的选择与推荐用法 | 可指导当前代码，以类型声明为最终依据 |
| [`internals/`](./internals/README.md) | 当前底层实现和维护者设计     | 仅用于维护或诊断，不要绕过公开入口   |
| [`proposals/`](./proposals/README.md) | 候选设计与演进记录           | 不作为当前 API 契约                  |
| [`archive/`](./archive/README.md)     | 已被取代的历史材料           | 不可用于当前代码                     |

## 当前边界

- Repository 及 Filter/Select/Sort Builder 与 AST 已公开；当前契约见 [Repository](./repository/overview.md)，历史提案不是用法依据。
- Builder 使用 Collection/Field 逻辑名。
- Query 使用 Connection 级查询标识符，不读取 Collection Metadata。
- Schema Inspector 使用物理数据库 identity。
- `connection.client()` 是最后的 adapter 逃生口，不是常规数据库入口。
