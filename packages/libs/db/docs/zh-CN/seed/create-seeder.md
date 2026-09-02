---
title: db.createSeeder()：创建和运行 Seeder
description: 使用 DatabaseManager 绑定单个或多个 Seed source，并理解执行历史、checksum、锁和失败重试。
---

# `db.createSeeder()`：创建和运行 Seeder

优先使用 Manager 方法创建绑定当前数据库的 runner：

```ts
const seeder = db.createSeeder({
  connection: 'main',
  directory: './database/seeds',
  packageName: 'my-app',
});

const result = await seeder.run();
```

## 配置

| 配置            | 用途                                                |
| --------------- | --------------------------------------------------- |
| `directory`     | 单一 Seed 目录                                      |
| `packageName`   | 单一来源的归属；省略时默认为 `app`                  |
| `sources`       | 多个 `{ packageName, directory, extensions? }` 来源 |
| `connection`    | 目标命名连接；省略时使用默认连接                    |
| `tableName`     | 自定义 Seed 历史表                                  |
| `lockTableName` | 自定义 Seed 锁表                                    |

安装器应先运行 Migration，再运行 Seed：

```ts
await db.createMigrator(migrationOptions).latest();
await db.createSeeder(seedOptions).run();
```

## 执行结果和历史

`run()` 返回：

```ts
interface SeedRunResult {
  readonly executed: string[];
  readonly skipped: string[];
}
```

Seeder 合并 sources 后按全局 `name` 排序。成功执行后写入 checksum 历史；再次运行跳过已执行文件。已执行 Seed 的 checksum 改变时停止执行。

执行期间持有 Seed lock。默认每个 Seed 使用独立事务；失败时不写历史，也不继续执行后续 Seed。

底层 `createSeeder({ database, ...options })` 仍然公开，但上层已有 `DatabaseManager` 时不要重复传 `database`。
