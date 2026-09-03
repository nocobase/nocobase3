---
title: db.createMigrator()：创建和运行 Migrator
description: 使用 DatabaseManager 绑定单个或多个 Migration source，并执行 latest、upTo 和 rollback。
---

# `db.createMigrator()`：创建和运行 Migrator

优先使用 Manager 方法创建绑定当前数据库的 runner：

```ts
const migrator = db.createMigrator({
  connection: 'main',
  directory: './database/migrations',
  packageName: 'my-app',
});
```

## 配置

| 配置            | 用途                                                |
| --------------- | --------------------------------------------------- |
| `directory`     | 单一 Migration 目录                                 |
| `packageName`   | 单一来源的归属；省略时默认为 `app`                  |
| `sources`       | 多个 `{ packageName, directory, extensions? }` 来源 |
| `connection`    | 目标命名连接；省略时使用默认连接                    |
| `tableName`     | 自定义 Migration 历史表                             |
| `lockTableName` | 自定义 Migration 锁表                               |

`directory`/`packageName` 与 `sources` 表达两种加载方式。插件安装器通常用 `sources` 合并多个 package，并把各自 `package.json.name` 作为 `packageName`。

## 执行 API

```ts
const latestResult = await migrator.latest();
const targetResult = await migrator.upTo('202609030001_create_orders');
const rollbackResult = await migrator.rollback();
```

| API          | 行为                                             |
| ------------ | ------------------------------------------------ |
| `latest()`   | 执行全部 pending Migration                       |
| `upTo(name)` | 执行至目标 Migration，包含目标，不回滚其后的历史 |
| `rollback()` | 反向回滚最近一个 batch                           |

Migration 按全局 `name` 字符串排序。`packageName` 只用于归属、历史和诊断，不参与排序或 identity。

## 历史、锁和缓存

- Runner 验证已执行 Migration 的 checksum。
- 执行期间持有 Migration lock，防止并发 runner。
- 默认每个 Migration 使用事务，变更和历史记录共享事务。
- 成功执行或回滚后，目标 Connection 的 Collections 缓存会失效。
- `schemaManagement: 'external'` 的 Connection 禁止运行 Migration。

底层 `createMigrator({ database, ...options })` 仍然公开，但上层已有 `DatabaseManager` 时不要重复传 `database`。
