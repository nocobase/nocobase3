---
title: 批量应用结构化操作
description: 使用 builder.apply 执行 Operation DSL，进行批量变更、dry-run、SQL 预览和影响审计。
---

# 批量应用结构化操作

`builder.apply()` 接收 `CollectionOperation[]`，是 Collection Builder 的执行计划层。需要在调用点之外组合或传递计划时，从 `@nocobase/db` 根入口导入这个类型。

对 file sync、snapshot diff、批量 apply 和审计场景来说，Operation DSL 是最稳定的变更表达：结构化、可解释、可 dry-run。

## 基本用法

```ts
import type { CollectionOperation } from '@nocobase/db';

const operations = [
  {
    type: 'createCollection',
    name: 'orders',
    definition: {
      fields: [
        { name: 'id', type: 'increments', primaryKey: true },
        { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
      ],
    },
  },
] satisfies CollectionOperation[];

await builder.apply(operations);
```

## dryRun 和 previewSql

```ts
const result = await builder.apply(operations, {
  dryRun: true,
  previewSql: true,
});

console.log(result.operations);
console.log(result.schemaOperations);
console.log(result.sql);
console.log(result.impact);
```

`dryRun: true` 不执行数据库结构变更。

`previewSql: true` 会尝试返回底层 SQL，前提是 adapter 支持 SQL 编译。

## 选择 operation

| 目标                                | `type`                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------- |
| 创建、修改、删除或重命名 Collection | `createCollection`、`alterCollection`、`dropCollection`、`renameCollection` |
| 创建或替换 View                     | `createViewCollection`、`replaceViewCollection`                             |
| 创建或刷新 Materialized View        | `createMaterializedViewCollection`、`refreshMaterializedViewCollection`     |
| 新增、修改或删除 Field              | `addField`、`alterField`、`dropField`                                       |
| 新增或删除 Index                    | `addIndex`、`dropIndex`                                                     |
| 新增或删除 Constraint               | `addConstraint`、`dropConstraint`                                           |

Payload 字段和联合类型以公开的 `CollectionOperation` 声明为准。选择依据和特殊边界见[Builder 结构化执行计划](../reference/collection-operation.md)。

## destructive 操作

当前 `dropField` 和 `dropCollection` 会产生 destructive impact：

```ts
[
  {
    level: 'destructive',
    operation: 'dropField',
    message: 'Dropping field users.name may remove existing data.',
  },
];
```

## 使用注意事项

- 输出执行计划、diff 结果或批量 apply payload 时，优先使用结构化 operation 数组。
- destructive 操作必须先 dry-run。
- file sync 场景应先生成 snapshot + diff，再转换成 operation，再调用 `apply()`。
- 纯 Metadata 更新不属于 Schema 执行计划，使用 `connection.collectionMetadata`。
- `renameCollection` 当前只支持 Table Collection，并总是同步重命名物理表和 Metadata；View、Materialized View 或存在无法原子更新的依赖时会在 DDL 前拒绝。
