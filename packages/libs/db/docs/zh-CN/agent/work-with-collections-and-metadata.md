---
title: 选择 Collections、Schema Inspector 与 Metadata API
description: Agent 在物理 Schema、完整 Collection、补充 Metadata 和 Store 配置之间选择正确入口。
---

# 选择 Collections、Schema Inspector 与 Metadata API

这几组 API 操作的是不同层，不可互换。

| 需求                                         | 使用                                         |
| -------------------------------------------- | -------------------------------------------- |
| 创建或修改物理 Schema                        | `connection.builder`，业务变更放入 Migration |
| 按逻辑名读取完整 Collection                  | `connection.collections`                     |
| 检查真实数据库表、列、索引和约束             | `connection.schemaInspector`                 |
| 更新 title、description、relation 等补充信息 | `connection.collectionMetadata`              |
| 配置补充 Metadata 的持久化方式               | `metadataStore` 配置                         |
| 声明静态 Metadata 文档                       | `defineCollectionMetadata()`                 |

## 读取完整 Collection

```ts
const connection = db.connection();
const orders = await connection.collections.get('orders');
```

`collections.get()` 的输入是逻辑 Collection 名称。返回值合并：

```text
物理 Schema + 补充 Metadata + Connection naming = CollectionDefinition
```

如果需要区分物理检查结果和解析 warning，使用 `getResolution()`；如果只需要对应物理 Schema，使用 `getPhysical()`。

## 检查物理 Schema

```ts
const inspector = db.connection().schemaInspector;
const schemas = await inspector.listSchemas();
```

Schema Inspector 是只读物理数据库接口，使用物理 identity。它不读取或修改 Collection Metadata。

## 更新补充 Metadata

```ts
const connection = db.connection();
const current = await connection.collectionMetadata.get('orders');

await connection.collectionMetadata.updateField(
  'orders',
  'totalAmount',
  { title: 'Order total' },
  { expectedRevision: current?.revision ?? null },
);
```

写入服务使用 revision 做 compare-and-swap。更新后会失效相关 Collection 缓存；后续 `collections.get()` 会得到新结果。

## Store、Service 和 Helper

- `metadataStore`：`DatabaseConfig` 或 `ConnectionConfig` 中的存储后端实例。
- `connection.collectionMetadata`：在 Store 之上执行读取、patch、校验、CAS 和缓存失效的服务。
- `defineCollectionMetadata()`：静态文档的 TypeScript 类型辅助函数；它不执行运行时校验。

继续阅读：[Collections](../collections/overview.md)、[Schema Inspector](../schema-inspector/overview.md)、[Collection Metadata](../collection-metadata/overview.md)。
