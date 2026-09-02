---
title: 使用 Query 和 Transaction 实现数据访问
description: Agent 编写 select、insert、update、delete 和事务代码时的 QueryAdapter 选择、限制与验证流程。
---

# 使用 Query 和 Transaction 实现数据访问

`QueryAdapter` 是数据库层 Query Builder，不是 ORM 或 Collection-aware Repository。它使用 Connection 级命名规则，但不读取 Collection Metadata 或 Collection 级 naming override。

## 获取 Query

默认连接的短操作：

```ts
const rows = await db.query().selectFrom('orders').selectAll().execute();
```

连续操作命名连接时，先保留 Connection 上下文：

```ts
const analytics = db.connection('analytics');

const events = await analytics.query
  .selectFrom('events')
  .select(['id', 'name'])
  .execute();
```

`db.query(name?)` 是方法，`connection.query` 是属性，两者都立即返回 lazy Query Adapter，不需要 `await`。

## 选择终止方法

| 目标             | 方法                        |
| ---------------- | --------------------------- |
| 返回多行         | `execute()`                 |
| 返回可选的第一行 | `executeTakeFirst()`        |
| 第一行必须存在   | `executeTakeFirstOrThrow()` |
| 返回单列值       | `value(column)`             |
| 返回一列数组     | `pluck(column)`             |
| 判断是否存在     | `exists()`                  |

简单条件使用三参数形式：

```ts
const order = await db
  .query()
  .selectFrom('orders')
  .select(['id', 'orderNo', 'status'])
  .where('status', '=', 'paid')
  .executeTakeFirst();
```

复杂条件使用 Expression Builder。不要生成二参数 `where()` 或 Knex 风格快捷方法。

## 多步骤写入使用事务

```ts
await db.transaction(async (connection) => {
  await connection.query
    .insertInto('orders')
    .values({ orderNo: 'SO-001', status: 'draft' })
    .execute();

  await connection.query
    .insertInto('orderLogs')
    .values({ orderNo: 'SO-001', action: 'created' })
    .execute();
});
```

事务内只使用回调参数里的 `connection`。不要在回调中调用外层 `db.query()`，否则操作不会使用当前事务 Connection。

命名连接事务：

```ts
const analytics = db.connection('analytics');

await analytics.transaction(async (connection) => {
  await connection.query
    .insertInto('events')
    .values({ name: 'checkout' })
    .execute();
});
```

## 不适用场景

- 需要自动读取 Collection relation、title 或 Collection 级 naming override：Query 不具备这些能力。
- 需要创建或修改 Schema：使用 Migration 中的 Builder。
- 需要检查数据库物理对象：使用 Schema Inspector。
- 需要 Repository：当前尚未实现，不要生成规划接口。

## 完成条件

- 使用了实际存在的 Query 方法和三参数 `where()`。
- 多步骤原子写入共享同一个事务 Connection。
- 没有默认使用 raw SQL 或 Knex 快捷方法。
- 添加了真实数据库集成测试，包括成功、空结果和错误/回滚路径。

继续阅读：[QueryAdapter 总览](../query/overview.md)、[Where 条件](../query/where.md)、[数据写入](../query/mutations.md)、[事务](../database/transactions.md)。
