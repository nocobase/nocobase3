# 事务

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
  await db.query()
    .insertInto('orders')
    .values({ status: 'paid' })
    .execute();
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

## 未来 Repository

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

Repository 和 Filter Builder 目前还没有实现，详细规划见 [Repository 概览](../repository/overview.md) 和 [Filter Builder](../repository/filter-builder.md)。

## Agent 注意事项

- transaction 内只使用回调里的 `connection`。
- 需要 Builder、Query、Repository 混合操作时，也应全部走同一个事务 connection。
- 如果事务抛错，底层 driver 应回滚事务。
- 测试事务行为时使用真实数据库集成测试。
