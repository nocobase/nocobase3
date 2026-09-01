# alterCollection

`alterCollection` 用于修改已有 Collection 的结构。它可以新增字段、修改字段、删除字段、增加索引、增加约束、删除索引或删除约束。

## TypeScript 签名

```ts
alterCollection(
  name: string,
  input: CollectionAlterInput,
  options?: BuilderExecOptions,
): Promise<BuilderResult>
```

## Fluent DSL

```ts
await builder.alterCollection('orders', (collection) => {
  collection.datetime('paidAt').nullable();
  collection.string('paymentStatus', { length: 32 }).defaultTo('pending');
  collection.alterField('amount', { precision: 14, scale: 2, nullable: false });
  collection.dropFields('legacyStatus', 'legacyCode');
  collection.index(['paymentStatus', 'paidAt'], {
    name: 'idx_orders_payment_paid',
  });
  collection.unique(['paymentStatus', 'paidAt'], {
    name: 'uk_orders_payment_paid',
  });
});
```

## Object DSL

```ts
await builder.alterCollection('orders', {
  addFields: [{ name: 'paidAt', type: 'datetime', nullable: true }],
  alterFields: [
    {
      name: 'amount',
      changes: { precision: 14, scale: 2, nullable: false },
    },
  ],
  dropFields: ['legacyStatus'],
});
```

## Shortcut API

```ts
await builder.addField('orders', {
  name: 'paidAt',
  type: 'datetime',
  nullable: true,
});

await builder.alterField('orders', 'amount', {
  precision: 14,
});

await builder.dropField('orders', 'legacyStatus');
```

## renameCollection

`renameCollection` 同步重命名逻辑 Collection、底层物理表和 Metadata：

```ts
await builder.renameCollection('oldUsers', 'users');
```

例如无前缀时，物理表会从 `old_users` 变为 `users`；Collection 自己的 `tablePrefix` 会保留。

Builder 会在执行 DDL 前扫描 Metadata。如果 Relation、Foreign Key、结构化 View 或 Raw SQL View 等依赖不能被原子更新，会抛出 `COLLECTION_RENAME_HAS_DEPENDENCIES`，且不修改数据库或 Metadata。

## dropCollection

```ts
await builder.dropCollection('orders');
```

`dropCollection` 是 destructive 操作，可能删除底层数据库对象。

## Schema 影响

`alterCollection`、`addField`、`alterField`、`dropField`、`dropCollection` 和 `renameCollection` 都可能修改数据库结构。

## Agent 注意事项

- 删除字段或删除 Collection 前，应先 dry-run。
- 字段重命名当前没有独立 API，可用 add + migrate data + drop 的方式表达。
- 不支持只修改逻辑名并保留旧物理表名。
- 有依赖的 Collection 应先用显式 Migration 原子处理依赖，再执行改名。
