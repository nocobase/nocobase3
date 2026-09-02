---
title: 快速开始
description: 使用 DatabaseManager 管理 Collection、查询、Migration、Seed、事务和多连接，并了解底层 client 的使用边界。
---

# 快速开始

这篇文档用一条当前可运行的主线介绍数据库入口：从 `createDatabaseManager()` 创建多连接管理器，到通过 `db.builder()` 管理 Collection，通过 `db.query()` 做数据库层查询，再运行 Migration、Seed，并在事务和多连接场景中保持同一套心智。

当前可用入口包括：

- `createDatabaseManager()`
- `db.connection()`
- `db.builder()`
- `db.query()`
- `defineMigration()`
- `db.createMigrator()`
- `defineSeed()`
- `db.createSeeder()`
- `db.transaction()`

`db.repository()` 还没有实现，不属于本篇的可复制代码路径。Repository 的规划见 [Repository 概览](./repository/overview.md)，Migration 的详细约束见 [Migration](./migration/overview.md)。底层 adapter client 是最后的兜底入口，放在本文末尾介绍。

## 创建 DatabaseManager

```ts
import { createDatabaseManager } from '@nocobase/db';

const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: ':memory:',
    },
  },
});
```

`createDatabaseManager()` 返回的是 `DatabaseManager`，不是单个数据库连接。它负责管理默认连接和多个命名连接。

```ts
const connection = db.connection();
```

`db.connection()` 返回默认连接。它是 lazy handle，只有实际执行数据库操作时才会创建底层 adapter client。

## 使用 db.builder()

`db.builder()` 返回默认连接上的 `CollectionBuilder`，用于建表、改表、定义字段、关系、索引、约束、视图以及同步 Collection metadata。

```ts
await db.builder().createCollection('orders', (collection) => {
  collection.increments('id');
  collection.string('orderNo');
  collection.decimal('amount', { precision: 12, scale: 2 });
  collection.string('status').defaultTo('draft');
  collection.datetime('createdAt');
});
```

Builder 固定把 Collection 逻辑名编译到数据库物理名：

```text
orders.createdAt -> orders.created_at
orders.orderNo -> orders.order_no
```

如果单个 Collection 需要表前缀，可以写：

```ts
await db.builder().createCollection('orderItems', (collection) => {
  collection.naming({ tablePrefix: 'archive_' });

  collection.increments('id');
  collection.string('orderNo');
  collection.datetime('createdAt');
});
```

对应的物理名称是 `archive_order_items.order_no` 和 `archive_order_items.created_at`。Collection DSL 不支持任意 `tableName` 或 `columnName` 映射。

## 使用 db.query()

`db.query()` 返回默认连接上的 `QueryAdapter`。它是数据库层查询接口，不是 Repository，也不读取 Collection metadata。

```ts
await db
  .query()
  .insertInto('orders')
  .values({
    orderNo: 'SO-001',
    amount: 99.5,
    status: 'paid',
    createdAt: new Date(),
  })
  .execute();

const rows = await db
  .query()
  .selectFrom('orders')
  .select(['id', 'orderNo', 'createdAt'])
  .where('status', '=', 'paid')
  .orderBy('createdAt', 'desc')
  .limit(20)
  .execute();
```

查询终止方法推荐保持语义明确：

```ts
const rows = await db
  .query()
  .selectFrom('orders')
  .where('status', '=', 'paid')
  .execute();

const row = await db
  .query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .executeTakeFirst();
```

`execute()` 返回当前查询匹配的所有行；`executeTakeFirst()` 返回当前查询匹配的第一行。

也可以使用便捷终止方法：

```ts
const status = await db
  .query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .value<string>('status');

const orderNos = await db
  .query()
  .selectFrom('orders')
  .where('status', '=', 'paid')
  .pluck<string>('orderNo');
```

复杂条件使用 Kysely 风格的 `eb`：

```ts
const rows = await db
  .query()
  .selectFrom('orders')
  .where(({ eb, and, or, not }) =>
    and([
      eb('tenantId', '=', tenantId),
      or([eb('status', '=', 'paid'), eb('status', '=', 'completed')]),
      not(eb.between('amount', 500, 700)),
    ]),
  )
  .execute();
```

默认 `underscored: true` 时，`db.query()` 会对 table 和 column query identifier 做归一化：

```text
orderNo -> order_no
createdAt -> created_at
```

`select()` 会保留调用方传入的结果 key：

