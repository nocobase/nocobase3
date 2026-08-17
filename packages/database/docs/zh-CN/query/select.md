# select 查询

`selectFrom()` 创建查询，`select()` 决定返回列。

```ts
await db.query()
  .selectFrom('orders')
  .select('orderNo')
  .execute();

await db.query()
  .selectFrom('orders')
  .select(['id', 'orderNo', 'createdAt'])
  .execute();
```

`select()` 支持字符串、字符串数组，以及返回 selection 数组的 callback。

## alias

别名使用 Kysely 风格的 `as` 字符串。V1 不支持对象映射。

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

显式 alias 写的是 `item_id`、`order_no`、`created_at`、`order_status`，所以结果 key 也保持这些名字，不会再转成驼峰。

如果 alias 写成驼峰，则结果 key 使用驼峰：

```ts
const rows = await db.query()
  .selectFrom('orderItems as oi')
  .select([
    'oi.id as itemId',
    'oi.orderNo as orderNo',
  ])
  .execute();
```

## selectAll

`selectAll()` 用于选择所有列：

```ts
const rows = await db.query()
  .selectFrom('orders')
  .selectAll()
  .execute();
```

如果启用了 `underscored: true`，`selectAll()` 会把未显式命名的下划线字段映射回驼峰。更完整的结果 key 规则见 [命名归一化](./naming.md)。

## 终止方法

```ts
const rows = await db.query()
  .selectFrom('orders')
  .where('status', '=', 'paid')
  .execute();

const row = await db.query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .executeTakeFirst();

const requiredRow = await db.query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .executeTakeFirstOrThrow();
```

`executeTakeFirstOrThrow()` 在没有结果时抛错。

## value / pluck / exists

`value()` 返回第一行的某一列：

```ts
const status = await db.query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .value<string>('status');
```

`pluck()` 返回某一列的值数组：

```ts
const orderNos = await db.query()
  .selectFrom('orders')
  .where('status', '=', 'paid')
  .orderBy('id')
  .pluck<string>('orderNo');
```

`exists()` 判断是否存在记录：

```ts
const exists = await db.query()
  .selectFrom('orders')
  .where('orderNo', '=', 'SO-001')
  .exists();
```

## distinct 和分页

```ts
const statuses = await db.query()
  .selectFrom('orders')
  .select('status')
  .distinct()
  .orderBy('status')
  .pluck<string>('status');
```

`offset()` 要求同时存在 `orderBy()`，否则会抛错。这样做是为了避免不同数据库在无序分页下产生不稳定结果。

```ts
await db.query()
  .selectFrom('orders')
  .select('orderNo')
  .orderBy('orderNo')
  .offset(20)
  .limit(20)
  .execute();
```
