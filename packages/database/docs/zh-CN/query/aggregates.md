# 聚合和 having

聚合通过 `eb.fn` 表达：

```ts
const rows = await db.query()
  .selectFrom('orders')
  .select((eb) => [
    'customerId',
    eb.fn.countAll<number>().as('total'),
    eb.fn.sum<number>('amount').as('amountTotal'),
  ])
  .groupBy('customerId')
  .having((eb) => eb(eb.fn.countAll<number>(), '>', 5))
  .execute();
```

## 支持的聚合函数

- `eb.fn.count(column)`
- `eb.fn.countAll(table?)`
- `eb.fn.sum(column)`
- `eb.fn.avg(column)`
- `eb.fn.min(column)`
- `eb.fn.max(column)`
- `.as(alias)`
- `.distinct()`

不提供 terminal `count()`；需要统计时使用聚合表达式。

## groupBy

```ts
await db.query()
  .selectFrom('orders')
  .select((eb) => [
    'status',
    eb.fn.countAll<number>().as('total'),
  ])
  .groupBy('status')
  .execute();
```

`groupBy()` 支持单个字段或字段数组：

```ts
.groupBy('status')
.groupBy(['tenantId', 'status'])
```

## having

`having()` 的表达方式和 `where()` 一致：

```ts
await db.query()
  .selectFrom('orders')
  .select((eb) => [
    'status',
    eb.fn.countAll<number>().as('total'),
  ])
  .groupBy('status')
  .having((eb) => eb(eb.fn.countAll<number>(), '>', 1))
  .execute();
```

字段和字段比较使用 `havingRef()`：

```ts
await db.query()
  .selectFrom('metrics')
  .select(['metricName', 'planned', 'actual'])
  .groupBy(['metricName', 'planned', 'actual'])
  .havingRef('actual', '>', 'planned')
  .execute();
```

## 方言差异

不同数据库对聚合返回值的 JavaScript 类型可能不同。例如 `count()` 可能返回 number、string 或 bigint，`avg()` 在 MySQL 下可能按定点小数返回。业务代码应按需要显式转换。
