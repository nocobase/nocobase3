---
title: Collection Metadata 概览
description: 区分 Metadata Store、connection.collectionMetadata、defineCollectionMetadata() 和完整 Collection 解析。
---

# Collection Metadata 概览

数据库物理 Schema 能表达表、列、类型和约束，但不能完整表达 Collection title、description 和应用 relation。Collection Metadata 保存这些补充语义。

## 三个不同入口

| 名称                            | 作用                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `metadataStore`                 | 配置给 Manager 或 Connection 的文档存储后端           |
| `connection.collectionMetadata` | 在 Store 上执行读取、更新、校验、CAS 和缓存失效的服务 |
| `defineCollectionMetadata()`    | 静态 Metadata 文档的 TypeScript 定义辅助函数          |

```text
DatabaseConfig.metadataStore
or ConnectionConfig.metadataStore
          -> CollectionMetadataStore
          -> connection.collectionMetadata
          -> connection.collections
          -> CollectionDefinition
```

Connection 级 `metadataStore` 覆盖 Manager 级配置。`DatabaseConnection` 不公开 `metadataStore` 属性；运行时通过 `connection.collectionMetadata` 操作 Metadata。

## 定义静态 Metadata

```ts
import { defineCollectionMetadata } from '@nocobase/db';

export default defineCollectionMetadata({
  version: 1,
  name: 'orders',
  title: 'Orders',
  fields: {
    orderNo: { title: 'Order number' },
  },
  relations: {
    customer: {
      type: 'belongsTo',
      target: 'customers',
      foreignKey: 'customerId',
      targetKey: 'id',
      title: 'Customer',
    },
  },
});
```

`defineCollectionMetadata()` 原样返回输入并提供类型检查，不执行运行时校验。严格校验使用 `validateCollectionMetadataDocument()`，Store 初始化和写入也会校验文档。

## 选择 Store

| Store                                |             可写 | 适用场景                                                   |
| ------------------------------------ | ---------------: | ---------------------------------------------------------- |
| `DatabaseCollectionMetadataStore`    |               是 | Managed Connection 的持久化 Metadata；未显式配置时自动使用 |
| `ModuleCollectionMetadataStore`      |               否 | 源码管理的外部数据库 Metadata                              |
| `InMemoryCollectionMetadataStore`    |               是 | 测试和显式临时场景                                         |
| `TransactionCollectionMetadataStore` | 取决于底层 Store | 非数据库 Store 的事务 overlay，由 Connection 事务管理      |

Writable File Store 当前尚未实现。

## 下一步

- [Collection Metadata Service](./collection-metadata-service.md)
- [Metadata Store 与后端](./metadata-store.md)
- [Collection Metadata Document](../reference/collection-metadata-document.md)
- [完整 Collection 读取](../collections/overview.md)
