---
title: Collection Registry 设计
description: 说明解析后 Collection 的缓存、并发加载、失效规则，以及 connection.collections 的对外 API。
---

# Collection Registry 设计

> **文档类型：内部实现。** 调用当前公共 API 时先阅读 [`connection.collections`](../../collections/overview.md)。本页解释缓存、并发加载和失效实现。

> `DatabaseConnection.collections`、Naming Index、Registry、跨 Collection relation 图校验、Builder 主动
> 失效、transaction commit 传播和 Migration batch 失效已经提供。

`CollectionRegistry` 是每个 `DatabaseConnection` 拥有的解析结果缓存。它协调 Inspector、Metadata Store
和 Resolver，但不是新的事实来源。

```text
connection.collections
  -> CollectionRegistry
       -> SchemaInspector
       -> CollectionMetadataStore
       -> CollectionResolver
```

## 对外 API

`DatabaseConnection` 通过 `collections` 暴露统一读取入口：

```ts
export interface ConnectionCollections {
  get(name: string): Promise<CollectionDefinition | undefined>;

  getPhysical(name: string): Promise<PhysicalCollectionSchema | undefined>;

  getResolution(name: string): Promise<CollectionResolutionResult | undefined>;

  list(options?: ListCollectionsOptions): Promise<CollectionSummaryPage>;

  scan(options?: ScanCollectionsOptions): AsyncIterable<CollectionDefinition>;

  invalidate(name?: string): void;

  refresh(name: string): Promise<CollectionDefinition | undefined>;

  validateRelations(name?: string): Promise<void>;
}
```

`getResolution()` 用于需要 inspection/warnings 的审计和 Agent 场景；普通 `get()` 只返回完整
`CollectionDefinition`。`getPhysical()` 接受逻辑 Collection 名，使用有效的 Connection 和 Collection naming
解析真实表名，再返回未经 Resolver 转换的 `PhysicalCollectionSchema`。已经知道物理表名或读取非托管对象时，直接
使用 `schemaInspector.getPhysicalCollection()`。

`get()` 和 `getResolution()` 使用 Registry 缓存；`getPhysical()` 每次重新读取当前物理 Schema，适合 migration、
rollback 和 Schema drift 断言。返回对象是独立副本，调用方修改它不会污染后续读取。

`get(name)`、`getPhysical(name)` 和 `getResolution(name)` 的 name 始终是逻辑 Collection 名。`list()` 默认每页
100 条，最大 1000 条，只返回：

```ts
export interface CollectionSummary {
  name: string;
  tableName: string;
  schema?: string;
  kind: CollectionKind;
  title?: string;
  description?: string;
}
```

`list()` 不解析每个 Collection 的 fields、indexes 和 relations。`scan()` 是明确的全量重操作，通过分页迭代
完整 Collection。第一版不增加重复的 `db.collections()` 快捷方式。

`invalidate()` 只清除缓存；`refresh(name)` 清除指定缓存并立即重新加载。两个名称明确区分“让旧值失效”和
“现在重新读取”，避免 Agent 把全量刷新误认为轻操作。

## 加载和并发

Registry 按逻辑 Collection 名缓存完整解析结果。同一 Collection 的并发首次读取共享同一个 in-flight
Promise，避免重复 introspection。

成功结果可以缓存；失败 Promise 和暂时性连接错误不能长期缓存。表不存在的 `undefined` 结果第一版不做负缓存，
避免创建表后仍返回旧结果。

失效与 in-flight load 通过 generation token 协调：失效之前启动、之后才完成的旧读取可以返回给原调用方，
但不会重新写回已经失效的 cache。

## 失效规则

以下操作成功后必须使 Registry 失效：

- Builder 创建、修改、rename 或删除 Schema；
- Metadata Service 成功写入；
- 完成一批 Migration；
- Module/File Metadata 重载；
- 外部 Schema fingerprint 发生变化；
- Connection reconnect 或 disconnect。

