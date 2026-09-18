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

## 基础设施迁移来源的参数化

Migration 来源可以声明 `parameters: Readonly<Record<string, string>>`，用于指定固定的部署目标，例如队列的物理表名。Runner 将参数的冻结副本作为 `context.parameters` 传递给 `up` 和 `down`，在事务内执行时也不例外。表结构定义应保留在 Migration 本身中；参数用于标识存储目标，而不是提供运行时的字段定义。

加载器会对参数键排序，并将参数的 SHA-256 摘要追加到加载后的 Migration 名称中。因此，不同目标可以共用一个迁移目录和历史表；相同目标无论参数键的顺序如何，都会得到相同的名称。未使用参数的来源保留原有名称和校验和。源文件和编译产物的校验和仍用于验证迁移实现。对参数化来源调用 `upTo()` 时，应使用 `loadMigrations()` 返回的加载后名称。后续执行和回滚时应保留已配置的参数；修改参数不会重命名或复制已有表。

## 条件迁移

`MigrationDefinition` 可以声明 `shouldRun(context): boolean | Promise<boolean>`。Runner 在持有迁移锁时对待执行的 Migration 求值，求值发生在其 `up` 事务启动之前。条件判断必须是只读操作。返回 `false` 时，迁移名称会出现在 `skipped` 中，但不会写入执行历史或递增批次号；后续运行时会再次判断条件。抛出错误会导致本次运行失败。已执行的 Migration 不会重新判断条件；回滚时，即使当前条件为 `false`，仍会执行其 `down`。

来源选择仍然决定 Migration 使用哪个连接以及哪些固定目标参数。通过配置参与迁移的来源避免打开无关数据库，通过 `shouldRun` 判断迁移是否适用。队列驱动与数据库方言是不同的概念。

Migration 来源还可以携带 `configuration`，即传递给条件判断和迁移操作的只读运行时配置记录列表。与固定目标参数 `parameters` 不同，这些记录不参与历史记录标识的计算。应用规划器将共享同一物理目标的配置分组，因此只要其中一个配置适用，就足以启用该目标的迁移。历史表结构定义必须保持自包含。
