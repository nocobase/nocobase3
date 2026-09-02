---
title: connection.collections：读取完整 Collection
description: 按逻辑名称读取、列举、扫描、刷新和校验由物理 Schema 与补充 Metadata 解析出的 Collection。
---

# `connection.collections`：读取完整 Collection

`connection.collections` 是连接级属性，没有 `db.collections()` 快捷入口。它把物理数据库 Schema 与补充 Metadata 解析成完整 `CollectionDefinition`。

## Agent 契约

| 项目             | 内容                               |
| ---------------- | ---------------------------------- |
| 获取方式         | `db.connection(name?).collections` |
| 输入名称         | Collection 逻辑名称                |
| Metadata-aware   | 是                                 |
| 执行 DDL         | 否                                 |
| 缓存             | 是，可手动失效或刷新               |
| 物理 Schema 来源 | `connection.schemaInspector`       |

```text
Physical Schema
  + Collection Metadata
  + Connection naming
  = CollectionDefinition
```

## 读取一个 Collection

```ts
const collection = await db.connection().collections.get('orders');
```

返回 `CollectionDefinition | undefined`。找不到对应物理对象时返回 `undefined`。

三个读取入口的差异：

| API                   | 返回                                              |
| --------------------- | ------------------------------------------------- |
| `get(name)`           | 完整解析后的 `CollectionDefinition`               |
| `getPhysical(name)`   | 逻辑 Collection 对应的 `PhysicalCollectionSchema` |
| `getResolution(name)` | Collection、物理检查完整性和解析 warning          |

`getPhysical()` 的输入仍是逻辑名。已经持有物理表名时使用 `schemaInspector.getPhysicalCollection()`。

## 列举和扫描

```ts
const page = await db.connection().collections.list({ limit: 50 });
```

`list()` 返回轻量分页摘要，不解析全部字段。需要显式扫描完整 Collection 时使用：

```ts
for await (const collection of db.connection().collections.scan({
  pageSize: 50,
})) {
  // use the resolved CollectionDefinition
}
```

## 缓存和校验

| API                        | 用途                                         |
| -------------------------- | -------------------------------------------- |
| `invalidate(name?)`        | 清除一个或全部解析缓存，不立即读取           |
| `refresh(name)`            | 清除一个缓存并立即重新解析                   |
| `validateRelations(name?)` | 校验一个可达关系图或全部 Collection relation |

Builder、Migration 和 Metadata Service 会在成功更新后失效相关缓存。只有调用者掌握外部变化时才需要手动 `invalidate()` 或 `refresh()`。

## 与其他入口的区别

- 修改 Schema：使用 Builder，业务变更放入 Migration。
- 检查物理数据库对象：使用 [Schema Inspector](../schema-inspector/overview.md)。
- 更新补充 Metadata：使用 [Collection Metadata Service](../collection-metadata/collection-metadata-service.md)。
- 了解内部解析和缓存实现：[Collection 架构](../internals/collection/architecture.md)和 [Registry](../internals/collection/registry.md)。
