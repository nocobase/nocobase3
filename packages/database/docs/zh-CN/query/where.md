# where 条件

`where` 参考 Kysely 风格。简单条件使用三参形式：

```ts
await db.query()
  .selectFrom('orders')
  .where('tenantId', '=', tenantId)
  .where('status', '=', 'paid')
  .where('amount', '>', 100)
  .execute();
```

## 跨数据库 operator

V1 支持这些跨数据库 operator：

```ts
type ComparisonOperator =
  | '='
  | '!='
  | '<>'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not in'
  | 'is'
  | 'is not'
  | 'like'
  | 'not like';
```

`in`、`null`、`like` 等条件通过 operator 表达，不提供额外的 `whereIn()`、`whereNull()`、`whereLike()`：

```ts
await db.query()
  .selectFrom('orders')
  .where('type', 'in', ['normal', 'vip'])
  .where('status', 'not in', ['draft', 'cancelled'])
  .where('paidAt', 'is not', null)
  .where('deletedAt', 'is', null)
  .where('orderNo', 'like', 'SO-%')
  .execute();
```

V1 不提供 `ilike`、JSON operator、raw where。需要这类能力时，应先判断是否能在 Repository 或业务封装里实现可移植表达。

## ExpressionBuilder

复杂条件使用 `where((eb) => expression)`：

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

`eb` 本身也是函数：

```ts
eb('amount', '>=', 100);
```

为了和 Kysely 心智保持一致，callback 参数里也暴露：

```ts
({ eb, and, or, not, exists, selectFrom }) => ...
```

## 对象等值条件

对象等值条件只作为 `eb.and()` / `eb.or()` 的便捷语法：

```ts
await db.query()
  .selectFrom('users')
  .where((eb) =>
    eb.and({
      firstName: 'Jennifer',
      lastName: 'Aniston',
    })
  )
  .execute();
```

不推荐也不支持顶层对象 where：

```ts
// 不使用这种形式
db.query().selectFrom('users').where({ firstName: 'Jennifer' });
```

这样可以避免结构化对象和字段名冲突，也避免 `$and`、`$or` 一类特殊 key 带来的歧义。

## whereRef

字段和字段比较使用 `whereRef()`：

```ts
await db.query()
  .selectFrom('payments')
  .whereRef('payments.orderId', '=', 'orders.id')
  .execute();
```

也可以在 `eb` 中用 `ref()`：

```ts
await db.query()
  .selectFrom('payments')
  .where((eb) =>
    eb('payments.orderId', '=', eb.ref('orders.id'))
  )
  .execute();
```

## exists

V1 不提供 `whereExists()` / `whereNotExists()`，而是通过 `eb.exists()` 和 `eb.not()` 组合：

```ts
const orders = await db.query()
  .selectFrom('orders')
  .select('orderNo')
  .where(({ exists, selectFrom }) =>
    exists(
      selectFrom('payments')
        .select('id')
        .whereRef('payments.orderId', '=', 'orders.id')
        .where('payments.status', '=', 'paid')
    )
  )
  .execute();
```

```ts
const orders = await db.query()
  .selectFrom('orders')
  .where(({ not, exists, selectFrom }) =>
    not(
      exists(
        selectFrom('payments')
          .select('id')
          .whereRef('payments.orderId', '=', 'orders.id')
      )
    )
  )
  .execute();
```

## 子查询

子查询通过 `eb.selectFrom()` 创建，可以用于 `in`、`not in`、`exists`，也可以作为 select 标量子查询：

```ts
const orders = await db.query()
  .selectFrom('orders')
  .where((eb) =>
    eb('id', 'in',
      eb.selectFrom('payments')
        .select('orderId')
        .where('status', '=', 'paid')
    )
  )
  .execute();
```

## 和 Repository Filter 的区别

本页描述的是 `db.query()` 的数据库层 `where`。它面向 table / column query identifier，不读取 Collection metadata。

未来 Repository 会提供 Collection-aware 的 Filter Builder：

```ts
await db.repository('orders').findMany({
  filter: (filter) => filter.date('createdAt').notBefore('2026-01-01'),
});
```

Repository Filter Builder 会根据 Collection metadata 校验字段类型和 operator group，详细设计见 [Filter Builder](../repository/filter-builder.md)。
