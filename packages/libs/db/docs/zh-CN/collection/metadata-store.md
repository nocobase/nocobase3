---
title: Metadata Store 设计
description: 说明 Metadata Store 的职责边界、文档模型、一致性规则，以及它与物理 Schema 和完整 Collection 的关系。
---

# Metadata Store 设计

> **文档类型：内部设计。** 使用入口见 [Collection Metadata 概览](../collection-metadata/overview.md)；本页保留文档模型和一致性设计。

> 带 revision 的文档 Store 契约和 In-memory 后端已经实现。过渡期公共名称为
> `CollectionMetadataStore` 和 `InMemoryCollectionMetadataStore`；旧
> `CollectionMetadataStore` 仍供 Builder 保存完整 `CollectionDefinition`。所有消费者迁移完成后，文档
> Store 将接管最终名称并删除旧接口。

## 最终决定

Metadata Store 只持久化用于补充物理数据库 Schema 的 Metadata。它不是物理
Schema 事实的权威来源，也不保存完整的 `CollectionDefinition`。

```text
Physical Schema + Collection Metadata
  -> Collection Resolver
  -> Complete CollectionDefinition
  -> Collection Registry
```

各组件的边界如下：

```text
Schema Inspector       读取物理数据库事实
Metadata Store         持久化应用层补充语义
Collection Resolver    生成完整的运行时 Collection
Collection Registry    可重建的内存缓存
Agent Snapshot         供工具和 Agent 使用的可重建本地导出
```

这一边界同时适用于 NocoBase 管理的主数据库和外部数据库。

## 为什么不保存完整 Collection

保存完整 Collection 会重复记录物理事实，例如：

```text
Database Schema: amount decimal not null
Metadata Store:  amount integer nullable
```

出现这种差异后，运行时将无法判断哪一份定义正确。以下情况都可能产生类似问题：

- Migration 成功，但 Metadata 写入失败；
- 外部系统修改了外部数据库；
- 索引或约束在应用外部发生变化；
- 不同数据库方言对物理类型的表达不同；
- 本地文件仍然描述过期的数据库结构。

因此，表、列、物理类型、可空性、主键、索引和约束必须以数据库为准。Metadata
只补充数据库不能稳定表达的应用语义。

## Metadata Store 保存什么

Collection 级 Metadata 可以包含：

- 必要时使用的逻辑 Collection 名称；
- `title` 和 `description`；
- Collection 级确定性 `naming` 配置；
- 其他明确定义的 NocoBase 应用语义。

Collection Metadata 不定义记录写权限。数据库对象类型由 Inspector 报告，记录 INSERT、UPDATE、DELETE
是否允许应由数据库、权限层或后续单独设计的能力模型决定；Connection 的 `schemaManagement` 也只控制
Schema DDL 和 Migration。

Field 级 Metadata 可以包含：

- 必要时使用的逻辑 Field 名称；
- `title` 和 `description`；
- 其他不会重新定义物理列的展示或应用语义。

Metadata Store 还保存数据库无法完整表达的信息：

- relations；
- relation 的展示 Metadata；
- 由工具或 Agent 推导并经确认的语义映射。

Relation Metadata 描述应用层关联，不代表物理数据库中一定存在外键约束。物理外键是否
存在、引用哪些列、参照动作是什么，仍然是 Schema Inspector 返回的物理事实。因此，外部数据库
即使没有物理外键，也可以定义有效的应用关联。

Metadata Store 不将以下物理事实作为可编辑 Metadata 保存：

- 任意的物理 `tableName` 或 `columnName` 映射；
- 物理列类型；
- 可空性；
- 默认值约束；
- 主键；
- 物理索引；
- 物理 unique、foreign-key 或 check 约束；
- View 或 Materialized View 定义；
- 数据库方言特定的 introspection 结果。

Collection 级 `naming` 仍然允许使用，因为它是确定性命名规则，而不是任意的逻辑名到物理名映射：

```ts
{
  naming: {
    underscored: false,
    tablePrefix: 'archive_',
  },
}
```

信息的权威来源如下：

| 信息                                            | 权威来源                               |
| ----------------------------------------------- | -------------------------------------- |
| 表、列和 View 是否存在                          | Physical Schema                        |
| 物理类型、可空性和默认值                        | Physical Schema                        |
| 主键、索引和约束                                | Physical Schema                        |
| 数据库对象 comment                              | Physical Schema                        |
| 逻辑 Collection 和 Field 名称                   | 确定性命名规则，必要时由 Metadata 补充 |
| Collection 和 Field 的 `title` 或 `description` | Metadata Store                         |
| 应用层 relation                                 | Metadata Store，并与 Schema 校验       |
| 物理外键约束                                    | Physical Schema                        |
| 完整的运行时 `CollectionDefinition`             | Collection Resolver                    |