```ts
const row = await db
  .query()
  .selectFrom('orders')
  .select('createdAt')
  .executeTakeFirst();
```

SQL 中查询的是 `created_at`，结果 key 是：

```ts
{
  createdAt: '...';
}
```

如果写的是物理列名：

```ts
const row = await db
  .query()
  .selectFrom('orders')
  .select('created_at')
  .executeTakeFirst();
```

结果 key 就是：

```ts
{
  created_at: '...';
}
```

显式 alias 也按同样规则：

```ts
const rows = await db
  .query()
  .selectFrom('orderItems as oi')
  .leftJoin('orders as o', 'oi.orderId', 'o.id')
  .select([
    'oi.id as item_id',
    'oi.orderNo as order_no',
    'oi.createdAt as created_at',
    'o.status as order_status',
  ])
  .where('oi.createdAt', '>=', start)
  .execute();
```

这里显式 alias 写的是小写下划线，所以结果 key 也是 `item_id`、`order_no`、`created_at`、`order_status`，不会再自动变成驼峰。

`db.query()` 自动应用 Connection 的 `tablePrefix`，但不会读取 Collection Metadata 中的局部覆盖。例如：

```ts
await db.builder().createCollection('orderItems', (collection) => {
  collection.naming({ tablePrefix: 'archive_' });
  collection.string('orderNo');
});
```

假设 Connection 的 `tablePrefix` 也是 `archive_`，数据库层查询应写不带前缀的 Connection 相对表标识符：

```ts
await db
  .query()
  .selectFrom('orderItems')
  .select('orderNo')
  .where('orderNo', '=', 'SO-001')
  .execute();
```

如果 Connection 的前缀不是 `archive_`，不要期望 `db.query()` 自动从 Collection Metadata 理解局部覆盖：

```ts
orderItems -> archive_order_items
```

这部分属于未来 Repository。当前代码中没有 `db.repository()` 或 `connection.repository()`，不要把 Repository 规划示例复制到运行时代码。

Repository 实现后会理解：

```text
collection.name: orderItems -> archive_order_items
field.name: orderNo -> order_no
field.name: createdAt -> created_at
```

并返回应用层字段：

```ts
[
  {
    orderNo: 'SO-001',
    createdAt: '...',
  },
];
```

Repository 的结果选择计划使用 Select AST，筛选条件使用 Filter Builder / Filter AST，
排序使用 Sort AST。详细设计见 [Repository 概览](./repository/overview.md)、
[Select AST](./repository/select-ast.md)、[Filter Builder](./repository/filter-builder.md)、
[Filter AST](./repository/filter-ast.md) 和 [Sort AST](./repository/sort-ast.md)。

所以三层职责可以这样看：

| API               | 层级                 | 输入名                          | 是否读取 Collection metadata |
| ----------------- | -------------------- | ------------------------------- | ---------------------------- |
| `db.builder()`    | Collection schema 层 | Collection / Field 逻辑名       | 是                           |
| `db.query()`      | 数据库查询层         | table / column query identifier | 否                           |
| `db.repository()` | 应用数据层，规划中   | Collection / Field 逻辑名       | 是                           |

## 运行 Migration

Migration 文件通过 `defineMigration()` 声明版本化的数据库变更：

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609030001_create_users',

  async up({ builder }) {
    await builder.createCollection('users', (collection) => {
      collection.increments('id');
      collection.string('email').notNull().unique();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('users');
  },
});
```

通过当前 `DatabaseManager` 创建绑定好的 runner，不需要把 `database` 再传给独立工厂：

```ts
const migrator = db.createMigrator({
  connection: 'main',
  directory: './database/migrations',
  packageName: 'my-app',
});

await migrator.latest();
```

测试具体 migration 时，优先用 `upTo(name)` 固定执行边界：

```ts
await migrator.upTo('202609030001_create_users');
```

Migration 文件是不可变历史，必须把 Schema 变更完整写在文件中，不要引用会继续演化的运行时 Collection 定义。

## 运行 Seed

Seed 文件通过 `defineSeed()` 声明可追踪的初始化数据：

```ts
import { defineSeed } from '@nocobase/db';

export default defineSeed({
  name: '202609030002_seed_users',

  async run({ query }) {
    await query
      .insertInto('users')
      .values({ email: 'admin@example.com' })
      .execute();
  },
});
```

使用同一个 `DatabaseManager` 创建 Seeder：

```ts
const seeder = db.createSeeder({
  connection: 'main',
  directory: './database/seeds',
  packageName: 'my-app',
});

