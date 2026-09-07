---
title: Collection Registry
description: 说明 CollectionRegistry 的公开读取接口、Naming Index、缓存、并发加载、失效和跨 Collection relation 校验。
---

# Collection Registry

`CollectionRegistry` 实现 `connection.collections`。它协调 Schema Inspector、Metadata Store 和 Resolver，并缓存可重建的解析结果。

## 对外接口

```ts
interface ConnectionCollections {
  get(name: string): Promise<CollectionDefinition | undefined>;
  getPhysical(name: string): Promise<PhysicalCollectionSchema | undefined>;
  getResolution(name: string): Promise<CollectionResolutionResult | undefined>;
  list(options?: ListCollectionsOptions): Promise<CollectionSummaryPage>;
  scan(options?: ScanCollectionsOptions): AsyncIterable<CollectionDefinition>;
  refresh(name: string): Promise<CollectionDefinition | undefined>;
  invalidate(name?: string): void;
  validateRelations(name?: string): Promise<void>;
}
```

所有名称参数都是当前 Connection 下的逻辑 Collection 名。已经持有物理表名时，应直接调用 `connection.schemaInspector`。

## Naming Index

Registry 通过 Metadata Store 的分页摘要建立双向索引：

```text
logical Collection name <-> physical table name
```

索引应用 Connection 默认命名和 Collection 局部覆盖，并在读取数据库前检测 Metadata 之间的物理表名冲突。没有显式 Metadata 的物理表只能通过确定性命名规则反向解析。

Naming Index 是派生缓存。Collection 命名 Metadata 改变时必须重建，不能把旧映射继续用于查询。

## 单项缓存

Registry 按逻辑名缓存成功的 `CollectionResolutionResult`，并为并发首次加载共享同一个 Promise。

以下结果不做长期缓存：

- Collection 不存在时的 `undefined`；
- Resolver 错误；
- 暂时性连接或 Store 错误。

这样可以让新建表或短暂故障在下一次读取时立即恢复。所有公开返回值都经过结构化复制，调用方不能修改内部 cache。

## `list()` 与 `scan()`

`list()` 面向目录和选择器，只读取轻量摘要，并合并 Metadata 中的 `title`、`description`。它保留 Inspector cursor 语义，并过滤 Metadata Store 的内部物理表。

`scan()` 面向完整审计，逐个解析 Collection。扫描结果会写入单项 cache，但只有在扫描期间该名称没有被失效时才写入，避免旧的 in-flight 结果覆盖新状态。

## 失效代次

Registry 同时维护全局 generation 和每个 Collection 的 generation。一次加载开始时保存 token，完成时只有 token 仍匹配才允许缓存。这解决了以下竞争：

```text
load starts
  -> Builder or Metadata Service changes the Collection
  -> invalidate happens
  -> old load completes
  -> generation mismatch, result is not cached
```

`invalidate(name)` 只影响单项；`invalidate()` / `invalidateAll()` 清除全部项和 Naming Index。命名变化可以在清除相关 Collection 的同时单独标记 Naming Index 失效。

## 物理漂移与冲突

- Metadata 存在但物理表缺失：`COLLECTION_SCHEMA_DRIFT`；
- 两个物理表映射到同一逻辑名：`COLLECTION_NAME_CONFLICT`；
- Collection 局部命名与默认物理表同时存在并冲突：`COLLECTION_NAME_CONFLICT`；
- 内部 Metadata 表：从 list、scan 和 get 结果中排除。

Registry 不在每次 `get()` 时扫描整个数据库。Builder 和 Metadata Service 负责主动失效；外部数据库直接变化时由调用方显式刷新。

## Relation 图校验

`validateRelations(name?)` 使用 Registry 自身作为 Collection provider，遍历指定 Collection 的可达关系图或全部 Collection。它聚合问题后抛出 `CollectionRelationValidationError`，错误码为 `COLLECTION_RELATION_VALIDATION_FAILED`。

事务提交前会对受影响的 Collection 执行该校验，只有提交成功后才把失效传播到父 Connection。

## 相关文档

- [`connection.collections`](../../collections/overview.md)
- [Collection 解析生命周期](./resolution-lifecycle.md)
- [Collection Resolver](./resolver.md)
- [Metadata Service 内部实现](../metadata/service.md)
