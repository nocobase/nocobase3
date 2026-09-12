---
title: Metadata Store 内部契约
description: 说明 CollectionMetadataStore 当前保存的数据、compare-and-swap 规则、分页语义，以及它与物理 Schema、Service 和解析结果的边界。
---

# Metadata Store 内部契约

`CollectionMetadataStore` 保存版本化的补充 Metadata Document。它不保存完整 `CollectionDefinition`，也不复制可从数据库读取的物理 Schema。

```text
Physical Schema ─┐
                 ├─> CollectionResolver ─> Resolved Collection
Metadata Store ──┘
```

## 权威来源

| 信息                                         | 权威来源                          |
| -------------------------------------------- | --------------------------------- |
| 表、视图、列、数据库类型、默认值、索引和约束 | Schema Inspector 读取的物理数据库 |
| Collection 标题、描述和局部命名配置          | Metadata Document                 |
| Field 标题和描述                             | Metadata Document                 |
| 数据库不能完整表达的 relation                | Metadata Document                 |
| 完整 Collection                              | Resolver 的派生结果，不持久化     |

因此，Metadata Store 中不得写入一份物理结构副本来覆盖数据库事实。若数据库结构改变，应重新读取 Schema 并让 Registry 失效。

## 文档模型

一个文档只描述一个逻辑 Collection：

```ts
interface CollectionMetadataDocument {
  version: 1;
  name: string;
  naming?: NamingOptions;
  title?: string;
  description?: string;
  fields?: Record<string, FieldMetadata>;
  relations?: Record<string, RelationMetadata>;
}
```

`fields` supplements titles, descriptions, and explicitly declared logical types (`boolean`, `json`, `date`, `time`). `relations` stores relation types, target collections, explicit keys, and presentation metadata. Documents must pass `validateCollectionMetadataDocument()`; unknown properties are rejected. Physical compatibility is checked during Collection resolution. See [the logical type contract](../../reference/collection-metadata-document.md#supplemental-logical-types).

## Store 接口

```ts
interface CollectionMetadataStore {
  readonly capabilities: {
    readonly writable: boolean;
    readonly optimisticConcurrency: boolean;
  };

  initialize(): Promise<void>;
  get(name: string): Promise<StoredCollectionMetadata | undefined>;
  list(
    options?: ListCollectionMetadataOptions,
  ): Promise<CollectionMetadataPage>;
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

### 初始化

`initialize()` 必须可以重复调用。需要创建内部表或验证输入文档的后端在这里完成初始化。并发初始化共享同一个进行中的过程；失败后允许重试。

### 读取与分页

`get(name)` 返回文档和 revision 的副本，调用方修改返回值不得污染 Store。

`list({ limit, cursor })` 按逻辑 Collection 名稳定排序，只返回轻量摘要。cursor 属于 Store 协议，调用方不得解析或构造。默认 limit 为 100，最大为 1000。

### Compare-and-swap

所有写入都显式携带预期 revision：

- `put(document, { expectedRevision: null })` 只创建尚不存在的文档；
- 更新必须传入当前 revision；
- 删除必须传入当前 revision；
- 实际 revision 不一致时抛出 `CollectionMetadataConflictError`，稳定错误码为 `METADATA_CONFLICT`。

这个约束防止管理界面、自动化任务或多个进程互相覆盖 Metadata。

## Service 边界

普通业务代码通过 `connection.collectionMetadata` 使用 `CollectionMetadataService`，而不是直接拼装 Store 写入。Service 负责：

1. 合并 patch；
2. 严格校验候选文档；
3. 校验物理字段与跨 Collection relation；
4. 使用 Store revision 写入；
5. 使受影响的 Registry 和 Naming Index 失效。

Store 只负责文档持久化和并发控制，不负责检查物理数据库。

## Connection 与事务

Connection 级 `metadataStore` 优先于 Manager 级 Store。没有显式配置时，受管主连接可以使用数据库后端；外部连接必须得到一个明确可用的 Store，否则不能解析补充 Metadata。

Database Store 在事务 Connection 中直接绑定数据库事务 client。其他 Store 通过 `TransactionCollectionMetadataStore` 先写入隔离覆盖层，数据库事务提交前按名称顺序回放到基础 Store；回放失败时，它会反向补偿已经提交的条目。事务回滚不得把覆盖层变更泄漏到基础 Store。

## 当前不变式

1. Physical Schema 始终来自 Inspector，Metadata 不能伪造表或列。
2. 每次 Store 写入都经过严格文档校验。
3. 更新和删除必须执行 revision compare-and-swap。
4. `list()` 使用稳定顺序和不透明 cursor。
5. Store 返回的文档不能与内部状态共享可变嵌套对象。
6. 完整 Collection 只由 Resolver 生成并由 Registry 缓存。
7. 旧完整 Collection 定义不会成为运行时 fallback；需要转换时显式调用 legacy extraction 工具。

## 相关文档

- [Metadata Store 后端](./store-backends.md)
- [Metadata Service 内部实现](./service.md)
- [Collection Metadata Document](../../reference/collection-metadata-document.md)
- [旧 Collection 定义转换](../../reference/legacy-collection-metadata-extraction.md)
- [Collection 解析生命周期](../collection/resolution-lifecycle.md)
