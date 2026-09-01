# Metadata-only 更新

纯 Metadata 更新用于补充或修改 Collection 的应用层信息，不改变数据库结构。最终统一入口是
`connection.collectionMetadata`，不属于 Builder API。

## Collection Metadata

```ts
await connection.collectionMetadata.updateCollection('orders', {
  title: 'Orders',
  description: 'Customer purchase orders.',
});
```

## Field Metadata

```ts
await connection.collectionMetadata.updateField('orders', 'amount', {
  title: 'Amount',
  description: 'Total order amount before refunds.',
});
```

两次更新都只写 `CollectionMetadataStore`，不会生成或执行 Schema operation。写入成功后，
`connection.collections` 的相关缓存会主动失效，下一次读取返回合并后的完整 Collection。

## 适用场景

- 已有数据库表不需要改变，只需要补充业务标题或描述。
- Agent 需要补充字段解释。
- 外部数据库使用显式配置的可写 Metadata Store 保存应用语义。

## 不适用场景

- 新增或修改数据库列。
- 创建数据库索引或约束。
- 写数据库 comment。

以上物理结构操作使用 `connection.builder`。`title`、`description` 不应写到 `db.comment`。
