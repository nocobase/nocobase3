# 快速开始

这篇文档用一条主线介绍数据库入口的整体设计：从 `createDatabaseManager()` 创建多连接管理器，到通过 `db.builder()` 管理 Collection，通过 `db.query()` 做数据库层查询，通过未来的 `db.repository()` 做 Collection-aware 数据访问，并在事务和多连接场景中保持同一套心智。

当前原型已经实现：

- `createDatabaseManager()`
- `db.connection()`
- `db.builder()`
- `db.query()`
- `db.transaction()`
- `db.client()`

`db.repository()` 还没有实现，本篇只介绍它在整体设计中的位置。

## 创建 DatabaseManager

```ts
import { createDatabaseManager } from '@nocobase/collection-builder-prototype';

const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      driver: 'knex',
      client: 'better-sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
      naming: {
        underscored: true,
      },
    },
  },
});
```

`createDatabaseManager()` 返回的是 `DatabaseManager`，不是单个数据库连接。它负责管理默认连接和多个命名连接。

```ts
const connection = db.connection();
```

`db.connection()` 返回默认连接。它是 lazy handle，只有实际执行数据库操作时才会创建底层 driver client。

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

如果 connection 配置了：

```ts
naming: {
  underscored: true,
}
```

那么 Builder 会把 Collection 逻辑名编译到数据库物理名：

```text
orders.createdAt -> orders.created_at
orders.orderNo -> orders.order_no
```

如果需要绑定已有物理表或列，可以显式写：

```ts
await db.builder().createCollection('orderItems', (collection) => {
  collection.tableName('tbl_order_item');

  collection.increments('id');
  collection.string('orderNo').columnName('order_number');
  collection.datetime('createdAt');
});
```

这里 `orderItems`、`orderNo`、`createdAt` 是 Collection / Field 的逻辑名；`tbl_order_item`、`order_number` 是物理名覆盖。

## 使用 db.query()

`db.query()` 返回默认连接上的 `QueryAdapter`。它是数据库层查询接口，不是 Repository，也不读取 Collection metadata。

```ts
await db.query()
  .insertInto('orders')
  .values({
    orderNo: 'SO-001',
    amount: 99.5,
    status: 'paid',
    createdAt: new Date(),
  })
  .execute();

const rows = await db.query()
  .selectFrom('orders')
  .select(['id', 'orderNo', 'createdAt'])
  .where('status', '=', 'paid')
  .orderBy('createdAt', 'desc')
  .limit(20)
  .execute();
```

查询终止方法推荐保持语义明确：

```ts
const rows = await db.query()
  .selectFrom('orders')
  .where('status', '=', 'paid')
  .execute();

const row = await db.query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .executeTakeFirst();
```

`execute()` 返回当前查询匹配的所有行；`executeTakeFirst()` 返回当前查询匹配的第一行。

也可以使用便捷终止方法：

```ts
const status = await db.query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .value<string>('status');

const orderNos = await db.query()
  .selectFrom('orders')
  .where('status', '=', 'paid')
  .pluck<string>('orderNo');
```

复杂条件使用 Kysely 风格的 `eb`：

```ts
const rows = await db.query()
  .selectFrom('orders')
  .where(({ eb, and, or, not }) =>
    and([
      eb('tenantId', '=', tenantId),
      or([
        eb('status', '=', 'paid'),
        eb('status', '=', 'completed'),
      ]),
      not(eb.between('amount', 500, 700)),
    ])
  )
  .execute();
```

在 `underscored: true` 下，`db.query()` 会对 table 和 column query identifier 做轻量归一化：

```text
orderNo -> order_no
createdAt -> created_at
```

`select()` 会保留调用方传入的结果 key：

```ts
const row = await db.query()
  .selectFrom('orders')
  .select('createdAt')
  .executeTakeFirst();
```

SQL 中查询的是 `created_at`，结果 key 是：

```ts
{
  createdAt: '...'
}
```

如果写的是物理列名：

```ts
const row = await db.query()
  .selectFrom('orders')
  .select('created_at')
  .executeTakeFirst();
```

结果 key 就是：

```ts
{
  created_at: '...'
}
```

显式 alias 也按同样规则：

```ts
const rows = await db.query()
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

`db.query()` 不会读取 `tableName`、`columnName` metadata。例如：

```ts
await db.builder().createCollection('orderItems', (collection) => {
  collection.tableName('tbl_order_item');
  collection.string('orderNo').columnName('order_number');
});
```

数据库层查询应写物理名或可被 naming 归一化的 query identifier：

```ts
await db.query()
  .selectFrom('tbl_order_item')
  .select('order_number')
  .where('order_number', '=', 'SO-001')
  .execute();
