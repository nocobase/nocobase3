---
title: connection.collections：读取完整 Collection
description: 按逻辑名称读取、列举、扫描、刷新和校验由物理 Schema 与补充 Metadata 解析出的 Collection。
---

# `connection.collections`：读取完整 Collection

把物理数据库 Schema 与补充 Metadata 解析成完整的 `CollectionDefinition`。只读取，不执行 DDL。

```text
Physical Schema
  + Collection Metadata
  + Connection naming
  = CollectionDefinition
```

| 项目             | 内容                         |
| ---------------- | ---------------------------- |
| 输入名称         | Collection 逻辑名称          |
| Metadata-aware   | 是                           |
| 执行 DDL         | 否                           |
| 缓存             | 是，可手动失效或刷新         |
| 物理 Schema 来源 | `connection.schemaInspector` |

## 读取一个 Collection

```ts
const orders = await connection.collections.get('orders');
```

Migration 的 context、`transaction()` 回调和测试 setup 都已经持有 `connection`，直接用它。从 Manager 起手时用 `db.collections(name?)`，它返回的就是 `db.connection(name).collections` 这同一个对象：

```ts
const orders = await db.collections().get('orders');
const events = await db.collections('analytics').get('events');
```

返回 `CollectionDefinition | undefined`。物理表不存在时返回 `undefined`，即使 Metadata Store 里存有同名文档——物理 Schema 是 Collection 是否存在的唯一依据，Metadata 只能补充已存在的对象。

返回值是一份深拷贝。修改它不会影响缓存，也不会写回数据库：改结构用 Builder，改补充信息用 Metadata Service。

Collection reads require the logical name. If an input resolves to a table owned by a different logical Collection, the read fails with `COLLECTION_NAME_CONFLICT` and identifies the expected name instead of returning fields without their metadata. Explicit logical names containing underscores remain valid; tables without metadata can still be read by their inferred logical names.

### 三个读取入口

同一次解析的三种深度，输入都是逻辑名称：

| API                   | 返回                                   | 何时用                     |
| --------------------- | -------------------------------------- | -------------------------- |
| `get(name)`           | `CollectionDefinition`                 | 默认                       |
| `getResolution(name)` | `{ collection, inspection, warnings }` | 需要物理检查明细或解析警告 |
| `getPhysical(name)`   | `PhysicalCollectionSchema`             | 只需要物理 Schema          |

`get()` 就是 `getResolution()?.collection`，两者没有额外开销差别。已经持有物理表名时改用 `connection.schemaInspector.getPhysicalCollection()`。

## 列举和扫描

```ts
const page = await connection.collections.list({ limit: 50 });
```

`list()` 返回轻量分页摘要（名称、表名、kind、title），不解析字段。需要完整 Collection 时用 `scan()`：

```ts
for await (const collection of connection.collections.scan({ pageSize: 50 })) {
  // use the resolved CollectionDefinition
}
```

## 缓存和校验

| API                        | 用途                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `invalidate(name?)`        | 清除一个或全部解析缓存，不立即读取                          |
| `refresh(name)`            | 清除一个缓存并立即重新解析，返回新的 `CollectionDefinition` |
| `validateRelations(name?)` | 校验一个可达关系图或全部 Collection relation                |

`refresh(name)` 等价于 `invalidate(name)` 加 `get(name)`，不需要再调用一次 `get()`。

Builder、Migration 和 Metadata Service 在成功更新后会自动失效相关缓存。只有调用者掌握外部变化时才需要手动 `invalidate()` 或 `refresh()`。

`collections` 是连接级的解析句柄，整条连接上的 Builder、Repository 和 Migration 共享同一份缓存。无论从 `db.collections()` 还是 `connection.collections` 调用，`invalidate()` 和 `refresh()` 影响的都是所有持有该连接的代码，而不是调用方自己的局部状态。

## 与其他入口的区别

- 修改 Schema：使用 Builder，业务变更放入 Migration。
- 检查物理数据库对象：使用 [Schema Inspector](../schema-inspector/overview.md)。
- 更新补充 Metadata：使用 [Collection Metadata Service](../collection-metadata/collection-metadata-service.md)。
- 了解内部解析和缓存实现：[Collection 架构](../internals/collection/architecture.md)和 [Registry](../internals/collection/registry.md)。
