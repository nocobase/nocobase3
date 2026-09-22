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
| `query`                   | 数据回填、修正和清理的默认工具                        |
| `repository`              | `query` 会写错的少数场景，见下                        |
| `connection.dialect`      | 判断数据库方言                                        |
| `connection.capabilities` | 判断数据库能力                                        |
| `connection.client()`     | 高层 API 无法表达的 adapter 特有能力                  |

Context 顶层没有 `database`、`schema`、`client` 或 `dialect`。Runner 在事务 Connection 上创建 Context；不要从 Migration 回到外层 Manager。

### 何时用 repository

数据操作的默认工具是 `query`。**`query` 能正确表达的，就用 `query`**；`repository` 只用在 `query` 会写错的地方：

- 跨方言的字段编解码，典型是 JSON 与时间字段。用 `query` 时每条 Migration 要自己 `JSON.stringify`，读回还要写 `typeof row.x === 'string' ? JSON.parse(row.x) : row.x` 这样的方言兜底。
- Collection 级命名覆盖，`query` 只按 Connection 命名策略工作，不认字段级覆盖。
- 关系写入，包括 `belongsToMany` 背后的中间表行。

`repository(name)` 解析的是**数据库中的** Collection 定义，也就是前序 `builder` 操作写入的 metadata，因此它没有违反"不导入运行时定义"这条约束。但它依赖的形状不是本条 Migration 自己声明的，所以：

- 用了就在注释里写清楚 `query` 为什么不够。
- 不要在 `down()` 里用。回滚时 Collection 已经不是 `up()` 留下的样子了。
- 不要用它遍历全表。逐行 `findMany` + `updateOne` 是要避免的形状，集合式的 `query` 语句既正确又有界。

```ts
async up({ builder, repository }) {
  await builder.alterCollection('orders', (collection) => {
    collection.json('labels');
  });
  // query 无法表达 labels 的跨方言 JSON 编码。
  await repository('orders').updateMany({
    filter: { status: 'draft' },
    values: { labels: [] },
  });
}
```

Repository 绑定在本次 Migration 所在的 Connection 上，在事务中即事务 Connection：Migration 失败时它写入的数据会一并回滚。这也是 Migration 的服务容器不放行 `DatabaseManager` 的原因 —— 从那里取到的 Repository 会写在事务之外。

## 自包含和不可变

- 在 Migration 中明确声明每个 Schema 操作。
- 不导入实时 Collection Schema、Field 定义、Model 定义或注册表。`context.repository` 读的是数据库中的 metadata，不在此列。
- `down()` 按依赖安全顺序执行明确的反向操作。
- 引入分支合并后不再修改该 Migration，后续修正创建新文件。
- 不使用硬编码旧 checksum 绕过历史校验。

继续阅读：[创建 Migrator](./create-migrator.md)、[执行与测试](./testing.md)、[业务 Schema 变更指南](../agent/implement-schema-change.md)。
