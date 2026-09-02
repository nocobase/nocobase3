---
title: @nocobase/db 概览
description: 从 DatabaseManager 进入 Builder、Query、Collections、Transaction、Migration、Seed 和 Collection Metadata。
---

# `@nocobase/db` 概览

`@nocobase/db` 提供多数据库连接管理、Collection Schema 构建、数据库层查询、事务、Migration、Seed、物理 Schema 检查和 Collection Metadata 解析。

## 从任务开始

AI Agent 在写代码前先阅读 [Agent 任务路由](./agent/task-router.md)。它会同时确定 API、代码文件位置和最低验证。

| 要做什么            | 首选入口                                        |
| ------------------- | ----------------------------------------------- |
| 创建数据库入口      | `createDatabaseManager()`                       |
| 修改业务 Schema     | Migration 中的 `builder`                        |
| 查询或修改记录      | `db.query()` / `connection.query`               |
| 原子执行多个操作    | `db.transaction()` / `connection.transaction()` |
| 读取完整 Collection | `connection.collections`                        |
| 检查物理数据库对象  | `connection.schemaInspector`                    |
| 更新补充 Metadata   | `connection.collectionMetadata`                 |
| 初始化安装数据      | `defineSeed()` + `db.createSeeder()`            |

## 对象关系

```text
createDatabaseManager(config)
  -> DatabaseManager                         application scope
       -> connection(name?)
       -> builder(name?)
       -> query(name?)
       -> transaction(fn, name?)
       -> createMigrator(options)
       -> createSeeder(options)
            |
            v
       DatabaseConnection                    connection scope
         -> builder                          schema writes
         -> query                            record reads/writes
         -> collections                      resolved Collections
         -> transaction()
         -> schemaInspector                  physical schema reads
         -> collectionMetadata               supplemental metadata
```

## 阅读路径

1. [快速开始](./quick-start.md)
2. [Database 概览](./database/overview.md)
3. [Builder](./builder/overview.md) 或 [Query](./query/overview.md)
4. [Collections](./collections/overview.md)、[Schema Inspector](./schema-inspector/overview.md) 或 [Collection Metadata](./collection-metadata/overview.md)
5. [Migration](./migration/overview.md) 和 [Seed](./seed/overview.md)
6. [API 索引](./reference/api-index.md)

## 当前边界

- Repository、Select AST、Filter Builder、Filter AST 和 Sort AST 是规划设计，当前不可调用。
- Builder 使用 Collection/Field 逻辑名。
- Query 使用 Connection 级查询标识符，不读取 Collection Metadata。
- Schema Inspector 使用物理数据库 identity。
- `connection.client()` 是最后的 adapter 逃生口，不是常规数据库入口。