```

不要期望 `db.query()` 自动理解：

```ts
orderItems -> tbl_order_item
orderNo -> order_number
```

这部分属于未来 Repository。

## 未来的 db.repository()

`db.repository()` 规划为 Collection-aware 的应用层数据访问入口。它和 `db.query()` 的区别不是链式还是对象式，而是是否读取 Collection metadata。

未来期望：

```ts
const records = await db.repository('orderItems').findMany({
  fields: ['orderNo', 'createdAt'],
  filter: (filter) => filter.string('orderNo').eq('SO-001'),
});
```

Repository 会理解：

```text
collection.name: orderItems -> tableName: tbl_order_item
field.name: orderNo -> columnName: order_number
field.name: createdAt -> naming -> created_at
```

并返回应用层字段：

```ts
[
  {
    orderNo: 'SO-001',
    createdAt: '...',
  },
]
```

Repository 的筛选条件计划使用 Filter Builder，而不是旧的 object shorthand：

```ts
await db.repository('orders').findMany({
  filter: (filter) =>
    filter.and([
      filter.string('status').eq('paid'),
      filter.number('amount').gte(100),
      filter.date('createdAt').notBefore('2026-01-01'),
    ]),
});
```

这部分接口当前尚未实现，详细设计见 [Repository 概览](./repository/overview.md)、[Filter Builder](./repository/filter-builder.md) 和 [Filter AST](./repository/filter-ast.md)。

所以三层职责可以这样看：

| API | 层级 | 输入名 | 是否读取 Collection metadata |
| --- | --- | --- | --- |
| `db.builder()` | Collection schema 层 | Collection / Field 逻辑名 | 是 |
| `db.query()` | 数据库查询层 | table / column query identifier | 否 |
| `db.repository()` | 应用数据层，规划中 | Collection / Field 逻辑名 | 是 |

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

未来 Repository 实现后，事务内也应使用回调参数里的 `connection.repository('orders')`，这样 Repository 读写和同一事务里的 Builder、Query 操作共享同一个连接上下文：

```ts
await db.transaction(async (connection) => {
  // 规划接口
  await connection.repository('orders').create({
    values: {
      orderNo: 'SO-001',
      amount: 99.5,
      status: 'paid',
    },
  });

  // 规划接口
  await connection.repository('orders').update({
    filter: (filter) => filter.string('orderNo').eq('SO-001'),
    values: {
      status: 'completed',
    },
  });
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
      driver: 'knex',
      client: 'better-sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    },
    analytics: {
      driver: 'knex',
      client: 'better-sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
      naming: {
        underscored: true,
      },
    },
  },
});
```

默认连接可以直接用 manager 快捷方法：

```ts
await db.builder().createCollection('orders', (collection) => {
  collection.increments('id');
});

await db.query()
  .insertInto('orders')
  .values({ status: 'paid' })
  .execute();
```

命名连接有两种写法。

短脚本可以使用 manager 快捷参数：

```ts
await db.builder('analytics').createCollection('events', (collection) => {
  collection.increments('id');
  collection.string('name');
});

const events = await db.query('analytics')
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

未来 Repository 在多连接下也建议保持同样心智：

```ts
// 规划接口
const records = await db.connection('analytics')
  .repository('events')
  .findMany({
    fields: ['id', 'name'],
  });
```

也可以提供 manager 级快捷写法：

```ts
// 规划接口
const records = await db.repository('events', 'analytics').findMany({
  fields: ['id', 'name'],
});
```

但介绍多连接时，推荐优先使用：

```ts
const connection = db.connection('analytics');
```

这样 connection 上下文更明确，不容易把不同连接混在一起。

## 关闭连接

脚本、测试或短生命周期任务结束后，应关闭所有已创建的连接：

```ts
await db.destroy();
```

## 深入阅读

- Database 连接管理见 [Database 概览](./database/overview.md)。
- Builder 细节见 [Builder API 总览](./builder/overview.md)。
- Query 细节见 [QueryAdapter 概览](./query/overview.md)。
- 命名规则见 [命名概念](./concepts/naming.md)。
- 开发维护说明见 [Agent 开发指南](./development/agent-guide.md)。

## 一句话总结

```text
createDatabaseManager()
  -> db.builder()      // Collection schema / metadata
  -> db.query()        // database query builder
  -> db.repository()   // Collection-aware data access, planned
  -> db.transaction()  // run builder/query/repository in one connection transaction
```

默认连接用 `db.builder()`、`db.query()`；命名连接优先用 `db.connection('name')` 取得上下文，再调用这个连接上的能力。
