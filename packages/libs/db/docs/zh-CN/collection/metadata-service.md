---
title: Collection Metadata Service 设计
description: 说明补充 Metadata 的读取、更新、并发控制、校验和 Registry 失效边界。
---

# Collection Metadata Service 设计

> 本文描述目标设计，当前 Metadata 更新仍由 Builder 和旧版 `CollectionMetadataStore` 完成。

`CollectionMetadataService` 是 Metadata Store 之上的领域层。Store 只提供按 revision 读写文档的
持久化能力；Service 负责 patch 语义、Schema 校验、relation 校验和 Registry 失效。

```text
connection.collectionMetadata
  -> CollectionMetadataService
       -> CollectionMetadataStore
       -> SchemaInspector
       -> CollectionRelationValidator
       -> CollectionRegistry invalidation
```

## 与 Builder 和 Collections 的边界

```text
connection.builder             修改物理 Schema
connection.collectionMetadata  修改补充 Metadata
connection.collections         读取解析后的完整 Collection
```

这三个入口不可以相互隐藏。例如，修改 Field `title` 不应通过 Builder 伪装成 Schema alter；
增加物理列也不能通过 Metadata Service 完成。

## 目标 API

```ts
export interface CollectionMetadataService {
  get(name: string): Promise<StoredCollectionMetadata | undefined>;

  updateCollection(
    name: string,
    patch: CollectionMetadataPropertiesPatch,
    options?: UpdateMetadataOptions,
  ): Promise<StoredCollectionMetadata>;

  updateField(
    collection: string,
    field: string,
    patch: FieldMetadataPatch,
    options?: UpdateMetadataOptions,
  ): Promise<StoredCollectionMetadata>;

  setRelation(
    collection: string,
    name: string,
    relation: RelationMetadata,
    options?: UpdateMetadataOptions,
  ): Promise<StoredCollectionMetadata>;

  removeRelation(
    collection: string,
    name: string,
    options?: UpdateMetadataOptions,
  ): Promise<StoredCollectionMetadata | undefined>;
}
```

Relation 使用明确的 set/remove 方法，不通过含糊的深层 merge 创建或删除。
`updateField()` 只更新已存在物理 Field 的补充 Metadata；找不到对应 Field 时返回稳定错误，不能创建新字段。

Patch 中的 `undefined` 表示不修改，`null` 表示显式清除可选属性。Service 持久化前移除 `null`，
文档中不保存无意义的空值。

## 并发更新

Service 的每次更新都执行：

1. 读取当前 document 和 revision；
2. 应用确定性 patch；
3. 校验新文档；
4. 以当前 revision 执行 Store compare-and-swap；
5. 写入成功后使受影响的 Registry 项失效。

```ts
export interface UpdateMetadataOptions {
  expectedRevision?: string | number | null;
}
```

调用者传入 `expectedRevision` 时，Service 还必须先确认读到的版本与之一致。未传入时，Service
使用本次读取得到的 revision，仍然不会执行 blind write。发生冲突时抛出
`METADATA_CONFLICT`，第一版不自动重试，避免在重试中覆盖新的业务意图。

## 校验顺序

写入前按以下顺序校验：

1. Metadata 文档版本和结构合法；
2. Collection 命名规则可确定地定位物理对象；
3. `fields` 中的每个项都存在对应物理 Field；
4. relations 与物理 Field 不重名；
5. relation 的本地 key 存在；
6. `CollectionRelationValidator` 检查 target、target key 和 through Collection。

校验失败时不写 Store，不使 Registry 失效。外部数据库只读的是物理 Schema，不代表
Module Metadata 后端可写；Module Store 的写入请求返回明确的 `METADATA_STORE_READ_ONLY`，并指示需要编辑的
源文件。

## Registry 失效

- Collection 或 Field Metadata 变更：使当前 Collection 失效；
- relation 变更：使 source、target 和 through Collection 失效；
- Collection 级 `naming` 变更：使 Naming Index 和当前 Collection 失效；
- 无法确定影响范围时：全量失效。

必须先成功持久化，再失效 Registry。Registry 失效不应导致已成功的 Metadata 事务回滚；如果失效钩子
异常，应全量清理本地缓存并报告诊断信息。

## Rename 不是 Metadata-only 操作

在确定性命名下，逻辑 Collection rename 通常会改变物理表名，并可能影响 relation、View、Registry
和 Snapshot。因此公共 `CollectionMetadataService` 不提供独立 `renameCollection()`。

完整 rename 由 `CollectionBuilder.renameCollection()` 统一协调，并通过 Service 的内部能力更新 Metadata。
只有物理 Schema 和 Metadata 可以在同一原子事务中更新时才允许执行；否则在 DDL 前拒绝。

## 与 Migration 的关系

Migration 仍然是主数据库 Schema 变更的权威记录。Builder 执行 Migration 时，在同一事务内使用
Service 的内部写入能力保存补充 Metadata。Migration 不得导入或遍历随运行时演化的 Metadata 定义。

## 兼容当前 API

当前 Builder 中的 `updateCollectionMetadata()` 和 `updateFieldMetadata()` 在迁移期可以委托给 Service。
消费端迁移到 `connection.collectionMetadata` 后，Builder 只保留 Schema 职责，再移除这两个 Metadata-only
快捷方法。

## 相关文档

- [Metadata Store 设计](./metadata-store.md)
- [Collection Resolver 设计](./collection-resolver.md)
- [Collection Registry 设计](./collection-registry.md)
- [Collection 解析生命周期](./collection-resolution.md)
