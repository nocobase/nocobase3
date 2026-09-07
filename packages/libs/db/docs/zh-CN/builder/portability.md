---
title: 命名与跨数据库兼容
description: 使用逻辑名称生成确定的物理标识符，并通过 capabilities、warnings 和 strict 控制方言差异。
---

# 命名与跨数据库兼容

Builder 用统一的逻辑 DSL 描述 Schema，但物理名称和能力仍受 Connection 配置及数据库方言影响。可移植代码必须同时处理这两个边界。

## 始终传入逻辑名

Builder 方法以及 Relation、Index、Constraint、Foreign Key 和结构化 View 中的引用都使用 Collection 或 Field 的逻辑 `name`。Builder 再根据 effective naming 生成物理标识符：

```text
normalized(name) = underscored ? snake_case(name) : name
物理表名 = tablePrefix + normalized(collectionName)
物理列名 = normalized(fieldName)
```

默认 `underscored: true`、`tablePrefix: ''`。Connection 提供默认值，Collection 只在确有需要时覆盖：

```ts
await db.builder().createCollection('auditLogs', (collection) => {
  collection.naming({ tablePrefix: 'archive_' });
  collection.increments('id');
  collection.datetime('createdAt');
});
```

这会创建 `archive_audit_logs.created_at`。Collection 传入 `tablePrefix: ''` 可以清除 Connection 默认前缀。

不要生成 `tableName`、`columnName`、`mapToTable`、`mapToColumn` 或自定义 naming strategy。不规则的既有 Schema 应通过底层 Migration 或 introspection 处理，而不是伪装成 Collection Metadata 映射。

更完整的命名心智模型见[命名概念](../concepts/naming/overview.md)。

## 跨 Collection 引用

Foreign Key、Relation 和结构化 View 会解析目标 Collection 自己的 effective naming。因此源 Collection 使用 `app_`、目标 `users` 使用 `auth_` 时，外键仍会正确引用 `auth_users`。

未显式命名的 Index 和 Foreign Key 会从最终物理名称生成稳定名称，并在过长时追加稳定哈希。重要生产 Migration 仍建议显式设置名称，避免后续维护依赖生成规则。

`db.query()` 只使用 Connection naming，不读取 Collection 级覆盖。需要查询带 Collection 级覆盖的对象时，先确认 [Query 命名边界](../query/naming.md)。

## 先读取能力，再决定降级

```ts
const connection = db.connection();

console.log(connection.dialect);
console.log(connection.capabilities);
```

Builder 默认采用 warning-first：在执行前规划能力差异，并把降级或跳过信息放入 `BuilderResult.warnings`。

| 类型         | 典型能力                                                             | 默认行为                           |
| ------------ | -------------------------------------------------------------------- | ---------------------------------- |
| 可接受降级   | comment、deferrable、普通 partial index                              | 去掉不支持的部分后继续             |
| 可能改变语义 | materialized view、foreign key、check、partial unique、非默认 schema | 产生 unsafe warning 并跳过相关操作 |

`strict: true` 会把 capability warning 升级为错误。配合 `dryRun: true` 时仍会先返回 warnings，适合 CLI 或 Agent 展示风险后再决定是否执行。

精确 capability 字段和 warning 结构以公开 Types 为准，不应从文档表格反推 API。

## 常见方言敏感点

- `native` 字段类型和 Raw SQL View 绑定具体数据库。
- Materialized View 不是所有数据库都支持。
- MySQL 外键两端的整数类型和 unsigned 属性必须兼容。
- SQLite 的部分 alter 能力与其他数据库不同。
- Oracle 不支持 Foreign Key 的 `ON UPDATE`。
- SQL Server 的 partial index 对应 filtered index，部分约束语法也不同。
- 非默认 schema 在不支持 schema 的数据库上不能安全忽略。

不要把“某个方言当前支持”理解为公共类型的一部分；Types 描述可表达的计划，`capabilities` 和 `warnings` 描述当前连接能否安全执行。

## 使用建议

- 跨数据库代码优先通用字段类型和结构化 View。
- 使用 `native`、Raw SQL 或 Materialized View 前明确目标方言。
- 执行前检查 `warnings`，尤其是 `severity: 'unsafe'`。
- 关键路径在目标真实数据库上运行集成测试。
- Collection rename 依赖确定性命名；存在依赖时不要绕过预检查。
