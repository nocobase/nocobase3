# join

V1 只保留多数据库可移植的 join。

```ts
await db
  .query()
  .selectFrom('orders as o')
  .innerJoin('customers as c', 'o.customerId', 'c.id')
  .select(['o.orderNo as orderNo', 'c.name as customerName'])
  .execute();
```

## 支持的 join

- `innerJoin(table, leftRef, rightRef)`
- `leftJoin(table, leftRef, rightRef)`
- `rightJoin(table, leftRef, rightRef)`
- `crossJoin(table)`
- `innerJoin(table, callback)`
- `leftJoin(table, callback)`
- `rightJoin(table, callback)`

V1 不提供 `fullJoin`、lateral join、raw join、update/delete join。

## callback join

callback 形式用于多个 on 条件：

```ts
await db
  .query()
  .selectFrom('orders as o')
  .innerJoin('customers as c', (join) =>
    join.onRef('o.customerId', '=', 'c.id').on('c.status', '=', 'active'),
  )
  .execute();
```

如果需要 OR 条件，使用 `on((eb) => eb.or([...]))`。这和 Kysely 的写法一致，不额外提供 `orOn()` / `orOnRef()`：

```ts
await db
  .query()
  .selectFrom('orders as o')
  .leftJoin('customers as c', (join) =>
    join
      .on((eb) =>
        eb.or([
          eb('o.customerId', '=', eb.ref('c.id')),
          eb('o.fallbackCustomerId', '=', eb.ref('c.id')),
        ]),
      )
      .on('c.status', '=', 'active'),
  )
  .select(['o.orderNo as orderNo', 'c.name as customerName'])
  .execute();
```

语义上等价于：

```sql
left join customers as c
  on (
    o.customer_id = c.id
    or o.fallback_customer_id = c.id
  )
  and c.status = 'active'
```

## 命名归一化

在 `underscored: true` 下，表别名和字段引用也会参与归一化：

```ts
await db
  .query()
  .selectFrom('orderItems as oi')
  .leftJoin('orders as o', 'oi.orderId', 'o.id')
  .select(['oi.orderNo as orderNo', 'o.createdAt as createdAt'])
  .execute();
```

SQL 层会使用 `order_items`、`order_id`、`created_at`。结果 key 仍按 select alias 返回。详见 [命名归一化](./naming.md)。