## Metadata 文档模型

一个文档描述一个逻辑 Collection 的补充 Metadata。第一版应使用显式版本化格式：

```ts
export interface CollectionMetadataDocument {
  version: 1;
  name: string;
  naming?: NamingOptions;
  title?: string;
  description?: string;
  fields?: Record<string, FieldMetadata>;
  relations?: Record<string, RelationMetadata>;
}
```

子类型应保持精简：

```ts
export interface FieldMetadata {
  title?: string;
  description?: string;
}

export interface RelationMetadata {
  type: 'belongsTo' | 'hasOne' | 'hasMany' | 'belongsToMany';
  target: string;
  sourceKey?: string;
  targetKey?: string;
  foreignKey?: string;
  otherKey?: string;
  through?: string;
  title?: string;
  description?: string;
}
```

这些类型故意不包含 `nullable`、`primaryKey`、`unique`、`length` 和 `db.nativeType`
等物理 Field 属性。如果以后的应用功能需要类似数值，必须使用语义明确的独立属性，不能假装在重新定义
物理列。

示例：

```ts
{
  version: 1,
  name: 'orders',
  title: 'Orders',
  description: 'Customer purchase orders.',

  fields: {
    orderNo: {
      title: 'Order number',
      description: 'Unique business order number.',
    },
    customerId: {
      title: 'Customer ID',
    },
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
}
```

### 分开保存 fields 和 relations

持久化文档将两种概念明确分开：

```text
fields          物理字段的补充 Metadata
relations       应用层关联定义
```

`fields` 中的每一项都必须能对应物理 Field；找不到时报告 Schema drift，不得隐式创建虚拟字段。
relations 最终可以转换到运行时 `CollectionDefinition.fields` 中，但持久化格式应保留其明确意图。
两个区域之间出现同名项时必须报错，不能通过隐式优先级处理。

### V1 文档校验规则

`CollectionMetadataDocument` 是持久化契约，不是宽松配置对象。第一版使用严格校验：

- 输入和所有嵌套结构必须是普通对象，不能是数组、class 实例或 `null`；
- `version` 必须严格等于数字 `1`；
- `name`、Field key、Relation key 和 Relation 的名称引用必须是非空字符串，且不能带首尾空白；
- `title` 和 `description` 存在时必须是字符串，持久化文档不接受 `null`；
- `fields` 和 `relations` 的名称不能重复；
- `naming.underscored` 必须是 boolean，`naming.tablePrefix` 必须是 string，空前缀合法；
- 第一版拒绝未知属性，避免将拼写错误或已经移除的属性静默持久化；
- 校验不得修改输入，成功时返回独立的规范化副本。

结构校验不访问数据库，因此不检查物理 Field、relation target、target key 或 through Collection 是否存在。
这些依赖物理 Schema 或其他 Collection 的规则由 Resolver 和 Metadata Service 负责。

校验失败使用一个聚合错误返回全部可确认问题：

```ts
export interface CollectionMetadataIssue {
  code: CollectionMetadataIssueCode;
  path: readonly (string | number)[];
  message: string;
}

export class CollectionMetadataValidationError extends Error {
  readonly code = 'COLLECTION_METADATA_INVALID';
  readonly issues: readonly CollectionMetadataIssue[];
}
```

`path` 从文档根开始，例如 `['relations', 'customer', 'target']`。纯文档问题至少区分不支持的版本、
缺少必填值、类型错误、未知属性、名称冲突和非法 relation；依赖物理 Schema 的
`COLLECTION_METADATA_FIELD_NOT_FOUND` 和 `COLLECTION_SCHEMA_DRIFT` 不属于这一层。

### define helper 与运行时校验

`defineCollectionMetadata()` 只提供 TypeScript 定义辅助并原样返回输入，不做运行时校验：

```ts
export default defineCollectionMetadata({
  version: 1,
  name: 'orders',
  title: 'Orders',
});
```

所有 Store 后端在接受外部输入或加载持久化内容时仍必须调用：

```ts
validateCollectionMetadataDocument(input);
```

因此 TypeScript Module、JSON/YAML 文件和 Database Store 共享同一套运行时规则。使用 define helper
不代表文档可信，也不能绕过 Store 边界的校验。

## Legacy extraction

迁移历史配置或离线定义时，使用纯函数从旧完整 `CollectionDefinition` 提取 V1 补充 Metadata：

```ts
const result = extractLegacyCollectionMetadata(definition, {
  naming: connectionNaming,
});
```

提取函数不访问 Inspector、不写 Store，也不检查物理 Field 是否存在。允许列表如下：

