---
title: Builder 执行选项
description: 根据预览、Metadata 同步、存在性处理、方言严格模式和事务需要选择 BuilderExecOptions。
---

# Builder 执行选项

`BuilderExecOptions` 控制一次 Builder 调用的执行方式。本文说明各选项的行为和组合方式；精确属性以 TypeScript 声明为准。

## 选择选项

| 目的                      | 选项                  | 当前行为                                        |
| ------------------------- | --------------------- | ----------------------------------------------- |
| 只编译、不修改数据库      | `dryRun`              | 不执行 Schema 变更，也不同步 Metadata           |
| 查看 adapter 生成的 SQL   | `previewSql`          | adapter 支持时返回 SQL，通常与 dry-run 一起使用 |
| 跳过 Metadata 同步        | `syncMetadata: false` | 保留 DDL，但不保存或更新补充 Metadata           |
| 对已存在对象跳过创建      | `ifNotExists`         | 仅对明确支持的创建操作生效                      |
| 对不存在对象跳过删除      | `ifExists`            | 仅对明确支持的删除操作生效                      |
| 阻止能力降级              | `strict`              | 真实执行遇到 capability warning 时抛错          |
| 请求 Builder 自动管理事务 | `transaction`         | 预留字段，当前没有执行语义                      |

## 先预览变更

```ts
const result = await builder.apply(operations, {
  dryRun: true,
  previewSql: true,
  strict: true,
});

console.log(result.operations, result.sql, result.warnings, result.impact);
```

dry-run 优先返回 warning，即使同时启用了 `strict`，也不会因为 capability warning 直接抛错。这允许 CLI、UI 或自动化工具先展示计划和风险。

`previewSql` 依赖当前 Schema Adapter 的编译能力；没有 `sql` 不表示计划无效。SQL 只用于诊断和预览，不是跨数据库的 canonical source。

## 控制 Metadata 同步

Builder 默认同步从 Collection 定义中提取出的补充 Metadata。设置 `syncMetadata: false` 会跳过文档写入，但 DDL 成功后仍使旧的 Collection 解析缓存失效。

物理 Field、Index 和 Constraint 不会因为默认同步而复制进 Metadata Store。纯 Metadata 更新使用 `connection.collectionMetadata`。

## 谨慎使用存在性选项

`ifNotExists` 和 `ifExists` 只处理对象是否存在，不执行 Schema 对齐：

- 已存在的 Collection 不会因为 `ifNotExists` 自动补齐字段、索引或约束。
- 不存在的 Collection 可以在支持的 drop 操作中通过 `ifExists` 跳过。
- 修改已有结构仍应使用明确的 alter、add 或 drop operation。

具体哪些 Builder 方法支持这些选项，以方法类型和对应专题文档为准。

## 理解 strict 的边界

`strict: true` 适合 Migration、CI 和生产发布，用来阻止方言能力 warning 对应的降级或跳过。它不是 destructive 操作确认机制；删除类操作仍必须检查 `BuilderResult.impact`。

## 显式管理事务

`transaction` 当前只是预留选项。需要事务时，通过 `db.transaction()` 或 `connection.transaction()` 获取事务 Connection，并使用该 Connection 的 Builder。不要假设设置 `transaction: true` 已经提供原子性。

命名配置属于 Connection 或 Collection，而不是 `BuilderExecOptions`；详见[命名概念](../concepts/naming/overview.md)。执行结果见 [`BuilderResult`](./builder-result.md)。
