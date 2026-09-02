---
title: Migration 概览
description: 使用 defineMigration() 声明版本变更，并通过 db.createMigrator() 加载、执行、记录和回滚 Migration。
---

# Migration 概览

Migration 用于按顺序应用持久化数据库变更。文件声明固定历史，Migrator 负责加载、校验、事务、执行记录、checksum、锁和回滚。

```text
defineMigration()
  -> migration files
  -> db.createMigrator(options)
  -> latest() / upTo(name) / rollback()
```

## 先选择实现层

| 需求                                                  | Migration Context 入口                           |
| ----------------------------------------------------- | ------------------------------------------------ |
| 创建或修改 Collection、Field、Index、Constraint、View | `builder`                                        |
| 回填、修正或清理数据                                  | `query`                                          |
| 判断方言或数据库能力                                  | `connection.dialect` / `connection.capabilities` |
| 高层 API 无法表达的方言能力                           | `connection.client()`                            |

普通 Migration 不需要底层 client。Builder 使用逻辑名并负责命名、能力检查和 Metadata 同步；Query 不读取 Collection Metadata。

## 两个核心入口

### 定义文件

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609030001_create_orders',
  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('orders');
  },
});
```

### 创建 Runner

```ts
const migrator = db.createMigrator({
  directory: './database/migrations',
  packageName: 'my-app',
});

await migrator.latest();
```

## 不可变规则

- Migration 文件名主体与 `name` 一致，且全局唯一。
- Migration 自包含，不引用会演化的运行时 Schema 定义。
- 引入分支合并后不再修改，后续修正创建新的 Migration。
- 可逆变更提供真实 `down()`；不可逆时声明 `irreversible: true`。
- 添加真实数据库测试，验证 `up` 和可逆时的 `down`。

## 文档地图

- [定义 Migration](./define-migration.md)
- [创建和运行 Migrator](./create-migrator.md)
- [Migration 测试](./testing.md)
- [Migration 维护清单](../development/migration-maintenance.md)
- [Agent Schema 实现流程](../agent/implement-schema-change.md)
