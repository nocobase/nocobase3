---
title: Collection 解析生命周期
description: 说明主数据库和外部数据库的 Schema 如何与补充 Metadata 合并，以及完整 Collection 如何缓存和失效。
---

# Collection 解析生命周期

> `SchemaInspector`、`CollectionResolver`、`CollectionRegistry`、`connection.collections` 以及
> 配置 V1 文档 Store 时的 Builder 集成已经实现。旧完整定义 Store 兼容路径仍待最终移除。

完整 Collection 由物理事实和补充 Metadata 共同派生：

```text
Physical Schema + Collection Metadata
  -> Collection Resolver
  -> Complete CollectionDefinition
  -> Collection Registry
```

## 主数据库

主数据库以 Migration 作为物理 Schema 变更的权威来源：

```text
Migration
  -> Collection Builder
  -> Physical Schema
  -> Supplemental Metadata
  -> Collection Resolver
  -> Collection Registry
```

Builder 执行物理 Schema 操作，并仅将补充部分写入 Metadata Store。它不会把执行后的物理 Schema
再复制一份到 Store 中作为第二个权威来源。

例如：

```ts
await builder.createCollection('orders', (collection) => {
  collection.title('Orders');
  collection.string('orderNo').notNullable().title('Order number');
});
```

`string()` 和 `notNullable()` 编译为物理 Schema。持久化文档只包含：

```ts
{
  version: 1,
  name: 'orders',
  title: 'Orders',
  fields: {
    orderNo: {
      title: 'Order number',
    },
  },
}
```

如果 Collection 没有补充 Metadata，并且逻辑名称可以完全推导，Store 无需仅为了重复表示它的存在而保存
空文档。

Builder 在编译 alter/drop 等操作时通过 `connection.collections` 读取 Inspector 与 Metadata 合并后的完整
定义。DDL 成功后，它按受影响的逻辑 Collection 精确失效 Registry。字段 title/description 和 relation
进入补充文档；type、nullable、default、index 和 constraint 等物理事实不会复制进 Store。删除物理字段时，
同名 field/relation Metadata 也会清除。

## 外部数据库

外部 Schema 不属于 NocoBase Migration 的管理范围：

```text
External Physical Schema
  -> Schema Inspector
  -> Inferred Logical Schema
  + Module/File Metadata Store
  -> Collection Resolver
  -> Collection Registry
```

Introspection 可以推导有明确外键支持的 relation。仅基于命名规则推测的 relation 应先作为候选，直到工具、
Agent 或开发者确认后再写入补充 Metadata。修改外部 Metadata 永远不能修改外部数据库的物理 Schema。

## 解析规则

各类信息的职责保持明确：

```text
物理结构    Schema Inspector
应用语义    Metadata Store
完整模型    Collection Resolver
```

Metadata 不能将物理 `varchar` 列改成 integer，也不能修改物理可空性。Resolver 应执行以下校验：

- 已存在物理 Field 的 Metadata 与该 Field 合并；
- 普通 `fields` 项如果找不到物理 Field，应报告 Schema drift；
- relation 引用的本地 key 不存在时应报校验错误；
- 单个 Collection 解析只校验 relation 的本地 key；target、target key 和 through Collection 由显式的
  `CollectionRelationValidator` 图校验处理；
- fields 和 relations 中的重复名称必须拒绝；
- introspection 遇到无法唯一确定的反向命名时应报告问题，不能猜测。

## Connection Collections API

应用和 Agent 通过 Connection 读取解析后的 Collection：

```ts
const orders = await db.connection().collections.get('orders');
const externalOrders = await db
  .connection('external')
  .collections.get('orders');
```

`get(name)` 惰性 introspect 并解析一个 Collection。`list()` 必须分页，并且只返回轻量摘要；它不能隐式解析
大型数据库中的所有表。全量 introspection 应使用显式的 `scan()` 或 `export()` 操作。

第一版不增加重复的 `db.collections()` 快捷方式。

## Registry 失效

`CollectionRegistry` 在内存中缓存完整的解析结果。遇到以下情况时应使缓存失效：

- Builder 成功修改 Schema；
- Metadata Service 成功写入；
- 完成一批 Migration；
- Module 或 File Metadata 重载；
- 检测到物理 Schema drift。

可能时应只使当前 Collection 失效。Relation 变更可能还需要使相关 target Collection 失效。循环 relation
通过分阶段图校验处理，普通 `get()` 不递归等待完整关系图。

## Agent Snapshot

完整的解析后 Collection 可以导出为供 Agent 使用的文件：

```text
.collection-cache/
└── external/
    └── orders.collection.json
```

该 Snapshot 是可生成、可丢弃和可重建的派生产物。它不是 Metadata Store 的输入，也不是新的权威来源。

## Rename 与原子性

Rename 可能同时影响物理表或 View、Metadata、relation target、Registry 项和 Snapshot。如果无法原子协调这些变更，
第一版必须在执行 DDL 之前拒绝 rename。

Store 层的 `delete(old) + put(new)` 不是原子 Collection rename。完整操作由
`CollectionBuilder.renameCollection()` 协调。只有当当前数据库方言支持将物理 Schema 操作和所有 Metadata
变更放在同一原子事务中时，Database Store 事务才足够安全。Module 和 File Metadata 的 rename 是源码或
文件变更，不由运行时 Builder 执行。

已保存 Metadata 与确定性命名规则冲突时，启动或升级校验必须输出准确差异并停止。系统不能自动 rename
生产数据库对象，也不能静默重写 Metadata。

## 建议实现顺序

设计确认后按以下依赖顺序实现，避免让下层反向依赖上层：

1. 定义 Physical Schema 类型、Metadata 文档类型和各公共错误类型。
2. 实现 `SchemaInspector` 的 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server 方言读取与集成测试。
3. 实现 `CollectionResolver` 和本地结构校验。
4. 实现 Metadata Store 新文档接口、In-memory Store 和 Naming Index。
5. 实现 `CollectionRegistry` 与 `connection.collections`。
6. 实现 `CollectionMetadataService` 和跨 Collection relation 图校验。
7. 接入 Builder、Migration、transaction 和 Metadata 写入后的自动 Registry 失效（已完成）。
8. 实现 Database Store、Module Store、Schema Snapshot 和 Agent Snapshot。
9. 所有消费端迁移完成后移除旧的完整 `CollectionDefinition` Store API。

每一阶段都必须保留当前 API 的兼容测试，不能在解析链路尚未可用时提前移除 Builder 依赖的旧 Store。

## 相关文档

- [Collection 架构](./architecture.md)
- [Schema Inspector 设计](./schema-inspector.md)
- [Collection Resolver 设计](./collection-resolver.md)
- [Collection Registry 设计](./collection-registry.md)
- [Metadata Store 设计](./metadata-store.md)
- [Metadata Store 后端](./metadata-store-backends.md)
- [Collection Metadata Service 设计](./metadata-service.md)
