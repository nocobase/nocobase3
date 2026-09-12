---
title: Builder 执行与审计
description: 使用 Operation DSL、dry-run、SQL 预览和 BuilderResult 安全执行或审计 Schema 变更。
---

# Builder 执行与审计

普通 Migration 可以直接调用 Fluent Builder。只有当变更需要在调用点之外保存、组合、传输或审计时，才使用 `CollectionOperation[]` 和 `builder.apply()`。

## 何时使用执行计划

| 场景                                       | 推荐方式                |
| ------------------------------------------ | ----------------------- |
| 手写 TypeScript Migration                  | 直接调用 Fluent Builder |
| HTTP、CLI 或配置载荷                       | Object DSL              |
| file sync、snapshot diff、批量 apply、审计 | Operation DSL           |

不要为了统一形式，把简单的 Migration 包成 Operation 数组。

## 定义可复用计划

`CollectionOperation` 从 `@nocobase/db` 根入口导出。用 `satisfies` 保留字面量推断，同时校验整个计划：

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
```

Operation 的精确联合类型、payload 字段和未来增量以 Types 为准，不要从源码深路径导入，也不要在文档中复制一套类型定义。

## 先预览，再执行

```ts
const preview = await builder.apply(operations, {
  dryRun: true,
  previewSql: true,
});

console.log(preview.operations);
console.log(preview.schemaOperations);
console.log(preview.warnings);
console.log(preview.impact);
console.log(preview.sql);
```

`dryRun` 不修改 Schema。`previewSql` 会在 Adapter 支持编译时返回 SQL，但 SQL 预览不能代替结构化的 warnings 和 impact 检查。

确认计划和授权后，再调用：

```ts
await builder.apply(operations, { strict: true });
```

`strict: true` 用于拒绝 capability warning，不等于用户已经授权 destructive 操作。

## 执行选项

| 目的               | 选项                  | 关键边界                                         |
| ------------------ | --------------------- | ------------------------------------------------ |
| 只编译、不执行     | `dryRun`              | 不修改 Schema，也不同步 Metadata                 |
| 查看 SQL           | `previewSql`          | Adapter 支持时返回，通常配合 dry-run             |
| 跳过 Metadata 同步 | `syncMetadata: false` | 保留 DDL，不写补充 Metadata                      |
| 已存在时跳过创建   | `ifNotExists`         | 不会把已有 Schema 自动对齐到定义                 |
| 不存在时跳过删除   | `ifExists`            | 只处理对象不存在，不改变其他行为                 |
| 拒绝能力降级       | `strict`              | 拒绝 capability warning，不确认 destructive 操作 |
| Builder 管理事务   | `transaction`         | 当前只是预留字段，没有执行语义                   |

Migration 事务由 Migrator 提供。其他场景需要事务时，使用 `db.transaction()` 或 `connection.transaction()` 获得事务 Connection，再使用该 Connection 的 Builder。

## 读取 BuilderResult

| 字段               | 用途                             |
| ------------------ | -------------------------------- |
| `operations`       | 审计原始逻辑计划                 |
| `schemaOperations` | 查看实际准备执行的数据库操作     |
| `warnings`         | 判断能力降级、跳过和 unsafe 风险 |
| `impact`           | 判断是否包含 destructive 影响    |
| `sql`              | 展示或记录可用的 SQL 预览        |
| `metadata`         | 预留摘要，当前不会填充           |

精确字段类型见 [`BuilderResult`](../reference/builder-result.md)，选项组合见 [Builder 执行选项](../reference/builder-options.md)。

不要依赖当前的 `metadata` 判断补充 Metadata 是否已经修改。需要读取最终状态时，通过 `connection.collectionMetadata` 或 `connection.collections` 查询。

## destructive 和自动化边界

`dropField`、`dropCollection` 等操作可能删除数据。面向 Agent、CLI 或自动化系统时，建议在 Builder 外再加一层受限执行界面：

- operation 使用白名单；
- dry-run 与真实执行分成两个阶段；
- 展示 `warnings`、`impact` 和目标 Connection；
- destructive 操作要求调用方显式确认；
- unsafe warning 默认拒绝，除非任务明确接受降级；
- 记录最终执行的逻辑计划和结果。

## Metadata 不属于 Operation 计划

Operation DSL 表达 Schema 计划。Builder 可以在 Schema 成功后同步定义中可提取的补充 Metadata，但纯 `title`、`description` 或 Relation Metadata 更新应使用 `connection.collectionMetadata`，不要伪造成 Schema operation。

Collection rename 会同时处理物理对象和 Metadata，并在依赖无法原子更新时拒绝；具体行为见[在 Migration 中管理 Collection Schema](./collection-schema.md)。
