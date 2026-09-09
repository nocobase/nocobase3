---
title: 使用 Migration 实现业务 Schema 变更
description: Agent 创建或修改 Collection、字段、索引和约束时的文件落点、Builder 选择、回滚、测试与验证流程。
---

# 使用 Migration 实现业务 Schema 变更

持久化业务 Schema 变更默认写成 Migration。Migration 是数据库历史记录；不要把临时 `db.builder()` 调用放进应用启动流程。

## 实现流程

1. 检查目标业务包现有的 `database/migrations/` 和测试约定。
2. 确认现有 Migration 是否已经合并。已合并后只新增 Migration，不修改旧文件。
3. 创建按时间排序、全局唯一的名称，例如 `202609030001_create_orders`。
4. 在 `up()` 中用 `builder` 明确写出 Schema 变更；需要回填数据时用同一 Context 的 `query`。
5. 可逆时在 `down()` 中按安全依赖顺序反向操作；不可逆时显式声明 `irreversible: true`。
6. 添加 Migration 级集成测试，验证真实物理 Schema 和 Metadata。
7. 运行修改包的 lint、typecheck、test 和 build。

## 完整 Migration 形状

文件：`database/migrations/202609030001_create_orders.ts`

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609030001_create_orders',

  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.string('orderNo', { length: 64 }).notNull().unique();
      collection.string('status', { length: 32 }).notNull().defaultTo('draft');
      collection.datetime('createdAt').notNull();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('orders');
  },
});
```

`name` 必须和文件名主体一致。所有 Migration sources 中的名称全局唯一，`packageName` 不参与唯一性或排序。

## 选择 Context API

| 变更                                       | 使用                                 |
| ------------------------------------------ | ------------------------------------ |
| Collection、Field、Index、Constraint、View | `builder`                            |
| 数据回填、转换或清理                       | `query`                              |
| 判断数据库类型                             | `connection.dialect`                 |
| 判断数据库能力                             | `connection.capabilities`            |
| 高层 API 无法表达的方言能力                | 检查方言后使用 `connection.client()` |

Migration Context 顶层没有 `database`、`schema`、`client` 或 `dialect`。不要回到外层 Manager，否则会脱离当前 Migration 事务。

## 历史必须自包含

- 不导入或遍历实时 Collection Schema、Field 定义、Model 定义或注册表。
- 不把运行时初始化 helper 作为 Migration 的 Schema 来源。
- 每个字段、关系、索引和约束都在 Migration 中固定声明。
- `down()` 使用明确的反向操作，并按依赖安全顺序执行。
- 不使用硬编码的旧 checksum 让修改过的 Migration 看似兼容。

## 完成条件

- Migration 文件名与 `name` 一致。
- `up()` 在真实测试数据库成功执行。
- 可逆变更的 `down()` 已验证；不可逆变更已声明 `irreversible: true`。
- 测试检查了物理 Schema 和需要同步的 Metadata。
- 已运行修改包要求的 lint、typecheck、test 和 build。

继续阅读：[定义 Migration](../migration/define-migration.md)、[Builder 总览](../builder/overview.md)、[Migration 测试](../migration/testing.md)。
