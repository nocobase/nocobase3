---
title: Collection 概念
description: 区分 Collection、数据库物理对象、补充 Metadata 和记录查询，并给出当前公开 API 的选择规则。
---

# Collection 概念

Collection 是应用层的数据模型描述，不是数据库表的别名。一个 Collection 可以对应数据库表、普通视图或物化视图，并在物理 Schema 之外补充标题、描述和应用 Relation 等语义。

## 三层模型

```text
Physical Schema                  table、column、type、constraint、index、view
  + Supplemental Metadata       title、description、应用 Relation、局部 naming
  = CollectionDefinition        业务代码读取的完整 Collection
```

这三层由不同入口负责：

| 目标                        | 当前入口                        | 是否修改数据库结构 |
| --------------------------- | ------------------------------- | ------------------ |
| 创建或修改 Collection       | `connection.builder`            | 是                 |
| 检查物理数据库对象          | `connection.schemaInspector`    | 否                 |
| 读取解析后的完整 Collection | `connection.collections`        | 否                 |
| 更新补充 Metadata           | `connection.collectionMetadata` | 否                 |
| 查询或修改记录              | `connection.query`              | 否                 |

## CollectionDefinition

Builder 接受 Collection 定义并创建相应的物理对象：

```ts
await connection.builder.createCollection('orders', {
  title: 'Orders',
  fields: [
    { name: 'id', type: 'increments', primaryKey: true },
    { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
  ],
  indexes: [{ fields: ['amount'] }],
});
```

其中 `orders`、`id` 和 `amount` 是逻辑名称。Builder 根据 naming 配置确定物理表名和列名。完整定义结构见 [CollectionDefinition 参考](../reference/collection-definition.md)，物理命名规则见 [命名概念](./naming/overview.md)。

## 物理对象类型

`CollectionDefinition.kind` 表示底层对象类型：

| `kind`             | 物理对象 | 常规记录写入           |
| ------------------ | -------- | ---------------------- |
| `table`            | 表       | 由数据库权限和约束决定 |
| `view`             | 普通视图 | 不应默认假设可写       |
| `materializedView` | 物化视图 | 不应默认假设可写       |

`kind` 只描述物理对象类型，不是权限模型。Agent 不得因为一个 Collection 能被读取，就推断它一定支持 Insert、Update 或 Delete。

## 应用语义与数据库事实

`title`、`description` 和应用 Relation 属于补充 Metadata。数据库 comment、列类型、Nullability、默认值、Index 和 Constraint 属于物理数据库事实。

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

`title` 和 `db.comment` 服务于不同层级，不能互相替代。详细边界见 [Metadata 概念](./metadata.md)。

## 现有数据库

`connection.collections.get()` 和 `scan()` 可以把已存在的物理 Schema 与补充 Metadata 解析成运行时 `CollectionDefinition`。它们不会生成或改写源码文件。

需要物理对象信息时使用 `connection.schemaInspector`；需要运行时完整 Collection 时使用 `connection.collections`。不要自行把 Inspector 返回结果拼成 Collection。

## 当前查询边界

`connection.query` 是数据库层查询接口，只使用 Connection naming，不读取 Collection Metadata 或 Collection 局部 naming。当前没有已实现的 Collection-aware Repository API；相关内容仅存在于 [Repository 提案](../proposals/repository/overview.md)。

## Agent 规则

- 不要把 Collection 直接等同于数据库表。
- Builder、Relation、Index 和 Constraint 中使用 Collection 与 Field 的逻辑名称。
- 持久化业务 Schema 变更写入 Migration，不要只在应用启动时调用 Builder。
- 只更新标题、描述或应用 Relation 时使用 `connection.collectionMetadata`，不要生成 DDL。
- 读取完整 Collection 时使用 `connection.collections`，不要绕过 Resolver 自行合并数据。
- 写记录查询时遵守 Query 的 Connection 级命名边界，不要假设它会读取 Collection Metadata。

## 继续阅读

- [Collections：读取完整 Collection](../collections/overview.md)
- [Collection Metadata 概览](../collection-metadata/overview.md)
- [Builder 概览](../builder/overview.md)
- [Query 概览](../query/overview.md)
