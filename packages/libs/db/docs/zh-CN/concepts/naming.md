---
title: 命名概念
description: 说明 Collection 与 Field 逻辑名称如何确定性地转换为数据库物理名称。
---

# 命名概念

Collection 和 Field 在应用代码、DSL、Metadata、Relation 与 View 中始终使用逻辑名称。Builder 在连接数据库时统一生成物理表名和物理列名。

## 确定性规则

```text
effectiveNaming = merge(connection.naming, collection.naming)
normalized(name) = effectiveNaming.underscored ? snake_case(name) : name
物理表名 = effectiveNaming.tablePrefix + normalized(collectionName)
物理列名 = normalized(fieldName)
```

例如：

```text
orderItems.createdAt -> order_items.created_at
```

`underscored` 默认是 `true`。Connection 提供默认命名配置，Collection 可以局部覆盖。Collection DSL 不支持自定义 `tableName`、`columnName` 或 `namingStrategy`。

完整的转换算法、Connection/Builder/Query 行为矩阵和 Migration 要求见 [underscored 命名规则](./underscored.md)。

## tablePrefix

Connection 可以设置默认前缀：

```ts
const db = createDatabaseManager({
  connections: {
    main: {
      dialect: 'postgres',
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    },
  },
});
```

此时：

```text
orderItems.createdAt -> tbl_order_items.created_at
```

Collection 可以覆盖 Connection 的 `underscored` 和 `tablePrefix`：

```ts
await db.builder().createCollection('auditLogs', (collection) => {
  collection.naming({ underscored: false, tablePrefix: 'archive_' });
  collection.datetime('createdAt');
});
```

对应 `archive_auditLogs.createdAt`。使用 `tablePrefix: ''` 可以显式清除 Connection 前缀。前缀只作用于表、普通 View 和物化 View，不作用于列。

## 逻辑引用

以下位置都使用逻辑名称：

- Collection 和 Field 的 `name`；
- Index、Constraint 的字段；
- Relation 的 `target`、`through`、`foreignKey`、`sourceKey`、`targetKey`、`otherKey`；
- 结构化 View 的 `from`、`select` 和 `filter`。

跨 Collection 引用会使用目标 Collection 自己的 effective naming，而不是复用当前 Collection 的前缀。

## Builder 和 Query 的边界

`db.builder()` 读取 Collection Metadata，可以解析每个 Collection 的 `tablePrefix`。`db.query()` 是底层数据库 Query 接口，不读取 Collection Metadata：

- 它使用 Connection 的 `underscored` 选项归一化 identifier；
- 它不会自动应用 Connection 或 Collection 的 `tablePrefix`；
- 查询带前缀的物理表时，需要显式写出前缀。

例如物理表是 `tbl_order_items`，Query 应写 `tblOrderItems` 或 `tbl_order_items`，不能只写 `orderItems`。

## 重命名和兼容性

`renameCollection(from, to)` 同步重命名逻辑 Collection、物理表和 Metadata。Collection 自己的 `tablePrefix` 在重命名后保持不变。

如果 Relation、Foreign Key 或 View 等依赖不能被原子更新，Builder 会在执行 DDL 前拒绝重命名。Raw SQL View 无法可靠分析，因此当前作为保守阻断项。

连接建立时会验证旧 Metadata 中的 `tableName` 和 `columnName`：

- 若旧物理名称与新规则完全一致，允许启动，并在下一次 Metadata 写入时清理旧字段；
- 若不一致，抛出 `COLLECTION_NAMING_INCOMPATIBLE`，列出旧名称和预期名称，不自动修改数据库。

## 继续阅读

- Builder 编译规则见 [Builder 命名](../builder/naming.md)。
- Query 结果 key 和 alias 规则见 [Query 命名归一化](../query/naming.md)。
- 迁移影响见 [Collection 物理名称简化影响分析](../collection/naming-simplification-impact.md)。
