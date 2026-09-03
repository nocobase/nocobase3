---
title: Query 编译与清除条件
description: 使用 compile 检查 SQL 和参数，复用不可变 Query Builder，并通过 clear 方法移除已有查询片段。
---

# compile 和 clear

`compile()` 用于把 Query 编译成 SQL 和参数，适合调试、dry-run、测试断言和 Agent 解释。

```ts
const compiled = db
  .query()
  .selectFrom('orders')
  .select(['id', 'orderNo'])
  .where('status', '=', 'paid')
  .compile();

compiled.sql;
compiled.parameters;
```

启用 `underscored` 时，`compile()` 输出归一化后的物理 identifier：

```text
orderNo -> order_no
createdAt -> created_at
```

## immutable builder

Query Builder 是 immutable 的。链式方法返回新的 query，不修改原对象。

```ts
const base = db.query().selectFrom('orders').where('tenantId', '=', tenantId);

const paid = base.where('status', '=', 'paid');
const draft = base.where('status', '=', 'draft');
```

`base` 不会因为创建了 `paid` 或 `draft` 被修改。

## clear 方法

`SelectQuery` 支持：

- `clearSelect()`
- `clearWhere()`
- `clearJoins()`
- `clearGroupBy()`
- `clearHaving()`
- `clearOrderBy()`
- `clearLimit()`
- `clearOffset()`

`UpdateQuery` 和 `DeleteQuery` 支持：

- `clearWhere()`

示例：

```ts
const base = db
  .query()
  .selectFrom('orders')
  .select('status')
  .where('status', '=', 'paid')
  .orderBy('createdAt')
  .limit(1);

const orderNos = await base
  .clearSelect()
  .select('orderNo')
  .clearWhere()
  .clearLimit()
  .pluck<string>('orderNo');
```

## portable pagination

`offset()` 要求同时存在 `orderBy()`，否则会抛错：

```ts
db.query().selectFrom('orders').offset(20).compile();

// Error: offset() requires orderBy() for portable pagination.
```

这是为了避免不同数据库在没有稳定排序时返回不一致分页结果。
