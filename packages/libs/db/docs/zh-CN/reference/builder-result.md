---
title: BuilderResult 用法
description: 解释 BuilderResult 中执行计划、Schema 操作、SQL 预览、能力 warning 和影响等级的使用方式。
---

# BuilderResult 用法

Builder API 返回 `BuilderResult`，供调用方查看输入计划、编译结果、SQL 预览和风险。本文解释字段语义；精确结构以 TypeScript 声明为准。

## 读取结果

| 字段               | 含义                              | 适合用途                      |
| ------------------ | --------------------------------- | ----------------------------- |
| `operations`       | 原始 Collection operation         | 展示请求、审计逻辑变更        |
| `schemaOperations` | 编译后的数据库 Schema operation   | 诊断命名转换和方言计划        |
| `sql`              | adapter 可提供的 SQL 预览         | dry-run 展示和调试            |
| `warnings`         | 方言能力降级、跳过或忽略          | 决定展示、阻止或接受 fallback |
| `impact`           | safe、warning 或 destructive 影响 | 审批和危险操作保护            |
| `metadata`         | 预留的 Metadata change summary    | 当前不要依赖                  |

当前 Builder 不填充 `metadata`。审计流程应读取 `operations`、`schemaOperations`、`warnings` 和 `impact`；纯 Metadata 更新由 `connection.collectionMetadata` 完成，也不返回 `BuilderResult`。

## 预览 SQL

```ts
const result = await builder.createCollection('orders', definition, {
  dryRun: true,
  previewSql: true,
});

console.log(result.sql);
```

只有当前 adapter 支持 SQL 编译时才返回 `sql`。SQL 是诊断输出，不应保存为跨数据库 DSL 或代替 `operations`。

## 处理影响等级

| level         | 含义               | 建议处理                     |
| ------------- | ------------------ | ---------------------------- |
| `safe`        | 通常不损失现有数据 | 正常展示或执行               |
| `warning`     | 需要调用方理解影响 | 展示说明并按场景决定是否继续 |
| `destructive` | 可能删除数据或结构 | 要求明确确认或审批           |

`strict` 不处理 destructive 确认。自动化执行前应独立检查 `impact`。

## 处理 capability warning

Warning 的两个维度需要一起判断：

| 属性                    | 典型含义                           |
| ----------------------- | ---------------------------------- |
| `fallback: 'downgrade'` | 以语义较弱但可工作的形式执行       |
| `fallback: 'skip'`      | 跳过当前数据库不支持的 Schema 片段 |
| `fallback: 'ignore'`    | 忽略对当前方言无意义的配置         |
| `severity: 'warning'`   | 通常可继续，但应展示提示           |
| `severity: 'unsafe'`    | 存在语义损失，生产执行应阻止       |

Migration、CI 和生产发布通常使用 `strict: true` 阻止真实执行中的 capability warning。需要先查看 warning 时组合 `dryRun: true`。

## 建立审计记录

审计日志优先保存结构化的 `operations`、`schemaOperations`、`warnings` 和 `impact`，并记录实际执行环境和数据库方言。不要只保存生成 SQL，因为不同 adapter 和版本可能产生不同 SQL 表达。

选项组合见 [Builder 执行选项](./builder-options.md)，方言 fallback 见[命名与跨数据库兼容](../builder/portability.md)。