| 旧定义                                       | V1 文档              |
| -------------------------------------------- | -------------------- |
| Collection `name`                            | `document.name`      |
| Collection `naming`                          | `document.naming`    |
| Collection `title`、`description`            | 同名属性             |
| 普通 Field `title`、`description`            | `fields[field.name]` |
| Relation `name`                              | `relations` 的 key   |
| Relation `type`、`target`                    | 同名属性             |
| Relation `sourceKey`、`targetKey`            | 同名属性             |
| Relation `foreignKey`、`otherKey`、`through` | 同名属性             |
| Relation `title`、`description`              | 同名属性             |

物理 Field 类型、nullable、default、主键、自增、unique、index、长度、精度、scale、`db`、Collection
constraint、index 和 View 定义都不提取，也不为这些正常丢弃项生成 warning。它们由 Inspector 从数据库重新读取。

提取结果带诊断：

```ts
export interface LegacyMetadataExtractionDiagnostic {
  severity: 'warning' | 'error';
  code: LegacyMetadataExtractionDiagnosticCode;
  path: readonly (string | number)[];
  message: string;
}

export interface LegacyMetadataExtractionResult {
  document?: CollectionMetadataDocument;
  diagnostics: readonly LegacyMetadataExtractionDiagnostic[];
}
```

- 旧 `interface`、`uiSchema` 和 Collection `writable` 属于已经移除的应用语义，返回 warning；
- 缺少名称、非法 relation、fields/relations 重名、旧 virtual field 和不兼容的 `tableName`/`columnName`
  映射返回 error；
- 存在 error 时不返回可直接持久化的 `document`；
- 兼容的旧物理名称映射可以安全删除，不产生诊断；是否兼容按传入的 Connection naming 与 Collection
  naming 合并后确定性计算。

旧属性只在 extraction 的内部 legacy 输入边界识别，不会重新加入公共 `CollectionDefinition`。

## 物理 Schema Snapshot 是独立产物

自动生成的物理 Schema Snapshot 不是 Collection Metadata：

```text
collection-metadata/
└── external/
    ├── orders.schema.json
    └── orders.metadata.ts
```

两个文件的职责分别是：

```text
orders.schema.json    自动生成的 Schema Snapshot，可安全重新生成
orders.metadata.ts    可编辑的补充 Metadata，introspection 时必须保留
```

`orders.schema.json` 可以保存物理事实：

```json
{
  "tableName": "orders",
  "columns": [
    {
      "name": "order_no",
      "type": "varchar",
      "nullable": false
    }
  ],
  "indexes": [],
  "constraints": []
}
```

这些值属于 `SchemaSnapshotStore` 或生成产物，不属于 `CollectionMetadataStore`，也不能作为修改
外部数据库的指令。

## 完整 Collection 是解析结果

完整 Collection 是派生的运行时值：

```text
Physical table: orders
Physical column: order_no varchar not null

Metadata:
  logical field: orderNo
  title: Order number

Resolved Collection field:
  name: orderNo
  type: string
  nullable: false
  title: Order number
```

应用和 Agent 通过 Connection 读取解析后的完整结果：

```ts
const orders = await db.connection().collections.get('orders');
const externalOrders = await db
  .connection('external')
  .collections.get('orders');
```

第一版不增加重复的 `db.collections()` 快捷方式。

## Store 接口

持久化接口应面向带版本的 Metadata 文档，不包含 Collection Builder 的领域逻辑：

```ts
export interface CollectionMetadataStore {
  readonly capabilities: CollectionMetadataStoreCapabilities;

  initialize(): Promise<void>;

  get(name: string): Promise<StoredCollectionMetadata | undefined>;

  list(
    options?: ListCollectionMetadataOptions,
  ): Promise<CollectionMetadataPage>;

  put(
    document: CollectionMetadataDocument,
    options: PutCollectionMetadataOptions,
  ): Promise<StoredCollectionMetadata>;

  delete(name: string, options: DeleteCollectionMetadataOptions): Promise<void>;
}
```

该接口是唯一的 Collection Metadata Store 契约，只接受补充文档，不接受完整 `CollectionDefinition`。

持久化结果带有 revision：

```ts
export interface StoredCollectionMetadata {
  document: CollectionMetadataDocument;
  revision: string | number;
}
```

第一版的 capability 应能区分可写 Database Store 和只读源码模块：

```ts
export interface CollectionMetadataStoreCapabilities {
  writable: boolean;
  optimisticConcurrency: boolean;
}

export interface ListCollectionMetadataOptions {
  limit?: number;
  cursor?: string;
}

export interface CollectionMetadataSummary {
  name: string;
  revision: string | number;
  naming?: NamingOptions;
  title?: string;
  description?: string;
}

export interface CollectionMetadataPage {
  items: CollectionMetadataSummary[];
  nextCursor?: string;
}

export interface PutCollectionMetadataOptions {
  expectedRevision: string | number | null;
}

export interface DeleteCollectionMetadataOptions {
  expectedRevision: string | number;
}
```

