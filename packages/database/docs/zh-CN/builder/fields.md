# 字段

Field 是 Collection 的字段定义。字段既包含应用层信息，也可以包含数据库层映射信息。

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
  columnName: 'event_name',
  length: 128,
});
```

- `eventName` 是应用层字段名。
- `event_name` 是数据库物理列名。

如果没有显式 `columnName`，字段会根据当前命名策略推导物理列名。详见 [命名映射](./naming.md)。

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
collection.native('ipAddress', 'inet', {
  columnName: 'ip_address',
});
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
- `columnName` 是物理列名覆盖，不要用它代替字段名。
- `columnName` 按原样使用，不再参与 underscored 转换。
- MySQL 中引用 `increments` 主键的整型外键通常需要 `unsigned: true`。
