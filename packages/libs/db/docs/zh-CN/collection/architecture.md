---
title: Collection 架构
description: 说明主数据库与外部数据库如何结合物理 Schema 和补充 Metadata，解析出完整 Collection。
---

# Collection 架构

> 本文是第一版架构设计。文中的 `connection.collections`、Database Metadata Store、File Metadata Store、Schema Inspector 和 Collection Resolver 属于目标设计，当前尚未全部实现。

Metadata Store 的持久化边界、文档模型、后端行为和一致性规则，见
[Metadata Store 设计](./metadata-store.md)。该文档是 Metadata Store 实现的规范性设计。

## 目标

无论 Collection 来自主数据库还是外部数据库，运行时和 Agent 都应通过同一个入口获得完整的 `CollectionDefinition`：

```ts
const users = await db.connection().collections.get('users');
const orders = await db.connection('external').collections.get('orders');
```

`DatabaseManager` 负责选择 connection，`DatabaseConnection.collections` 负责读取该 connection 的完整 Collection。第一版不再增加重复的 `db.collections()` 快捷入口。

## 核心模型

Metadata Store 只保存数据库不能完整表达的补充信息，不是物理 Schema 的副本，也不是完整 Collection 的唯一来源。

```text
Physical Schema + Collection Metadata
  -> Collection Resolver
  -> Complete CollectionDefinition
  -> Collection Registry
```

补充 Metadata 主要包括：

- Collection 和 Field 的逻辑名称与确定性命名配置，不包含任意的 `tableName` 或
  `columnName` 映射；
- relations；
- `title`、`description`；
- `interface`、`uiSchema`；
- 虚拟字段及其他 NocoBase 应用层语义。

表、列、物理类型、索引和约束等物理事实仍以数据库 Schema 为准。

## 主数据库

主数据库由 NocoBase 管理，Migration 是物理 Schema 变更的唯一标准：

```text
Migration
  -> CollectionBuilder
  -> Physical Schema
  -> Database Metadata Store
  -> Collection Resolver
  -> Collection Registry
```

- Schema 变更必须通过新的 Migration 表达；已经合并的历史 Migration 不得修改。
- `CollectionBuilder` 负责执行 Schema 变更，并同步数据库无法表达的补充 Metadata。
- 主数据库使用 Database Metadata Store。
- Database Metadata Store 中的 Metadata 只描述这个逻辑数据库，不供其他无关数据库复用。

## 外部数据库

外部数据库的 Schema 不由 NocoBase 管理，不运行 NocoBase Migration，也不使用 `CollectionBuilder` 执行 DDL：

```text
External Database Schema
  -> Schema Introspection
  -> Inferred Collection Model
  + File Metadata Store
  -> Collection Resolver
  -> Collection Registry
```

- 表、字段、主键、索引、约束和外键通过 introspection 获取。
- File Metadata Store 保存外部 Schema 缺少的逻辑信息。
- File Metadata 可以由工具或 AI 初次生成，再由 Agent 或开发者直接补充 relations。
- 有明确外键的关系可以自动推导；仅依靠字段名猜测的关系应先作为候选，再确认后写入文件。
- 修改 File Metadata 不得修改外部数据库的物理 Schema。

这里的 File Metadata 是广义架构分类。可编辑的 TypeScript 文件通过只读 Module Metadata Store
加载；运行时可写的 JSON 或 YAML File Store 是独立后端，需要更严格的原子写入保证。

### File Metadata 旁的物理 Schema Snapshot

外部数据源目录可以在可编辑 File Metadata 旁保存 introspection 生成的物理 Schema Snapshot，便于运行时和
Agent 在本地理解结构。Schema Snapshot 是独立的生成产物，不属于 `CollectionMetadataStore`；外部数据库仍然是
物理 Schema 事实的权威来源。

文件中的两类信息必须明确分开：

```text
File Metadata
  -> generated schema snapshot     # 自动生成，可覆盖
  -> editable metadata             # relations 等补充信息，可编辑
```

- Schema 快照记录表、列、物理类型、索引、约束和外键等 introspection 结果。
- Schema 快照是可重新生成的派生数据，不得作为修改外部数据库的依据。
- Editable Metadata 保存 relations、逻辑映射和 UI 信息等补充内容。
- 重新 introspect 时可以覆盖 Schema 快照，但必须保留 Agent 或开发者补充的 Editable Metadata。
- 运行时应检查 Schema 快照与外部数据库的差异，避免长期使用已经过期的文件。

第一版推荐按 Collection 拆成两个文件：

```text
collection-metadata/
└── external/
    ├── orders.schema.json       # 自动生成，不手改
    └── orders.metadata.ts       # AI 或开发者可编辑
```

`orders.schema.json` 保存 introspection 结果，可以删除并重新生成；`orders.metadata.ts` 保存 relations 等补充信息，重新生成 Schema 快照时不得覆盖。两者由 Collection Resolver 合并为完整的 `orders` Collection。

