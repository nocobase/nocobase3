# 字段

Field 是 Collection 的字段定义。字段同时包含应用层信息和数据库结构信息，但物理列名由逻辑字段名确定性生成。

## 常用字段类型

当前 DSL 支持：

- `increments`
- `integer`
- `bigInt`
- `string`
- `text`
- `boolean`
- `decimal`
- `float`
- `double`
- `date`
- `time`
- `datetime`
- `json`
- `uuid`
- `native`

## Object DSL

```ts
{
  name: 'amount',
  type: 'decimal',
  precision: 12,
  scale: 2,
  nullable: false,
  defaultValue: 0,
  title: 'Amount',
  description: 'Total order amount before refunds.'
}
```

## Fluent DSL

```ts
collection
  .decimal('amount', { precision: 12, scale: 2 })
  .notNull()
  .defaultTo(0)
  .title('Amount')
  .description('Total order amount before refunds.');
```

## 字段名和列名

```ts
collection.string('eventName', {
  length: 128,
});
```

- `eventName` 是应用层字段名。
- `event_name` 是固定规则推导出的数据库物理列名。

Field 不支持 `columnName` 或字段级 naming。详见 [Builder 命名](./naming.md)。

## 自增字段

```ts
collection.increments('id');
```

等价于：

```ts
{
  name: 'id',
  type: 'increments',
  primaryKey: true
}
```

`type: 'increments'` 会在 schema 编译阶段被视为自增字段。

## native type

```ts
collection.native('ipAddress', 'inet');
```

`native` 会直接使用底层数据库类型，属于方言敏感能力。跨数据库应用应谨慎使用。

## db options

```ts
collection.string('email').dbComment('User email address');
```

或者：

```ts
{
  name: 'email',
  type: 'string',
  db: {
    comment: 'User email address',
  },
}
```

## Agent 注意事项

- `title` 和 `description` 是应用层元信息。
- `db.comment` 是数据库层 comment。
- 物理列名由逻辑字段名和 Collection 的 `naming.underscored` 生成。
- 不要生成 `columnName` 或字段级 naming。
- MySQL 中引用 `increments` 主键的整型外键通常需要 `unsigned: true`。
