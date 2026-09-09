---
title: Query where 条件
description: 使用三参 where、ExpressionBuilder、字段引用、exists 和子查询表达 QueryAdapter 条件，并说明当前操作符边界。
---

# where 条件

`where` 参考 Kysely 风格。简单条件使用三参形式：

```ts
await db
  .query()
  .selectFrom('orders')
  .where('tenantId', '=', tenantId)
  .where('status', '=', 'paid')
  .where('amount', '>', 100)
  .execute();
```

## 跨数据库 operator

当前 API 支持这些跨数据库 operator：

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
await db
  .query()
  .selectFrom('orders')
  .where('type', 'in', ['normal', 'vip'])
  .where('status', 'not in', ['draft', 'cancelled'])
  .where('paidAt', 'is not', null)
  .where('deletedAt', 'is', null)
  .where('orderNo', 'like', 'SO-%')
  .execute();
```

当前 API 不提供 `ilike`、JSON operator 或 raw where。确实需要数据库专用操作符时，应在业务模块中隔离该查询，并通过 `connection.client()` 使用底层 client。

## ExpressionBuilder

复杂条件使用 `where((eb) => expression)`：

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
await db
  .query()
  .selectFrom('users')
  .where((eb) =>
    eb.and({
      firstName: 'Jennifer',
      lastName: 'Aniston',
    }),
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
await db
  .query()
  .selectFrom('payments')
  .whereRef('payments.orderId', '=', 'orders.id')
  .execute();
```

也可以在 `eb` 中用 `ref()`：

```ts
await db
  .query()
  .selectFrom('payments')
  .where((eb) => eb('payments.orderId', '=', eb.ref('orders.id')))
  .execute();
```

## exists

当前 API 不提供 `whereExists()` / `whereNotExists()`，而是通过 `eb.exists()` 和 `eb.not()` 组合：

```ts
const orders = await db
  .query()
  .selectFrom('orders')
  .select('orderNo')
  .where(({ exists, selectFrom }) =>
    exists(
      selectFrom('payments')
        .select('id')
        .whereRef('payments.orderId', '=', 'orders.id')
        .where('payments.status', '=', 'paid'),
    ),
  )
  .execute();
```

```ts
const orders = await db
  .query()
  .selectFrom('orders')
  .where(({ not, exists, selectFrom }) =>
    not(
      exists(
        selectFrom('payments')
          .select('id')
          .whereRef('payments.orderId', '=', 'orders.id'),
      ),
    ),
  )
  .execute();
```

## 子查询

子查询通过 `eb.selectFrom()` 创建，可以用于 `in`、`not in`、`exists`，也可以作为 select 标量子查询：

```ts
const orders = await db
  .query()
  .selectFrom('orders')
  .where((eb) =>
    eb(
      'id',
      'in',
      eb.selectFrom('payments').select('orderId').where('status', '=', 'paid'),
    ),
  )
  .execute();
```

## 当前边界：不是 Collection-aware Filter

本页描述的是 `db.query()` 的数据库层 `where`。它面向 table / column query identifier，不读取 Collection metadata。

QueryAdapter 不会根据 Collection Metadata 校验字段类型或操作符分组。需要该能力时使用 `db.repository(name)` 的 [Filter](../repository/filter.md)；两层条件语法不同，不要把 Query where 与 Repository filter 混用。