自动生成的 `orders.schema.json` 只记录物理事实：

```json
{
  "tableName": "orders",
  "columns": [
    {
      "name": "id",
      "type": "bigint",
      "primaryKey": true,
      "nullable": false
    },
    {
      "name": "order_no",
      "type": "varchar",
      "nullable": false
    },
    {
      "name": "customer_id",
      "type": "bigint",
      "nullable": false
    }
  ],
  "indexes": [],
  "constraints": []
}
```

可编辑的 `orders.metadata.ts` 保存应用层语义：

```ts
import { defineCollectionMetadata } from '@nocobase/db';

export default defineCollectionMetadata({
  version: 1,
  name: 'orders',
  title: 'Orders',
  description: 'Customer purchase orders.',

  fields: {
    orderNo: {
      title: 'Order number',
      description: 'Unique business order number.',
      interface: 'input',
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
});
```

Collection 的 `title`、`description`，Field 的 `title`、`description`、`interface`、`uiSchema`，以及 relations 都属于 `*.metadata.ts`；物理表、列、类型、索引和约束属于 `*.schema.json`。

`*.metadata.ts` 不保存 `tableName` 或 `columnName` 自定义映射。Collection 的物理名称由 Connection 和 Collection 的 `underscored`、`tablePrefix` 确定性生成；Schema 快照中的 `tableName` 和 `columns[].name` 只是 introspection 记录的物理事实。

## Metadata Store 与 connection

一个 Metadata Store 对应一个逻辑数据库的 Metadata 空间：

```text
main     -> Database Metadata Store
crm      -> CRM File Metadata Store
erp      -> ERP File Metadata Store
```

如果多个物理 connection 指向同一个逻辑数据库，它们可以共享同一个 Metadata Store：

```text
mainWrite --+
            +-> Main Database Metadata Store
mainRead  --+
```

因此 Store 内部不需要再保存多个 `dataSourceKey` 分区；数据源边界由 Store 本身确定。

## Collection Resolver 与 Registry

`CollectionResolver` 合并物理 Schema 和补充 Metadata，生成完整的 `CollectionDefinition`。

`connection.collections` 暴露解析结果，建议至少提供：

```ts
await connection.collections.get('users');
await connection.collections.list({ limit: 100, cursor });
```

`get(name)` 按名称懒加载并解析一个完整 Collection。`list()` 不能隐式 introspect 和解析数据库中的全部 Collection；它应默认分页，只返回名称、物理表名和类型等轻量摘要。

需要为 Agent 生成全部文件、检查 drift 或导出模型时，应使用名称明确的 `scan()`、`export()` 等显式重操作，而不是改变普通 `list()` 的轻量语义。即使 Registry 已有缓存，也不能依赖缓存掩盖首次全量扫描的成本。

完整 Collection 可以缓存在内存 `CollectionRegistry` 中。Registry 是可失效、可重建的派生结果，不是新的事实来源。

Agent 如果需要读取本地文件，可以按需从 Registry 导出完整 Snapshot。Snapshot 也是生成产物，不应与可编辑的 File Metadata Store 混为一谈。

## Builder 的边界

`CollectionBuilder` 只负责由 NocoBase 管理的数据库 Schema 变更：

```text
CollectionBuilder = write / mutate schema
connection.collections = read resolved collections
```

外部数据库即使允许查询或修改业务数据，也不代表 NocoBase 拥有其 Schema。对外部 connection 执行 Builder DDL 时，应明确拒绝并引导使用 introspection 和 File Metadata。

## 第一版边界

第一版先固定以下原则：

1. 主数据库使用 Migration、Builder 和 Database Metadata Store。
2. 外部数据库使用 Schema Introspection 和 File Metadata Store，不运行 Migration。
3. Metadata Store 只保存补充信息。
4. 完整 Collection 由 Resolver 生成并由 Registry 提供。
5. 统一读取入口是 `db.connection().collections`。
6. 一个逻辑数据库对应一个 Metadata Store；多个 connection 可以共享它。
7. File Metadata 旁可以存在物理 Schema Snapshot，但它是独立的生成产物；外部数据库仍然是物理事实的
   权威来源。
8. `collections.list()` 默认分页并返回轻量摘要；完整 Collection 通过 `get()` 懒加载，全量扫描必须显式执行。

Metadata 文档和 Store API 的细节见 [Metadata Store 设计](./metadata-store.md)。持久化实现和共享配置见
[Metadata Store 后端](./metadata-store-backends.md)。Resolver、Registry、drift、Snapshot 和 rename 行为见
[Collection 解析生命周期](./collection-resolution.md)。

详细组件契约分别见 [Schema Inspector 设计](./schema-inspector.md)、
[Collection Resolver 设计](./collection-resolver.md)、[Collection Registry 设计](./collection-registry.md) 和
[Collection Metadata Service 设计](./metadata-service.md)。
