---
title: BuilderResult
description: Builder 执行结果的字段参考，包括 Collection operation、Schema operation、SQL、warning 和影响等级。
---

# BuilderResult

Builder API 返回 `BuilderResult`，用于描述执行结果、编译结果、SQL 预览和影响等级。

```ts
interface BuilderResult {
  operations: CollectionOperation[];
  schemaOperations?: SchemaOperation[];
  sql?: string[];
  metadata?: MetadataChangeSet;
  warnings?: BuilderWarning[];
  impact?: BuilderImpact[];
}
```

## operations

原始 Collection operation。

```ts
result.operations;
```

## metadata

`metadata` 字段当前不填充。Agent、CLI 或 UI 需要审计时，应读取 `operations`、`schemaOperations`、`warnings` 和 `impact`，不得依赖 `metadata`。

## schemaOperations

编译后的数据库 schema operation。纯 Metadata 更新使用 `connection.collectionMetadata`，不返回
`BuilderResult`。

## sql

当 `previewSql: true` 且 adapter 支持 SQL 编译时返回。

```ts
const result = await builder.createCollection('orders', definition, {
  dryRun: true,
  previewSql: true,
});

console.log(result.sql);
```

## impact

影响等级：

```ts
type BuilderImpactLevel = 'safe' | 'warning' | 'destructive';
```

示例：

```ts
[
  {
    level: 'destructive',
    operation: 'dropField',
    message: 'Dropping field users.name may remove existing data.',
  },
];
```

## warnings

`warnings` 用于表达 capability 降级、跳过和方言限制。

```ts
interface BuilderWarning {
  code: string;
  message: string;
  path?: Array<string | number>;
  capability?: string;
  dialect?: string;
  fallback?: 'downgrade' | 'skip' | 'ignore';
  severity?: 'warning' | 'unsafe';
}
```

常见含义：

- `fallback: 'downgrade'`：已安全降级，例如 deferrable constraint 变成普通 constraint。
- `fallback: 'skip'`：相关 schema 片段被跳过，例如不支持 materialized view。
- `fallback: 'ignore'`：相关配置被忽略，例如 SQLite 下的 `db.schema`。
- `severity: 'warning'`：通常可以继续执行，但调用方应展示提示。
- `severity: 'unsafe'`：存在语义损失，migration / CI / 生产发布应使用 `strict: true` 阻止执行。

## Agent 注意事项

- 执行 destructive 操作前，检查 `impact`。
- 自动化流程可以把 `operations` 和 `schemaOperations` 作为审计日志。
- `sql` 只用于预览，不应作为跨数据库 DSL 的 canonical source。