await seeder.run();
```

安装流程应先运行 Migration，再运行 Seed。Seed 只负责数据初始化；需要创建或修改 Schema 时应编写 Migration。

## 使用 db.transaction()

`db.transaction()` 在一个连接事务中执行多个操作。事务回调里的 `connection` 表示当前事务连接，事务内应使用这个 `connection`，不要回到外层 `db`。

```ts
await db.transaction(async (connection) => {
  await connection.builder.createCollection('payments', (collection) => {
    collection.increments('id');
    collection.string('orderNo');
    collection.decimal('amount', { precision: 12, scale: 2 });
    collection.string('status');
  });

  await connection.query
    .insertInto('payments')
    .values({
      orderNo: 'SO-001',
      amount: 99.5,
      status: 'paid',
    })
    .execute();
});
```

当前原型中，`DatabaseConnection` 上的 `builder`、`query`、`schema` 是属性；`DatabaseManager` 上的 `db.builder()`、`db.query()` 是快捷方法。

## 多连接

`DatabaseManager` 可以管理多个命名连接：

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: ':memory:',
    },
    analytics: {
      dialect: 'sqlite',
      filename: ':memory:',
    },
  },
});
```

默认连接可以直接用 manager 快捷方法：

```ts
await db.builder().createCollection('orders', (collection) => {
  collection.increments('id');
});

await db.query().insertInto('orders').values({ status: 'paid' }).execute();
```

命名连接有两种写法。

短脚本可以使用 manager 快捷参数：

```ts
await db.builder('analytics').createCollection('events', (collection) => {
  collection.increments('id');
  collection.string('name');
});

const events = await db
  .query('analytics')
  .selectFrom('events')
  .select(['id', 'name'])
  .execute();
```

较长代码更推荐先取 connection，再在同一个 connection 上操作：

```ts
const analytics = db.connection('analytics');

await analytics.builder.createCollection('events', (collection) => {
  collection.increments('id');
  collection.string('name');
});

const events = await analytics.query
  .selectFrom('events')
  .select(['id', 'name'])
  .execute();
```

多连接代码里，推荐优先使用：

```ts
const connection = db.connection('analytics');
```

这样 connection 上下文更明确，不容易把不同连接混在一起。

## 关闭连接

脚本、测试或短生命周期任务结束后，应关闭所有已创建的连接：

```ts
await db.destroy();
```

## 仅在公共接口不足时使用 client()

`db.connection().client()` 是底层 adapter client 的兜底入口，不是常规数据库操作的首选。一般按以下优先级选择：

1. Schema 和 Collection 变更使用 `builder`。
2. 数据读写使用 `query`。
3. 物理 Schema 验证使用 `collections.getPhysical()` 或 `schemaInspector`。
4. 只有公共接口尚未暴露所需能力，且代码明确依赖具体 adapter 或数据库方言时，才使用 `client()`。

例如执行 PostgreSQL 特有能力时：

```ts
import type { Knex } from 'knex';

const connection = db.connection();

if (connection.dialect === 'postgres') {
  const client = await connection.client<Knex>();
  await client.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
}
```

使用 `client()` 的代码应显式检查 `connection.dialect` 或 `connection.capabilities`。可移植代码不要用它绕过 Builder、Query 或 Schema Inspector。

## 深入阅读

- Database 连接管理见 [Database 概览](./database/overview.md)。
- Builder 细节见 [Builder API 总览](./builder/overview.md)。
- Query 细节见 [QueryAdapter 概览](./query/overview.md)。
- Migration 用法见 [Migration](./migration/overview.md)。
- Seed 用法见 [Seed](./seed/overview.md)。
- 命名规则见 [命名概念](./concepts/naming.md)。
- 开发维护说明见 [Agent 开发指南](./development/agent-guide.md)。

## 一句话总结

```text
createDatabaseManager()
  -> db.builder()      // Collection schema / metadata
  -> db.query()        // database query builder
  -> db.createMigrator() // versioned schema and data changes
  -> db.createSeeder() // tracked initial data
  -> db.transaction()  // run builder/query in one connection transaction
```

默认连接用 `db.builder()`、`db.query()`；命名连接优先用 `db.connection('name')` 取得上下文，再调用这个连接上的能力。只有公共接口无法覆盖的方言特有操作才使用 `db.connection().client()`。
