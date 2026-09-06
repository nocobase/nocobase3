---
title: Metadata Store 后端
description: 说明当前 Database、Module、In-memory 和 Transaction Metadata Store 的持久化、revision、读写与事务语义。
---

# Metadata Store 后端

所有后端都实现同一个 `CollectionMetadataStore` 契约，但持久化位置、revision 类型和写入能力不同。

| 后端                                 | 持久化                       | 可写             | Revision           | 主要用途                     |
| ------------------------------------ | ---------------------------- | ---------------- | ------------------ | ---------------------------- |
| `DatabaseCollectionMetadataStore`    | 数据库内部表                 | 是               | 递增整数           | 受管数据库的生产 Metadata    |
| `ModuleCollectionMetadataStore`      | 已导入的 TypeScript 文档数组 | 否               | 规范内容的 SHA-256 | 随源码发布的外部数据库说明   |
| `InMemoryCollectionMetadataStore`    | 当前进程内存                 | 是               | 递增整数           | 测试和显式临时场景           |
| `TransactionCollectionMetadataStore` | 事务期覆盖层                 | 取决于基础 Store | 临时字符串         | 隔离事务内写入并在提交后回放 |

## Database Store

```ts
const store = new DatabaseCollectionMetadataStore({
  resolveClient: () => connection.client(),
  tableName: '__nocobase_collection_metadata',
  // schema: 'internal',
});
```

默认内部表名是 `__nocobase_collection_metadata`，也可以通过 `tableName` 和 `schema` 显式隔离。Store 初始化时按需创建表；并发创建会在确认表已存在后安全收敛。

每条记录包含逻辑 Collection 名、完整 Metadata Document、数字 revision 和时间戳。创建从 revision `1` 开始，更新执行带 revision 条件的数据库更新。未命中预期 revision 时抛出冲突错误，而不是覆盖别人的修改。

该内部表属于 DB 包实现细节，Schema Inspector 和 Collection Resolver 不应把它暴露为业务 Collection。

## Module Store

```ts
const store = new ModuleCollectionMetadataStore({
  source: 'packages/crm/database/metadata.ts',
  documents: [customersMetadata, contactsMetadata],
});
```

Module Store 接收调用方已经导入的文档数组，不扫描文件系统，也不执行任意模块路径。初始化时会：

1. 严格校验每个文档；
2. 拒绝重复的 Collection 名；
3. 对规范化 JSON 计算稳定 SHA-256 revision。

它是只读后端，`put()` 和 `delete()` 固定抛出 `CollectionMetadataStoreReadOnlyError`，错误码为 `METADATA_STORE_READ_ONLY`。源码文件应通过代码变更修改，不能把 Module Store 当作运行时文件编辑器。

## In-memory Store

```ts
const store = new InMemoryCollectionMetadataStore();
```

In-memory Store 实现完整的严格校验、分页、复制隔离和 compare-and-swap，但数据不会跨进程保留。它适合测试或调用方明确接受临时状态的场景，不应被误当成默认生产持久化方案。

## Transaction Store

`TransactionCollectionMetadataStore` 包装一个基础 Store，并按需加载事务访问的文档：

```text
read/write during transaction
  -> transaction overlay
  -> commit in stable name order
  -> base Store compare-and-swap
```

`list()` 合并基础 Store 与覆盖层；事务内删除的条目不会出现在结果中。`commit()` 只回放 dirty 条目，并继续使用事务开始时读取的基础 revision。部分回放失败时，`rollbackCommitted()` 按相反顺序恢复已提交条目。

Transaction Store 不把只读后端变成可写后端，其 capabilities 继承基础 Store。

## Store 选择

```ts
const db = createDatabaseManager({
  metadataStore: sharedStore,
  connections: {
    main: { dialect: 'sqlite', filename: 'app.sqlite' },
    crm: {
      dialect: 'postgres',
      connection: process.env.CRM_DATABASE_URL,
      metadataStore: crmModuleStore,
    },
  },
});
```

选择顺序是：

1. Connection 自己的 `metadataStore`；
2. Manager 级 `metadataStore`；
3. 受管主连接可使用其数据库后端；
4. 外部连接没有可用 Store 时报告配置错误。

当前没有字符串形式的命名 Store 注册表，也没有可写 JSON/YAML File Store。配置必须直接传入 `CollectionMetadataStore` 实例。

## 相关文档

- [Metadata Store 内部契约](./store.md)
- [Metadata Store 使用方式](../../collection-metadata/metadata-store.md)
- [DatabaseConfig](../../reference/database-config.md)
