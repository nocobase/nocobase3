# Metadata 元信息

Metadata 是 Collection 的应用层元信息，用于帮助 UI、应用逻辑和 Agent 理解数据模型。Metadata 和数据库结构变更要分开处理。

先阅读 [Collection Metadata 概览](../collection-metadata/overview.md)。运行时更新使用 [`connection.collectionMetadata`](../collection-metadata/collection-metadata-service.md)，完整 Collection 从 [`connection.collections`](../collections/overview.md) 读取。

Metadata Store、物理 Schema、完整 Collection 以及主数据库和外部数据库的内部实现，见 [Collection 架构](../internals/collection/architecture.md)。

目标持久化模型，以及补充 Metadata 与解析后完整 Collection 的准确边界，见
[Metadata Store 内部实现](../internals/metadata/store.md)。

后端选择和 Store 共享规则见
[Metadata Store 后端](../internals/metadata/store-backends.md)。解析、校验、缓存和 Snapshot 规则见
[Collection 解析生命周期](../internals/collection/resolution-lifecycle.md)。

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
}
```

## metadata-only 更新

如果已有数据库表结构不需要变化，只想补充元信息，应使用：

```ts
await connection.collectionMetadata.updateCollection('orders', {
  title: 'Orders',
  description: 'Customer purchase orders.',
});
```

或者：

```ts
await connection.collectionMetadata.updateField('orders', 'amount', {
  title: 'Amount',
  description: 'Total order amount before refunds.',
});
```

这两类 API 直接更新补充 Metadata，不会生成 schema operation。Builder 只负责物理 Schema 变更，
以及在创建或变更 Schema 时同步定义中携带的补充 Metadata。

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
- 纯 Metadata 更新使用 `connection.collectionMetadata`。
- 物理 Schema 更新使用 `connection.builder`。
- 完整 Collection 统一从 `connection.collections` 读取。
