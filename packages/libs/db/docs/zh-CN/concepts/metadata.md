---
title: Metadata 概念
description: 区分数据库物理事实、补充 Collection Metadata 和解析后的 CollectionDefinition，并说明各自的公开入口。
---

# Metadata 概念

Collection Metadata 保存数据库物理 Schema 无法完整表达的应用语义。它用于帮助 UI、业务逻辑和 Agent 理解数据模型，但不替代数据库表、字段或约束。

## Metadata 在解析链路中的位置

```text
connection.schemaInspector      读取物理 Schema
          +
metadataStore                   保存补充 Metadata 文档
          ↓
connection.collections          解析、校验和缓存
          ↓
CollectionDefinition            完整运行时模型
```

`metadataStore` 是 Manager 或 Connection 的配置项，不是 `DatabaseConnection` 的公开属性。运行时更新通过 `connection.collectionMetadata` 完成。

## 什么属于补充 Metadata

典型内容包括：

- Collection 的 `title` 和 `description`；
- Field 的 `title` 和 `description`；
- 应用层 Relation；
- Collection 局部 naming 配置。

下面这些属于物理数据库事实，不应在补充 Metadata 中复制为另一套 Schema：

- 物理表、列和 View；
- 列类型、Nullability 和默认值；
- Index、Unique、Foreign Key 等数据库约束；
- 数据库对象 comment。

## Schema 变更与 Metadata 更新

| 任务                                   | 使用入口                        | 是否执行 DDL          |
| -------------------------------------- | ------------------------------- | --------------------- |
| 新建或修改表、字段、Index、Constraint  | `connection.builder`            | 是                    |
| 在 Schema 变更中同时同步标题等补充信息 | `connection.builder`            | 是，同时更新 Metadata |
| 只更新标题、描述或应用 Relation        | `connection.collectionMetadata` | 否                    |
| 读取合并后的完整模型                   | `connection.collections`        | 否                    |

例如，只补充说明时直接更新 Metadata：

```ts
await connection.collectionMetadata.updateField('orders', 'amount', {
  title: 'Amount',
  description: 'Total order amount before refunds.',
});
```

不要为这类变更调用 `alterCollection()` 或 `alterField()`。

## 静态 Metadata

源码管理的外部数据库 Metadata 使用 `defineCollectionMetadata()` 提供类型检查：

```ts
import { defineCollectionMetadata } from '@nocobase/db';

export default defineCollectionMetadata({
  version: 1,
  name: 'orders',
  title: 'Orders',
  fields: {
    amount: { title: 'Amount' },
  },
});
```

`defineCollectionMetadata()` 不连接数据库，也不执行运行时校验。Store 加载或写入文档时才执行严格校验。

## Metadata 与数据库 comment

`title` 和 `description` 是应用语义，`db.comment` 是数据库对象 comment：

```ts
{
  name: 'amount',
  type: 'decimal',
  title: 'Amount shown in the UI',
  db: {
    comment: 'Total amount before refunds',
  },
}
```

不要为了补充应用说明而修改数据库 comment。

## 使用规则

- 先判断任务改变的是物理 Schema、补充语义，还是两者都改变。
- 纯 Metadata 更新使用 `connection.collectionMetadata`，不要生成 Schema operation。
- 完整 Collection 从 `connection.collections` 读取，不要把 Store 文档当成完整模型。
- 不要在 Metadata 中生成 `tableName`、`columnName` 或物理 Schema 的副本。
- 需要选择 Store 或调用具体更新方法时，转到正式的 Collection Metadata 文档。

## 继续阅读

- [Collection Metadata 概览](../collection-metadata/overview.md)
- [Collection Metadata Service](../collection-metadata/collection-metadata-service.md)
- [Metadata Store 与后端](../collection-metadata/metadata-store.md)
- [Collection Metadata Document](../reference/collection-metadata-document.md)
- [Collections：读取完整 Collection](../collections/overview.md)