应尽可能按 Collection 失效。Relation 变更还需要使 source 和 target Collection 失效。Migration batch、
reconnect 和无法确定影响范围的 Schema drift 使整个 Registry 失效。

## revision 与 fingerprint

Registry 可以记录：

```text
Metadata revision
Physical Schema fingerprint
Resolver version
```

第一版不要在每次 `get()` 时扫描整张表来计算 fingerprint。主数据库优先依靠 Builder、Migration 和
Metadata Service 主动失效；外部数据库由显式 refresh/scan 或后续的低频 drift 检测更新 fingerprint。

## 逻辑名与物理名

`get(logicalName)` 先读取该 Collection 的 Metadata，合并 Connection 和 Collection 级命名配置，然后计算
`tableName` 并调用 Inspector。

`list()` 从 Inspector 的物理摘要开始，并将默认命名反向解析为逻辑名。已有 Metadata 文档的 Collection
使用其 Collection 级 `naming` 进行覆盖匹配。两个物理对象如果解析为同一逻辑名，则报告
`COLLECTION_NAME_CONFLICT`，不得隐式选择其中一个。

为了保持 `list()` 轻量，Registry 不逐个调用 Metadata Store 的 `get()`。Metadata Store 的分页摘要需要包含
逻辑名、revision、Collection 级 `naming`、`title` 和 `description`，Registry 先构建轻量 Naming Index，
再与 Inspector 摘要进行 merge join。Naming Index 按 Metadata revision 失效，不包含 fields 或 relations。

Naming Index 同时维护 `logicalName -> physicalName` 和 `physicalName -> logicalName` 两个方向。Registry 将
Connection 默认 `tablePrefix` 和 Index 中的 Collection 级前缀一起交给 Inspector；因此 Collection 级
`tablePrefix` 即使不以 Connection 默认前缀开头，也不会在 `list()` 中遗漏。多个 identity 指向同一物理名，
或多个物理名指向同一逻辑名时，都必须报告冲突。

## 事务内的 Registry

Transaction Connection 使用独立的短期 Registry，但不能把未提交的 Schema 或 Metadata 结果写入外部
Connection 的长期 Registry。标准 Builder 和 Metadata Service 操作记录受影响 Collection；事务提交后由
Database Connection 自动使外部 Registry 失效，回滚时丢弃记录。只有通过 raw SQL 绕过这些入口时，调用方才
需要显式 `invalidate()`；无法安全判定范围时全量失效。

Database Metadata Store 在 transaction Connection 中绑定同一个底层 transaction client，因此物理 Schema、
Metadata 文档和业务数据一起 commit/rollback。其他可写 Store 使用隔离 overlay：事务内可读自己的写入，提交前
外层不可见；commit 前以原 revision 回放 CAS，数据库提交失败时执行补偿恢复。只读 Store 保持只读 capability。

事务内只有 Builder/Metadata 实际产生变更时才记录失效。纯 Query transaction 不清缓存；rollback 不触碰外层
Registry。drop/rename 等无法安全缩小范围的操作记录全量失效。

## 当前实现边界

当前提供惰性 `get()`、按逻辑名称读取物理 Schema 的 `getPhysical()`、`getResolution()`、分页 `list()`、显式
`scan()`、并发去重、手动
`invalidate()`/`refresh()` 和 `validateRelations()`。Metadata Service 写成功后会主动精确失效；Builder
执行 create/alter/field/index/constraint/view 后也会失效受影响 Collection，drop/rename 使用全量失效以同步
Naming Index。transaction commit 将事务内记录的精确范围回放到外层 Registry；Migration batch 只要实际执行
或回滚了 migration，就在 batch 完成后全量失效，以覆盖绕过 Builder 的 raw schema/client 操作。

## 相关文档

- [Schema Inspector 设计](../schema-inspector/architecture.md)
- [Collection Resolver 设计](./resolver.md)
- [Collection 解析生命周期](./resolution-lifecycle.md)
- [Metadata Store 设计](../metadata/store.md)
