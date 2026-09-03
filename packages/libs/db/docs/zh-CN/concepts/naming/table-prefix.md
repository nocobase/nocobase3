---
title: tablePrefix 表前缀
description: 说明 tablePrefix 的名称生成顺序、Connection 默认值、Collection 覆盖、Query 输入和 Migration 边界。
---

# `tablePrefix` 表前缀

`tablePrefix` 给一个 Connection 管理的物理表、普通 View 和物化 View 添加前缀。它属于 `NamingOptions`，默认值为空字符串，不直接作用于列名或 Query Alias。

## 名称生成顺序

Builder 先按 `underscored` 归一化 Collection 逻辑名，再在结果前拼接 `tablePrefix`：

```text
effectiveNaming = merge(connection.naming, collection.naming)
normalizedName = effectiveNaming.underscored ? snake_case(name) : name
physicalTable = effectiveNaming.tablePrefix + normalizedName
```

例如：

```ts
naming: {
  underscored: true,
  tablePrefix: 'app_',
}
```

会把 `orderItems` 映射为 `app_order_items`。前缀按原样拼接，系统不会自动补 `_`；配置 `app` 会得到 `apporder_items`。

## Connection 默认前缀

通常在 Connection 上设置统一前缀：

```ts
const db = createDatabaseManager({
  connections: {
    main: {
      dialect: 'postgres',
      naming: { tablePrefix: 'app_' },
    },
  },
});
```

Connection 名不会自动成为表前缀。只有显式设置的 `naming.tablePrefix` 才参与名称生成。

## Collection 局部覆盖

Collection 可以覆盖 Connection 默认值：

```ts
await db.builder().createCollection('auditLogs', (collection) => {
  collection.naming({ tablePrefix: 'archive_' });
  collection.increments('id');
});
```

如果 Connection 使用 `app_`，该 Collection 的物理表仍然是 `archive_audit_logs`。使用 `tablePrefix: ''` 可以显式清除继承的前缀。

跨 Collection 的 Relation、Foreign Key 和结构化 View 会分别解析各目标 Collection 的 effective naming。

## Query 输入

`connection.query` 会自动应用 Connection 的 `tablePrefix`。表来源参数必须使用不带前缀的 Connection 相对标识符：

```ts
await db.query().selectFrom('orderItems').selectAll().execute();
```

在 `tablePrefix: 'app_'` 时查询 `app_order_items`。不要传入 `app_order_items`，否则 Query 会把它作为相对标识符再次添加前缀。

Query 不读取 Collection 局部覆盖。需要定位这类 Collection 的物理对象时，先通过 `connection.collections` 解析；必须操作完整物理名称时使用 `connection.client()`。具体表来源、Join、Alias 和子查询规则见 [Query 命名归一化](../../query/naming.md)。

## 原始 SQL

底层 client 和原始 SQL 不执行 naming 转换，调用者必须使用完整物理名称。进入这个边界意味着代码与当前数据库 Adapter 和方言耦合。

## 修改已有前缀

Collection 创建后修改 `tablePrefix`，等同于修改物理表或 View 名称。生产环境必须通过显式 Migration 同步处理：

- Foreign Key 和 Relation；
- Index 和 Constraint；
- 普通 View、物化 View 和 Raw SQL View；
- 触发器等其他数据库依赖对象；
- Collection Metadata。

如果依赖不能安全、原子地更新，应拒绝变更，而不是只修改配置。

## 使用规则

- Builder、Relation 和结构化 View 中使用逻辑 Collection 名，不手写前缀。
- Query 表来源使用不带 Connection 前缀的相对标识符。
- 不要把 Connection 名当作隐式前缀。
- 不要通过 `tableName` 模拟前缀。
- 原始 SQL 和底层 client 使用完整物理名称。
- 修改已存在 Collection 的前缀前先编写并审查 Migration。

## 继续阅读

- [命名概念](./overview.md)
- [`underscored` 命名规则](./underscored.md)
- [Builder 命名](../../builder/naming.md)
- [Query 命名归一化](../../query/naming.md)
