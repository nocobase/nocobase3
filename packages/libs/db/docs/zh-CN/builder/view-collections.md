---
title: 创建与维护 View Collection
description: 使用结构化查询创建、替换和刷新普通视图或物化视图，并处理命名与方言能力差异。
---

# View Collection

View Collection 用于把数据库视图映射成可解析的 Collection。优先使用结构化 View DSL；只有 DSL 无法表达且目标方言明确时才传入 Raw SQL。

| 任务               | API                                   |
| ------------------ | ------------------------------------- |
| 创建普通 View      | `createViewCollection()`              |
| 替换普通 View 定义 | `replaceViewCollection()`             |
| 创建物化 View      | `createMaterializedViewCollection()`  |
| 刷新物化 View      | `refreshMaterializedViewCollection()` |

## 创建结构化 View

```ts
await builder.createViewCollection('adultUsers', (view) => {
  view.string('firstName');
  view.as((query) =>
    query.from('users').select('firstName').where('age', '>', 18),
  );
});
```

推荐优先使用结构化 `view.as(...)`，因为它会按照源 Collection 自己的 effective naming，把逻辑 Collection 和 Field 名编译为确定的物理名称。

当前结构化 View Query DSL 提供 `from()`、`select()` 和 `where()`，适合简单、可移植的单源 View。它不是完整的 `QueryAdapter`；需要 Join、复杂表达式或方言语法时，先判断是否应该使用显式 Migration 和 Raw SQL。

## 替换 View 定义

```ts
await builder.replaceViewCollection('adultUsers', (view) => {
  view.string('firstName');
  view.as((query) =>
    query.from('users').select('firstName').where('age', '>', 16),
  );
});
```

## 仅在必要时使用 Raw SQL

```ts
await builder.createViewCollection('adultUsers', (view) => {
  view.string('firstName');
  view.asRaw('select first_name from users where age > ?', [18]);
});
```

`asRaw` 是方言敏感的。只有在结构化 view query DSL 无法表达时才使用。

## 创建和刷新物化视图

```ts
await builder.createMaterializedViewCollection('adultUsers', (view) => {
  view.string('firstName');
  view.as((query) =>
    query.from('users').select('firstName').where('age', '>', 18),
  );
});

await builder.refreshMaterializedViewCollection('adultUsers');
```

SQLite 和 MySQL 不支持 PostgreSQL 风格的 materialized view。当前真实数据库集成测试只覆盖普通 view。

## 使用注意事项

- 优先使用结构化 `view.as(...)`。
- 使用 `asRaw` 前必须明确目标数据库方言。
- 不要假设所有数据库支持 materialized view。
- `kind: 'view'` 或 `kind: 'materializedView'` 只描述数据库对象类型；Collection definition 不保存
  `writable`。记录 mutation 能力由数据库和上层权限控制。
- `view.as(...)` 引用已有 Collection 时，会使用目标 Collection 自己的 effective naming。
- Raw SQL View 无法可靠分析依赖，因此当前会保守阻止其他 Collection rename。
- `renameCollection()` 当前不支持 View 或 Materialized View Collection，并会在 DDL 前抛出 `COLLECTION_RENAME_UNSUPPORTED_KIND`。
- 执行前根据[命名与跨数据库兼容](./portability.md)检查目标 Connection 的 View 能力和 warnings。
