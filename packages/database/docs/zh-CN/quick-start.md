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
import { createDatabaseManager } from './src/database.js';

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
  .table('orders')
  .insert({
    orderNo: 'SO-001',
    amount: 99.5,
    status: 'paid',
    createdAt: new Date(),
  });

const rows = await db.query()
  .table('orders')
  .select('id', 'orderNo', 'createdAt')
  .where('status', 'paid')
  .orderBy('createdAt', 'desc')
  .limit(20)
  .all();
```

查询终止方法推荐保持语义明确：

```ts
const rows = await db.query()
  .table('orders')
  .where('status', 'paid')
  .all();

const row = await db.query()
  .table('orders')
  .where('orderNo', 'SO-001')
  .first();
```

`all()` 返回当前查询匹配的所有行；`first()` 返回当前查询匹配的第一行。

在 `underscored: true` 下，`db.query()` 会对 table 和 column query identifier 做轻量归一化：

```text
orderNo -> order_no
createdAt -> created_at
```

`select()` 会保留调用方传入的结果 key：

```ts
const row = await db.query()
  .table('orders')
  .select('createdAt')
  .first();
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
  .table('orders')
  .select('created_at')
  .first();
```

结果 key 就是：

```ts
{
  created_at: '...'
}
```

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
  .table('tbl_order_item')
  .select('order_number')
  .where('order_number', 'SO-001')
  .all();
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
  filter: {
    orderNo: 'SO-001',
  },
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
    .table('payments')
    .insert({
      orderNo: 'SO-001',
      amount: 99.5,
      status: 'paid',
    });
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
    filter: {
      orderNo: 'SO-001',
    },
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
  .table('orders')
  .insert({ status: 'paid' });
```

命名连接有两种写法。

短脚本可以使用 manager 快捷参数：

```ts
await db.builder('analytics').createCollection('events', (collection) => {
  collection.increments('id');
  collection.string('name');
});

const events = await db.query('analytics')
  .table('events')
  .select('id', 'name')
  .all();
```

较长代码更推荐先取 connection，再在同一个 connection 上操作：

```ts
const analytics = db.connection('analytics');

await analytics.builder.createCollection('events', (collection) => {
  collection.increments('id');
  collection.string('name');
});

const events = await analytics.query
  .table('events')
  .select('id', 'name')
  .all();
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

## 一句话总结

```text
createDatabaseManager()
  -> db.builder()      // Collection schema / metadata
  -> db.query()        // database table query
  -> db.repository()   // Collection-aware data access, planned
  -> db.transaction()  // run builder/query/repository in one connection transaction
```

默认连接用 `db.builder()`、`db.query()`；命名连接优先用 `db.connection('name')` 取得上下文，再调用这个连接上的能力。
