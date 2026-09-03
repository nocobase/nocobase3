---
title: 快速开始
description: 创建 DatabaseManager，用 Migration 建表、Seed 初始化数据、Query 查询记录，并正确释放数据库资源。
---

# 快速开始

本页演示一个最小数据库生命周期：创建 Manager、运行 Migration 和 Seed、查询数据、执行事务并释放资源。若只需要完成其中一种任务，先阅读[任务路由](./agent/task-router.md)。

## 1. 创建 DatabaseManager

```ts
import { createDatabaseManager } from '@nocobase/db';

const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: 'app.sqlite',
    },
  },
});
```

`createDatabaseManager()` 返回多连接 Manager。`db.connection()`、`db.builder()` 和 `db.query()` 都是 lazy 入口，不需要先 `await db.connect()`。

## 2. 用 Migration 创建业务 Schema

文件：`database/migrations/202609030001_create_orders.ts`

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609030001_create_orders',

  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.string('orderNo', { length: 64 }).notNull().unique();
      collection.string('status', { length: 32 }).notNull().defaultTo('draft');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('orders');
  },
});
```

运行 Migration：

```ts
await db
  .createMigrator({
    directory: './database/migrations',
    packageName: 'my-app',
  })
  .latest();
```

持久化业务 Schema 变更应写入新的 Migration。不要在启动代码里临时调用 Builder，也不要修改已发布 Migration。

## 3. 用 Seed 初始化数据

文件：`database/seeds/202609030002_create_default_order.ts`

```ts
import { defineSeed } from '@nocobase/db';

export default defineSeed({
  name: '202609030002_create_default_order',

  async run({ query }) {
    const existing = await query
      .selectFrom('orders')
      .select('orderNo')
      .where('orderNo', '=', 'SO-001')
      .executeTakeFirst();

    if (!existing) {
      await query
        .insertInto('orders')
        .values({ orderNo: 'SO-001', status: 'draft' })
        .execute();
    }
  },
});
```

Migration 必须先于 Seed 执行：

```ts
await db
  .createSeeder({
    directory: './database/seeds',
    packageName: 'my-app',
  })
  .run();
```

## 4. 查询数据

```ts
const orders = await db
  .query()
  .selectFrom('orders')
  .select(['id', 'orderNo', 'status'])
  .where('status', '=', 'draft')
  .execute();
```

`db.query()` 是数据库层 Query Adapter，不读取 Collection Metadata，也不是 Repository。

## 5. 执行事务

```ts
await db.transaction(async (connection) => {
  await connection.query
    .updateTable('orders')
    .set({ status: 'paid' })
    .where('orderNo', '=', 'SO-001')
    .execute();
});
```

事务内只使用回调参数里的 `connection`，不要回到外层 `db`。

## 6. 读取完整 Collection

```ts
const ordersCollection = await db.connection().collections.get('orders');
```

`collections` 合并物理 Schema、补充 Metadata 和 Connection naming。检查物理数据库对象时改用 `connection.schemaInspector`。

## 7. 释放资源

```ts
await db.destroy();
```

测试、脚本以及应用关闭流程都应释放 Manager 创建过的连接。

## 下一步

- 配置连接或管理生命周期：[Database](./database/overview.md)
- 修改业务 Schema：[Migration](./migration/overview.md)和 [Builder](./builder/overview.md)
- 查询或修改数据：[Query](./query/overview.md)和[事务](./database/transactions.md)
- 初始化安装数据：[Seed](./seed/overview.md)
- 读取完整 Collection 或补充 Metadata：[Collections](./collections/overview.md)和 [Collection Metadata](./collection-metadata/overview.md)
- 检查真实数据库结构：[Schema Inspector](./schema-inspector/overview.md)

仓库内的完整可运行示例位于 `packages/libs/db/examples/managed-collection-lifecycle`，执行：

```bash
pnpm --filter @nocobase/db example managed
```
