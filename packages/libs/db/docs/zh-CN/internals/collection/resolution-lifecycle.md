---
title: Collection 解析生命周期
description: 说明 connection.collections 从命名索引、Schema Inspector 和 Metadata Store 加载数据，到解析、缓存、失效与事务提交的当前流程。
---

# Collection 解析生命周期

`connection.collections` 按逻辑名称读取 Collection。一次未命中缓存的 `get(name)` 经过以下阶段：

```text
logical name
  -> CollectionNamingIndex resolves physical table name
  -> Schema Inspector reads PhysicalCollectionSchema
  -> Metadata Store reads the document and revision
  -> CollectionResolver validates and merges inputs
  -> Registry caches CollectionResolutionResult
  -> caller receives a clone
```

## 初始化与命名索引

Registry 首次使用时初始化 Metadata Store，并通过分页摘要建立 `CollectionNamingIndex`。索引合并 Connection 命名和每个文档的局部命名，用于：

- 从逻辑 Collection 名得到物理表名；
- 从物理表名反向得到逻辑名；
- 检测两个逻辑名映射到同一物理表；
- 为列表和扫描计算需要读取的物理表名前缀。

命名不能确定性反向映射时，Registry 报告 `COLLECTION_NAME_CONFLICT`，不会猜测名称。

## 单个读取

`get(name)` 返回解析后的 `CollectionDefinition | undefined`：

- 物理对象和 Metadata 都不存在：返回 `undefined`；
- Metadata 存在但物理对象不存在：报告 `COLLECTION_SCHEMA_DRIFT`；
- 物理对象存在：进入 Resolver；
- Resolver 发现不一致：抛出带稳定 issue code 和 path 的 `CollectionResolutionError`。

`getPhysical(name)` 使用同一逻辑名映射，但只返回物理结构。`getResolution(name)` 还返回 inspection completeness 和 warning，适合审计工具判断结果是否完整。

## 列表与扫描

`list()` 从 Inspector 获取轻量物理摘要，再补充 Metadata 中的标题和描述，不解析所有 Field。它会过滤 Database Metadata Store 使用的内部表。

`scan()` 逐个读取完整 Physical Schema 和 Metadata，解析后以 `AsyncIterable<CollectionDefinition>` 返回，避免一次把整个数据库放进内存。

## 缓存与并发

成功的解析结果按逻辑 Collection 名缓存。同一个名称的并发首次读取共享 in-flight Promise，避免重复 introspection。

失败、连接错误和不存在的 `undefined` 结果不会长期缓存。返回给调用方的对象经过复制，调用方修改它不会污染 Registry 中的结果。

## 失效

| 操作               | 行为                                           |
| ------------------ | ---------------------------------------------- |
| `invalidate(name)` | 清除指定 Collection 的 cache 和 in-flight load |
| `invalidate()`     | 清除全部解析缓存和 Naming Index                |
| `refresh(name)`    | 失效指定名称后立即重新解析                     |
| Metadata 命名变化  | 失效相关 Collection，并重建 Naming Index       |

Builder、Migration 和 Metadata Service 在成功修改后主动记录失效。外部系统直接改变数据库时，掌握该变化的调用方必须显式 `refresh()` 或 `invalidate()`。

## Relation 校验

Resolver 先校验单个 Collection 内能够确认的 relation 信息。`validateRelations(name?)` 再遍历一个可达关系图或全部 Collection，确认：

- target Collection 存在；
- sourceKey 和 targetKey 存在；
- `hasOne` / `hasMany` 的 foreign key 位于目标 Collection；
- `belongsToMany` 的 through Collection、foreignKey 和 otherKey 存在。

## 事务

事务 Connection 拥有独立 Registry。事务中的 Metadata 和 Schema 变更先使事务内缓存失效，并由 collector 记录需要传播的失效范围。

提交前会在事务视图中验证受影响的 relation。数据库事务和必要的 Metadata Store 回放成功后，collector 才把失效应用到父 Connection；失败或回滚不会发布父级失效。

## Rename 安全边界

Collection rename 会同时影响物理对象、Metadata 文档名、relation target、Naming Index 和 Registry cache。当前 Builder 在不能原子协调这些对象时，会在 DDL 之前拒绝 rename。不要绕过该保护手工组合一半 rename 操作。

## 相关文档

- [Collection 当前架构](./architecture.md)
- [Collection Resolver](./resolver.md)
- [Collection Registry](./registry.md)
- [`connection.collections`](../../collections/overview.md)
