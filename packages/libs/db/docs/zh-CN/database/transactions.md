---
title: Database Transaction：事务与 Connection 传播
description: 使用 db.transaction() 或 connection.transaction() 原子执行操作，并保持事务 Connection 贯穿回调。
---

# Database Transaction：事务与 Connection 传播

`db.transaction()` 在一个连接事务中执行多个操作。事务回调里的 `connection` 表示当前事务连接。

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

## 使用事务连接

事务内应使用回调参数里的 `connection`，不要回到外层 `db`：

```ts
await db.transaction(async (connection) => {
  await connection.query
    .insertInto('orders')
    .values({ status: 'paid' })
    .execute();
});
```

不要在事务回调里写：

```ts
await db.transaction(async () => {
  await db.query().insertInto('orders').values({ status: 'paid' }).execute();
});
```

这样会绕开当前事务连接。

## 命名连接事务

```ts
await db.transaction(async (connection) => {
  await connection.query
    .insertInto('events')
    .values({ name: 'checkout' })
    .execute();
}, 'analytics');
```

也可以先取 connection：

```ts
const analytics = db.connection('analytics');

await analytics.transaction(async (connection) => {
  await connection.query
    .insertInto('events')
    .values({ name: 'checkout' })
    .execute();
});
```

## 使用注意事项

- transaction 内只使用回调里的 `connection`。
- 需要 Builder、Query 混合操作时，也应全部走同一个事务 connection。
- 如果事务抛错，底层 driver 应回滚事务。
- 测试事务行为时使用真实数据库集成测试。
- 事务内使用回调 Connection 的 `connection.repository('projects')`；不要复用事务外的 Repository。嵌套写入与 ifVersion 见 [Repository 事务](../repository/transactions.md)。
