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
  collection.index(['paymentStatus', 'paidAt'], { name: 'idx_orders_payment_paid' });
  collection.unique(['paymentStatus', 'paidAt'], { name: 'uk_orders_payment_paid' });
});
```

## Object DSL

```ts
await builder.alterCollection('orders', {
  addFields: [
    { name: 'paidAt', type: 'datetime', nullable: true },
  ],
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

默认只重命名 Collection metadata，不重命名底层物理表：

```ts
await builder.renameCollection('oldUsers', 'users');
```

默认逻辑改名时，Builder 会把旧的有效物理表名保存为新 Collection 的 `tableName`，避免新逻辑名按命名规则自动指向另一张表。

按命名规则同步重命名物理表：

```ts
await builder.renameCollection('oldUsers', 'users', {
  renameTable: true,
});
```

重命名到指定物理表名：

```ts
await builder.renameCollection('oldUsers', 'users', {
  renameTableTo: 'app_users',
});
```

## dropCollection

```ts
await builder.dropCollection('orders');
```

`dropCollection` 是 destructive 操作，可能删除底层数据库对象。

## Schema 影响

`alterCollection`、`addField`、`alterField`、`dropField` 和 `dropCollection` 通常会修改数据库结构。`renameCollection` 默认不生成 schema operation，只有设置 `renameTable: true` 或 `renameTableTo` 时才重命名物理表。

## Agent 注意事项

- 删除字段或删除 Collection 前，应先 dry-run。
- 字段重命名当前没有独立 API，可用 add + migrate data + drop 的方式表达。
- 只改应用层名称时，直接使用 `renameCollection(from, to)`。
- 需要修改物理表名时，明确写 `renameTable: true` 或 `renameTableTo`。
