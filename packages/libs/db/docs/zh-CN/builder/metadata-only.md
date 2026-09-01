# Metadata-only API

metadata-only API 用于补充或修改 Collection 元信息，不改变数据库结构。

## updateCollectionMetadata

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

## updateFieldMetadata

```ts
await builder.updateFieldMetadata('orders', 'amount', {
  title: 'Amount',
  description: 'Total order amount before refunds.',
});
```

## Schema 影响

不会生成 schema operation。

```ts
const result = await builder.updateFieldMetadata('orders', 'amount', {
  title: 'Amount',
});

console.log(result.schemaOperations); // []
```

## 适用场景

- 已有数据库表不需要改变。
- 只需要补充业务标题或描述。
- Agent 需要补充字段解释。
- Collection Generator 从数据库元数据生成基础 Collection 后，需要人工或 Agent 补充应用层元信息。

## 不适用场景

- 新增数据库列。
- 修改数据库列类型。
- 创建数据库索引或约束。
- 写数据库 comment。

## Agent 注意事项

- 只补充业务说明时，用 metadata-only API。
- 不要把 `title`、`description` 写到 `db.comment`。
- metadata-only 操作的 impact 应是 safe。
