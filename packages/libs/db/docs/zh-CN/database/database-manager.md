---
title: DatabaseManager：应用级数据库入口
description: DatabaseManager 的默认连接快捷 API、Migrator、Seeder 和连接生命周期契约。
---

# `DatabaseManager`：应用级数据库入口

## 使用边界

| 项目     | 内容                                                |
| -------- | --------------------------------------------------- |
| 创建方式 | `createDatabaseManager(config)`                     |
| 作用域   | 一个应用使用的全部命名连接                          |
| 默认连接 | `config.default`，否则当前实现选择第一个 Connection |
| Lazy API | `connection()`、`builder()`、`query()`              |
| 资源释放 | `await db.destroy()`                                |
| 不负责   | Collection-aware Repository                         |

## 常用 API

| API                          | Async | 等价关系或用途                        |
| ---------------------------- | ----: | ------------------------------------- |
| `db.connection(name?)`       |    否 | 获取具体 `DatabaseConnection`         |
| `db.builder(name?)`          |    否 | `db.connection(name).builder`         |
| `db.query(name?)`            |    否 | `db.connection(name).query`           |
| `db.transaction(fn, name?)`  |    是 | `db.connection(name).transaction(fn)` |
| `db.createMigrator(options)` |    否 | 创建绑定当前 Manager 的 Migrator      |
| `db.createSeeder(options)`   |    否 | 创建绑定当前 Manager 的 Seeder        |

对于一段连续的命名连接操作，优先保留 Connection：

```ts
const analytics = db.connection('analytics');

await analytics.query.selectFrom('events').selectAll().execute();
```

## 生命周期

| API                 | 用途                                |
| ------------------- | ----------------------------------- |
| `connect(name?)`    | 显式连接并返回 Connection           |
| `disconnect(name?)` | 断开已创建的指定连接                |
| `reconnect(name?)`  | 重连指定连接                        |
| `destroy()`         | 断开并清空 Manager 创建过的全部连接 |

`connection()`、`builder()` 和 `query()` 不需要 `await`。底层 client 由实际操作惰性创建。

## 不存在的入口

当前不提供 `db.repository()`。根据任务使用 Query；Repository 页面属于提案，不能把其中接口用于运行时代码。
