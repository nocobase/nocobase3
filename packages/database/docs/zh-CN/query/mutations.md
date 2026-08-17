# insert / update / delete

写入入口按操作类型拆分：

```ts
db.query().insertInto('orders');
db.query().updateTable('orders');
db.query().deleteFrom('orders');
```

## insertInto

插入单行：

```ts
await db.query()
  .insertInto('orders')
  .values({
    orderNo: 'SO-001',
    amount: 99.5,
    status: 'paid',
  })
  .execute();
```

插入多行：

```ts
await db.query()
  .insertInto('orders')
  .values([
    { orderNo: 'SO-001', status: 'draft' },
    { orderNo: 'SO-002', status: 'paid' },
  ])
  .execute();
```

`insertInto()` 必须调用 `values()` 后才能执行。

## updateTable

```ts
await db.query()
  .updateTable('orders')
  .set({ status: 'completed' })
  .where('orderNo', '=', 'SO-001')
  .execute();
```

`where()` 也支持 expression callback：

```ts
await db.query()
  .updateTable('orders')
  .set({ status: 'settled' })
  .where(({ eb }) =>
    eb.and([
      eb('status', '=', 'paid'),
      eb('paidAt', 'is not', null),
    ])
  )
  .execute();
```

为了避免误操作，`updateTable()` 没有 `where()` 时会抛错。确实要更新全表时，必须显式写 `allowAllRows()`：

```ts
await db.query()
  .updateTable('orders')
  .set({ archived: true })
  .allowAllRows()
  .execute();
```

## deleteFrom

```ts
await db.query()
  .deleteFrom('orders')
  .where('status', '=', 'draft')
  .execute();
```

`deleteFrom()` 同样要求 `where()` 或 `allowAllRows()`：

```ts
await db.query()
  .deleteFrom('orders')
  .allowAllRows()
  .execute();
```

## 返回值

V1 返回轻量 mutation result：

```ts
interface InsertResult {
  insertedCount?: number;
  insertId?: unknown;
  rows?: Row[];
}

interface UpdateResult {
  updatedCount?: number;
  rows?: Row[];
}

interface DeleteResult {
  deletedCount?: number;
  rows?: Row[];
}
```

不同数据库和 driver 对返回值支持不同。跨数据库代码不应依赖 `returning` 一类非通用能力。
