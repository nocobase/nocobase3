# QueryAdapter 查询适配器

`QueryAdapter` 当前是一个薄查询适配层，用于基础数据库操作和测试验证。它不是 Repository，也不是 ORM。

它工作在数据库物理名层：可以做 `underscored` 归一化，但不会读取 Collection metadata。

## 当前接口

```ts
interface QueryAdapter {
  table(name: string): any;
  raw<T = unknown>(sql: string, bindings?: unknown[]): Promise<T>;
}
```

## 基础查询

```ts
await db.query().table('orders').insert({
  status: 'paid',
});

const rows = await db.query()
  .table('orders')
  .select('status')
  .where('status', 'paid');
```

## underscored 归一化

如果 connection 配置了：

```ts
naming: {
  underscored: true,
}
```

`db.query()` 的表名和列名输入会被归一化为小写下划线：

```ts
await db.query()
  .table('tblOrderItems')
  .select(['orderNumber', 'createdAt'])
  .where({ orderNumber: 'SO-001' });
```

等价于：

```ts
await db.query()
  .table('tbl_order_items')
  .select(['order_number', 'created_at'])
  .where({ order_number: 'SO-001' });
```

`select` 会保留调用方传入的字段 key。也就是说，SQL 使用 `created_at`，但结果 key 仍然是 `createdAt`：

```ts
[
  {
    orderNumber: 'SO-001',
    createdAt: '2026-08-13 00:00:00',
  },
]
```

如果传入的本身就是物理列名，结果 key 也保持物理列名：

```ts
const rows = await db.query()
  .table('tbl_order_items')
  .select('order_number', 'created_at');
```

```ts
[
  {
    order_number: 'SO-001',
    created_at: '2026-08-13 00:00:00',
  },
]
```

`select('*')` 和 `raw` 不做结果 key 转换，返回数据库原始结果。

`db.query()` 不会自动应用 `tablePrefix`。如果物理表叫 `tbl_order_items`，应写：

```ts
db.query().table('tblOrderItems');
db.query().table('tbl_order_items');
```

不要写：

```ts
db.query().table('orderItems');
```

除非实际物理表就是 `order_items`。

## 不读取 Collection metadata

`db.query()` 不会做 `field.name -> columnName` 的映射：

```ts
await builder.createCollection('orders', (collection) => {
  collection.string('orderNo').columnName('order_number');
});

await db.query().table('orders').where('orderNo', 'SO-001');
```

上面的 `orderNo` 会被归一化为 `order_no`，不会映射成显式 `columnName: 'order_number'`。

以后需要这种元数据感知查询时，应放在 Repository 层，而不是让 `QueryAdapter` 读取 Collection metadata。

## raw

```ts
await db.query().raw('select 1');
```

`raw` 是方言敏感能力，跨数据库应用应谨慎使用。

## 当前边界

- Repository 暂未实现。
- Model 暂未实现。
- Transformer 暂未实现。
- QueryAdapter 不是最终查询抽象。
- 复杂业务查询可以后续通过 Repository 或自定义 query 封装补充。
- `select` 会按调用方传入的字段 key 返回结果；`select('*')` 和 `raw` 返回数据库原始结果。

## Agent 注意事项

- 不要把 `QueryAdapter` 当 Repository 使用。
- 不要在文档或代码里声明当前已经有 Model。
- 需要跨数据库时，避免生成方言敏感 raw SQL。
- 需要 `columnName` 映射时，不要使用 `db.query()` 假装 Repository。
