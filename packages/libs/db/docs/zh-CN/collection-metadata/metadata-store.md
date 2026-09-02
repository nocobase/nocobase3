---
title: Metadata Store 与后端
description: CollectionMetadataStore 的读写契约、revision、compare-and-swap，以及 Database、Module、Memory 和 Transaction 后端。
---

# Metadata Store 与后端

`CollectionMetadataStore` 是版本化补充 Metadata 文档的存储合同。业务代码通常配置 Store，然后通过 `connection.collectionMetadata` 使用服务层 API。

## Store 契约

```ts
interface CollectionMetadataStore {
  readonly capabilities: {
    readonly writable: boolean;
    readonly optimisticConcurrency: boolean;
  };

  initialize(): Promise<void>;
  get(name: string): Promise<StoredCollectionMetadata | undefined>;
  list(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<CollectionMetadataPage>;
  put(
    document: CollectionMetadataDocument,
    options: { expectedRevision: string | number | null },
  ): Promise<StoredCollectionMetadata>;
  delete(
    name: string,
    options: { expectedRevision: string | number },
  ): Promise<void>;
}
```

`expectedRevision: null` 表示创建不存在的文档；更新或删除必须传当前 revision。并发不匹配会抛出 `CollectionMetadataConflictError`，稳定 code 是 `METADATA_CONFLICT`。

## 配置位置

```ts
const db = createDatabaseManager({
  metadataStore: sharedStore,
  connections: {
    main: { dialect: 'sqlite', filename: 'app.sqlite' },
    crm: {
      dialect: 'sqlite',
      filename: 'crm.sqlite',
      metadataStore: crmStore,
    },
  },
});
```

Connection 级配置优先于 Manager 级配置。External Connection 没有可用 Store 时会抛出 `CollectionMetadataStoreRequiredError`。

## 后端行为

- Database Store：持久、可写、数字 revision，使用内部表。
- Module Store：只读、内容 SHA revision，适合源码管理文档。
- In-memory Store：可写、进程内 revision，适合测试。
- Transaction Store：为非数据库 Store 提供事务隔离、CAS 回放和失败补偿。

详细内部实现见[Metadata Store](../internals/metadata/store.md)和[后端实现](../internals/metadata/store-backends.md)。
