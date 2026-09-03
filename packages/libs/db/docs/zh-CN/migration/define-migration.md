---
title: defineMigration()：定义 Migration 文件
description: Migration 文件的唯一合法形状、Context、事务、回滚、自包含和不可变规则。
---

# `defineMigration()`：定义 Migration 文件

Migration 描述一个固定、可追踪的数据库版本变更。持久化业务 Schema 变更、升级数据回填和历史数据修正都应创建新的 Migration。

## 文件形状

文件名：

```text
202609030001_create_orders.ts
```

文件内容：

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609030001_create_orders',

  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.string('orderNo').notNull().unique();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('orders');
  },
});
```

文件必须 default export `defineMigration({...})` 的结果。`name` 与文件名主体一致，并在全部 sources 中全局唯一。

## 定义契约

```ts
interface MigrationDefinition {
  readonly name: string;
  readonly transaction?: true | false | 'auto';
  readonly irreversible?: boolean;
  up(context: MigrationContext): Promise<void>;
  down?(context: MigrationContext): Promise<void>;
}
```

普通 Migration 省略 `transaction`，默认使用 `'auto'`。没有可靠反向操作时省略 `down()` 并声明 `irreversible: true`。

## Migration Context

| 属性                      | 使用场景                                              |
| ------------------------- | ----------------------------------------------------- |
| `builder`                 | Collection、Field、Index、Constraint、View 等结构变更 |
| `query`                   | 数据回填、修正和清理                                  |
| `connection.dialect`      | 判断数据库方言                                        |
| `connection.capabilities` | 判断数据库能力                                        |
| `connection.client()`     | 高层 API 无法表达的 adapter 特有能力                  |

Context 顶层没有 `database`、`schema`、`client` 或 `dialect`。Runner 在事务 Connection 上创建 Context；不要从 Migration 回到外层 Manager。

## 自包含和不可变

- 在 Migration 中明确声明每个 Schema 操作。
- 不导入实时 Collection Schema、Field 定义、Model 定义或注册表。
- `down()` 按依赖安全顺序执行明确的反向操作。
- 引入分支合并后不再修改该 Migration，后续修正创建新文件。
- 不使用硬编码旧 checksum 绕过历史校验。

继续阅读：[创建 Migrator](./create-migrator.md)、[执行与测试](./testing.md)、[Agent Schema 工作流](../agent/implement-schema-change.md)。
