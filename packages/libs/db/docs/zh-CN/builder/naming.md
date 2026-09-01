---
title: Builder 命名
description: 说明 Collection Builder 的 underscored 配置、表前缀覆盖和重命名安全边界。
---

# Builder 命名

Builder 接受逻辑 Collection 和 Field 名，并确定性地生成物理名称：

```text
normalized(name) = effectiveNaming.underscored ? snake_case(name) : name
物理表名 = effectiveNaming.tablePrefix + normalized(collectionName)
物理列名 = normalized(fieldName)
```

`effectiveNaming` 合并 Connection 和 Collection 的 `naming`。`underscored` 默认是 `true`，`tablePrefix` 默认是空字符串。

## Connection 默认前缀

```ts
const db = createDatabaseManager({
  connections: {
    main: {
      dialect: 'postgres',
      naming: { underscored: true, tablePrefix: 'tbl_' },
    },
  },
});
```

`orderItems.createdAt` 会编译为 `tbl_order_items.created_at`。

## Collection 覆盖

```ts
await db.builder().createCollection('auditLogs', (collection) => {
  collection.naming({ underscored: false, tablePrefix: 'archive_' });
  collection.increments('id');
  collection.datetime('createdAt');
});
```

上面的物理表是 `archive_auditLogs`，物理列是 `createdAt`。Collection 传入 `tablePrefix: ''` 会清除 Connection 默认前缀；未提供的 naming 属性继续继承 Connection。

Collection DSL 不支持：

```text
tableName
columnName
mapToTable
mapToColumn
自定义 namingStrategy
```

不规则既有 Schema 应通过底层 Schema Migration 或 introspection 处理，不能写成 Collection Metadata 映射。

## 引用统一使用逻辑名

以下参数都写 Collection 或 Field 的逻辑 `name`：

- Builder 方法的 Collection 名；
- Index 和 Constraint 的 `fields`；
- Foreign Key 的 `references.collection`、`references.fields`；
- Relation 的 `target`、`through`、`foreignKey`、`sourceKey`、`targetKey`、`otherKey`；
- 结构化 View 的 `from`、`select`、`filter`。

```ts
await db.builder().createCollection('orders', (collection) => {
  collection.string('orderNo');
  collection.index(['orderNo']);
  collection.belongsTo('createdBy', 'users').foreignKey('createdById');
});
```

物理列分别是 `order_no` 和 `created_by_id`。

## 跨 Collection naming

Foreign Key、Relation 和结构化 View 引用目标 Collection 时，会解析目标 Collection 自己的前缀。例如当前 Collection 使用 `app_`，目标 `users` 使用 `auth_`，外键会引用 `auth_users`。

## 自动生成的名称

未显式命名的 Index 和 Foreign Key 使用最终物理名称生成：

```text
idx_<table>_<columns>
fk_<table>_<columns>_<targetTable>
```

长名称会截断并追加稳定哈希。重要生产 Migration 仍建议显式设置 Index 和 Constraint 的 `name`。

## renameCollection

```ts
await db.builder().renameCollection('orderItems', 'archivedOrderItems');
```

此操作总是同时重命名：

```text
orderItems -> archivedOrderItems
order_items -> archived_order_items
```

若 Collection 使用 `archive_` 前缀，则物理名称从 `archive_order_items` 变为 `archive_archived_order_items`。API 不再接受 `renameTable` 或 `renameTableTo`。

Builder 会在 DDL 前检查所有 Metadata。Relation target/through、Foreign Key、结构化 View 或 Raw SQL View 等依赖存在且不能原子更新时，会抛出 `COLLECTION_RENAME_HAS_DEPENDENCIES`，数据库和 Metadata 均保持不变。

## 旧 Metadata

连接时会验证旧 `tableName`、`columnName` 和 `naming.underscored`。只有旧物理名称与确定性规则一致时才允许继续；不一致会抛出 `COLLECTION_NAMING_INCOMPATIBLE`，要求先提供显式 Migration。

## 与 Query 的边界

`db.query()` 使用 Connection 的 `underscored` 配置，但不读取 Collection Metadata，因此不知道 Collection 覆盖的 naming，也不会自动加表前缀。详见 [Query 命名归一化](../query/naming.md)。

## Agent 注意事项

- 始终生成逻辑 Collection 和 Field 名。
- 需要保留 camelCase 物理 identifier 时配置 `naming.underscored: false`。
- 需要不同表前缀时配置 `naming.tablePrefix`。
- 不要生成 `tableName`、`columnName` 或自定义 naming strategy。
- Relation、Index、Constraint 和结构化 View 中也使用逻辑名。
- Collection rename 有依赖时先处理依赖，不能绕过安全检查。
- 不要根据兼容性错误自动修改生产数据库。
