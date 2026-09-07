---
title: Builder 结构化执行计划
description: 按变更目标选择 builder.apply() 的 Operation DSL，并说明 Fluent DSL、dry-run 和 Metadata 的边界。
---

# Builder 结构化执行计划

`builder.apply()` 接收 `CollectionOperation[]` 结构化执行计划，适合 file sync、snapshot diff、批量 apply、审计和跨进程传输。`CollectionOperation` 从 `@nocobase/db` 根入口导出；不要从源码深路径导入。

## 何时使用 Operation DSL

| 产物                                   | 推荐表示      |
| -------------------------------------- | ------------- |
| TypeScript Migration、插件代码或测试   | Fluent DSL    |
| HTTP、CLI 或 `collection.json` payload | Object DSL    |
| diff、执行计划或批量 apply payload     | Operation DSL |

不要为了统一形式，把普通 Migration 强行转换成手写 Operation 数组。

## 按目标选择 operation

| 目标                                | operation                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------- |
| 创建、修改、删除或重命名 Collection | `createCollection`、`alterCollection`、`dropCollection`、`renameCollection` |
| 创建或替换 View                     | `createViewCollection`、`replaceViewCollection`                             |
| 创建或刷新 Materialized View        | `createMaterializedViewCollection`、`refreshMaterializedViewCollection`     |
| 新增、修改或删除 Field              | `addField`、`alterField`、`dropField`                                       |
| 新增或删除 Index                    | `addIndex`、`dropIndex`                                                     |
| 新增或删除 Constraint               | `addConstraint`、`dropConstraint`                                           |

每个 operation 使用 Collection 和 Field 逻辑名。

## 批量执行

```ts
import type { CollectionOperation } from '@nocobase/db';

const operations = [
  {
    type: 'createCollection',
    name: 'orders',
    definition: {
      fields: [{ name: 'id', type: 'increments', primaryKey: true }],
    },
  },
] satisfies CollectionOperation[];

const preview = await db.builder().apply(operations, {
  dryRun: true,
  previewSql: true,
});
```

执行前检查 `preview.warnings` 和 `preview.impact`。涉及删除或其他 destructive operation 时，dry-run 不是授权机制；调用方仍需建立明确的确认策略。

## 特殊边界

- `renameCollection` 当前只支持 Table Collection，并按确定性 naming 同步重命名物理表和 Metadata。
- 存在无法原子更新的 Relation、Foreign Key 或 View 依赖时，rename 会在 DDL 前拒绝。
- `dropCollection` 和 `dropField` 可能删除数据，应作为 destructive 操作处理。
- View 原始 SQL 和方言能力限制见 [View Collection](../builder/view-collections.md)。

## Metadata 不属于执行计划

Operation DSL 表达 Schema 计划。Builder 可以在 Schema 成功后同步可提取的补充 Metadata，但纯 `title`、`description` 或 Relation Metadata 更新应使用 `connection.collectionMetadata`，不要伪造成 Schema operation。

更多执行和审计示例见 [Builder 执行与审计](../builder/execution.md)。
