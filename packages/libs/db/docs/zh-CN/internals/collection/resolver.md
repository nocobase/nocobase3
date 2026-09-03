---
title: Collection Resolver
description: 说明 CollectionResolver 如何把物理 Schema、命名配置和补充 Metadata 合并为 CollectionDefinition，并报告不完整检查与结构冲突。
---

# Collection Resolver

`CollectionResolver` 是纯解析层：接收一次完整输入，返回解析结果或结构化错误。它不连接数据库、不读取 Store，也不缓存结果。

```ts
interface CollectionResolutionInput {
  physical: PhysicalCollectionSchema;
  metadata?: CollectionMetadataDocument;
  naming?: NamingOptions;
  context: CollectionResolutionContext;
}

interface CollectionResolutionResult {
  collection: CollectionDefinition;
  inspection: PhysicalSchemaInspection;
  warnings: readonly CollectionResolutionWarning[];
}
```

`context` 用于把 foreign key 指向的物理对象解析成目标逻辑 Collection 和目标命名配置。

## 合并顺序

1. 合并 Connection 命名与 Collection 局部命名；
2. 根据 Metadata 或确定性反向命名得到逻辑 Collection 名；
3. 按 ordinal position 解析物理列；
4. 将 Field 标题和描述应用到已存在的物理 Field；
5. 转换 primary、unique、foreign key、check constraint 和 index；
6. 从 Metadata 追加 relation Field；
7. 为 view 附加 Inspector 读取的 definition；
8. 汇总 inspection warning；存在阻断 issue 时抛错。

物理结构永远先于 Metadata。Metadata 不能创建一个数据库中不存在的普通 Field，也不能覆盖数据库类型、nullable、默认值或约束。

## 命名解析

有效命名规则为：

```text
effective naming = Collection metadata override + Connection defaults
```

默认值是 `underscored: true` 和空 `tablePrefix`。没有 Metadata 时，Resolver 只接受能够通过当前策略确定性往返的表名和列名：

```text
physical -> logical -> physical
```

往返结果不同、前缀不匹配或多个物理对象产生同一逻辑名时，报告 `COLLECTION_NAME_CONFLICT`。当前不支持任意 `tableName`、`columnName` 映射表。

## Field 与物理对象

Resolver 从列结构生成普通 Field，并保留可表达的数据库信息：

- 统一 `type` 与 `nativeType`；
- nullable、default、auto increment；
- length、precision、scale 和 unsigned；
- comment、generated expression 和数据库扩展信息。

索引 key、include column、primary key、unique 和 foreign key 引用的物理列必须能映射到已解析 Field。无法映射时报告 `COLLECTION_PHYSICAL_REFERENCE_INVALID`。

为数据库 constraint 提供 backing 的 index 不会再作为普通 index 重复加入 Collection。

## Relation

Relation 只来自 Metadata。relation 名不能和物理 Field 同名；`sourceKey` 和 `belongsTo.foreignKey` 必须指向本地物理 Field。

没有显式 `belongsTo.foreignKey` 时，Resolver 按命名策略生成预期物理外键列名，再反查本地 Field。目标 Collection、targetKey 和 through Collection 的完整检查由 Registry 的关系图校验完成。

## View

物理类型为 `view` 或 `materializedView` 且 Inspector 对 `viewDefinition` 的读取状态为 `complete` 时，Resolver 返回：

```ts
view: {
  asRaw: {
    sql: physical.viewDefinition;
  }
}
```

如果 Inspector 声称读取完整但没有 definition，解析失败；读取状态为 partial 或 unsupported 时，不伪造 definition。

## 完整性与 warning

列信息必须是 `complete`，否则无法安全生成 Collection，Resolver 报告 `COLLECTION_SCHEMA_INCOMPLETE`。

其他 aspect 为 partial 或 unsupported 时可以返回 Collection，但 `CollectionResolutionResult.warnings` 会包含：

- `COLLECTION_INSPECTION_PARTIAL`；
- `COLLECTION_INSPECTION_UNSUPPORTED`；
- 来自 Inspector 的 `COLLECTION_INSPECTION_WARNING`。

需要 Schema 审计、迁移规划或其他完整结构判断的调用方必须读取 `getResolution()`，不能只读取 `get()` 后忽略完整性状态。

## 错误原则

`CollectionResolutionError` 包含一个或多个 issue。每个 issue 都有稳定 `code`、结构化 `path` 和可读 `message`。Resolver 聚合同一次输入中可发现的问题，避免调用方逐个修复后才看到下一个冲突。

旧完整 Collection 定义不会参与解析。需要迁移旧输入时，先在显式迁移流程中使用 [`extractLegacyCollectionMetadata()`](../../reference/legacy-collection-metadata-extraction.md)。

## 相关文档

- [Collection 当前架构](./architecture.md)
- [Collection 解析生命周期](./resolution-lifecycle.md)
- [Collection Registry](./registry.md)
- [Schema Inspector 内部架构](../schema-inspector/architecture.md)
