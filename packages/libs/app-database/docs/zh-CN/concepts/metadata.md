# Metadata 元信息

Metadata 是 Collection 的应用层元信息，用于帮助 UI、应用逻辑和 Agent 理解数据模型。Metadata 和数据库结构变更要分开处理。

## 应用层 metadata

Collection 级别：

```ts
{
  title: 'Orders',
  description: 'Customer purchase orders.'
}
```

Field 级别：

```ts
{
  name: 'amount',
  type: 'decimal',
  title: 'Amount',
  description: 'Total order amount before refunds.',
  interface: 'number',
  uiSchema: {
    'x-component': 'InputNumber',
  },
}
```

## metadata-only 更新

如果已有数据库表结构不需要变化，只想补充元信息，应使用：

```ts
await builder.updateCollectionMetadata('orders', {
  title: 'Orders',
  description: 'Customer purchase orders.',
  fields: {
    amount: {
      title: 'Amount',
      description: 'Total order amount before refunds.',
    },
  },
});
```

或者：

```ts
await builder.updateFieldMetadata('orders', 'amount', {
  title: 'Amount',
  description: 'Total order amount before refunds.',
});
```

这两类 API 不会生成 schema operation。

## 和 db.comment 的关系

`title`、`description` 是应用层元信息。`db.comment` 是数据库层 comment。

```ts
{
  name: 'amount',
  type: 'decimal',
  title: 'Amount',
  description: 'Displayed in the application.',
  db: {
    comment: 'Stored as database column comment when supported.',
  },
}
```

不要为了补充 UI 或 Agent 说明而修改数据库 comment。只有在确实需要写入数据库对象 comment 时，才使用 `db.comment`。

## Agent 注意事项

- 只补充元信息时，不要调用 `alterCollection` 或 `alterField`。
- `updateCollectionMetadata` 和 `updateFieldMetadata` 是 metadata-only 操作。
- metadata-only 操作的 `schemaOperations` 应为空数组。