这里的 `capabilities.writable` 只表示 Metadata 文档后端能否被运行时代码写入，与 Collection
记录能否 INSERT、UPDATE、DELETE 无关，也与 Connection 的 `schemaManagement` 无关。

更新时使用乐观并发控制：

```ts
await store.put(nextDocument, {
  expectedRevision: current.revision,
});
```

创建时显式传入 `null`：

```ts
await store.put(newDocument, {
  expectedRevision: null,
});
```

如果其他写入者已经修改文档，Store 应抛出稳定的 `METADATA_CONFLICT` 错误，不能覆盖新版本。

`expectedRevision: null` 表示仅在文档不存在时创建。字符串或数字 revision 表示仅更新该精确
版本。options 必须传入，以防止调用者误执行盲写。普通 Store API 不提供隐式 blind upsert。

只读后端仍然可以把内容 hash 作为 revision，供 Registry 和重载逻辑识别变化；这不代表它支持
写入或 compare-and-swap。

Database Store 中的 `put()` 是 compare-and-swap 操作：

```text
update metadata
set document = nextDocument,
    revision = revision + 1,
    updated_at = now
where name = collectionName
  and revision = expectedRevision
```

更新行数为零，表示预期 revision 已经过期。创建也必须是条件操作，避免两个首次写入者相互覆盖。
`delete()` 使用相同规则。返回的 revision 必须唯一标识本次成功持久化的文档。

### list() 只返回分页轻量结果

`list()` 不能隐式 introspect 并解析数据库中的每一张表。它只返回一页已保存文档的摘要：

```ts
const page = await store.list({
  limit: 100,
  cursor,
});
```

全数据库 introspection 必须是显式的 `scan()` 或 `export()` 等操作，不属于普通 Metadata Store
`list()` 路径。

摘要中的 `naming`、`title` 和 `description` 用于 `connection.collections.list()` 构建轻量 Naming Index，
避免为了 Collection 级命名覆盖而逐个读取完整 Metadata 文档。摘要字段必须与同一 revision 的 document 一致。

## Metadata Service

Patch 操作属于 Store 之上的领域服务：

```ts
await connection.collectionMetadata.updateCollection('orders', patch);
await connection.collectionMetadata.updateField('orders', 'amount', patch);
```

`CollectionMetadataService` 负责：

- 读取当前文档；
- 校验 patch；
- 按确定性规则合并；
- 携带预期 revision 写入；
- 将 fields 和 relations 与解析后的 Schema 校验；
- 使 Collection Registry 失效；
- 使受影响的 Registry 和 Naming Index 失效。

因此，底层 Store 不需要单独的 `patchCollection()`、`patchField()` 或 `renameCollection()`。确定性
命名下的 Collection rename 不是 Metadata-only 操作，由 `CollectionBuilder.renameCollection()` 统一协调。
完整的公共 API、并发和校验规则见 [Collection Metadata Service 设计](./metadata-service.md)。

## 后端与 Collection 解析

持久化后端和 Store 共享规则见 [Metadata Store 后端](./metadata-store-backends.md)。

主数据库和外部数据库的生命周期、Resolver 校验、Registry 失效、Agent Snapshot 和 rename 原子性见
[Collection 解析生命周期](./collection-resolution.md)。

## 最终接口边界

旧的完整 `CollectionDefinition` Store 已移除。`CollectionMetadataStore` 只保存 V1 补充文档；
`SchemaInspector` 读取物理事实；`CollectionResolver` 合并两者；`connection.collections` 是完整 Collection
的统一读取入口。Legacy extraction 只用于显式迁移工具，不再作为运行时 fallback。

## 第一版不变式

第一版实现必须保证：

1. Metadata Store 保存补充语义，不保存完整 Collection。
2. 物理 Schema 是物理事实的权威来源。
3. 完整 Collection 是 Resolver 的解析结果，不是 Store 中的持久化记录。
4. Schema Snapshot、Registry Cache 和 Agent Snapshot 是相互独立的生成产物。
5. 一个 Store 代表一个逻辑数据库的 Metadata 空间。
6. 多个兼容的 Connection 可以共享一个 Store。
7. Database Store 必须使用带 revision 的原子文档写入，并强制要求 compare-and-swap。
8. TypeScript Module Metadata 在运行时只读。
9. 生产环境不得静默回退到 in-memory Metadata。
10. 无法保证原子协调时，rename 必须被拒绝。

## 相关文档

- [Collection 架构](./architecture.md)
- [Metadata Store 后端](./metadata-store-backends.md)
- [Collection Metadata Service 设计](./metadata-service.md)
- [Collection 解析生命周期](./collection-resolution.md)
- [Metadata 概念](../concepts/metadata.md)
- [数据库配置](../reference/database-config.md)
- [命名简化影响](./naming-simplification-impact.md)
