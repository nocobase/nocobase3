---
title: connection.schemaInspector：检查物理 Schema
description: 使用物理数据库 identity 只读检查 Schema、表、视图、列、索引、约束和检查完整性。
---

# `connection.schemaInspector`：检查物理 Schema

Schema Inspector 是 Connection 上的只读物理数据库接口。它不使用 Collection 逻辑名，不读取补充 Metadata，也不修改数据库。

## Agent 契约

| 项目           | 内容                                       |
| -------------- | ------------------------------------------ |
| 获取方式       | `db.connection(name?).schemaInspector`     |
| 输入名称       | 物理 `{ schema?, tableName }` identity     |
| Metadata-aware | 否                                         |
| 副作用         | 无，只读 introspection                     |
| 找不到对象     | `getPhysicalCollection()` 返回 `undefined` |
| 方言差异       | 通过 `inspection` status 和 warnings 表达  |

## API

```ts
interface SchemaInspector {
  listSchemas(): Promise<PhysicalSchemaInfo[]>;
  getPhysicalCollection(
    identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined>;
  listPhysicalCollections(
    options?: ListPhysicalCollectionsOptions,
  ): Promise<PhysicalCollectionPage>;
  scanPhysicalCollections(
    options?: ScanPhysicalCollectionsOptions,
  ): AsyncIterable<PhysicalCollectionSchema>;
}
```

## 最小示例

```ts
const inspector = db.connection().schemaInspector;
const schemas = await inspector.listSchemas();

const users = await inspector.getPhysicalCollection({
  schema: 'public',
  tableName: 'users',
});
```

`schema` 可以省略，此时由方言选择默认 Schema。传入的 `tableName` 是物理数据库对象名称，不会应用 Collection naming 转换。

## 分页和扫描

```ts
const page = await inspector.listPhysicalCollections({
  limit: 100,
  schemas: ['public'],
  kinds: ['table', 'view'],
});
```

需要完整 Schema 时显式扫描：

```ts
for await (const collection of inspector.scanPhysicalCollections({
  pageSize: 100,
  schemas: ['public'],
})) {
  // inspect columns, constraints and indexes
}
```

`listPhysicalCollections()` 返回轻量 summary；`scanPhysicalCollections()` 才逐项加载列、索引和约束。

## 检查完整性

不同数据库未必能完整检查所有 aspect。读取返回值中的：

- `inspection.aspects`：`complete`、`partial` 或 `unsupported`；
- `inspection.warnings`：稳定的 code、message 和 aspect。

不要把“不支持检查”解释成“数据库不存在该约束”。

## 选择正确入口

| 需求                                | 入口                            |
| ----------------------------------- | ------------------------------- |
| 按逻辑名读取完整 Collection         | `connection.collections`        |
| 按物理名检查真实对象                | `connection.schemaInspector`    |
| 创建或修改对象                      | `connection.builder`            |
| 更新 title、description 或 relation | `connection.collectionMetadata` |

详细的物理模型、方言差异和示例仍见：[Schema Inspector 设计](../collection/schema-inspector.md)和[示例](../collection/schema-inspector-examples.md)。
