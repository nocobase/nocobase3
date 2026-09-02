---
title: Collection Builder API 总览
description: 通过 db.builder() 或 connection.builder 使用逻辑名称管理 Collection Schema；业务演进应放入 Migration。
---

# Collection Builder API 总览

`CollectionBuilder` 是当前原型的核心。它负责把 Collection DSL 转换为数据库 schema operation，并通过 `SchemaAdapter` 应用到底层数据库。

## Agent 契约

| 项目                | 内容                                   |
| ------------------- | -------------------------------------- |
| Manager 入口        | `db.builder(name?)`                    |
| Connection 入口     | `connection.builder`（属性）           |
| 名称语义            | Collection/Field 逻辑名称              |
| Metadata-aware      | 是                                     |
| 主要副作用          | DDL，并同步相应 Metadata               |
| External Connection | 禁止真实 DDL                           |
| 业务 Schema 落点    | `defineMigration()` 的 `up()`/`down()` |

直接调用 `db.builder()` 适合工具、测试和运行期明确授权的 Schema 管理流程。持久化业务 Schema 变更默认写成 Migration。

## API 分组

创建：

- `createCollection`
- `createViewCollection`
- `replaceViewCollection`
- `createMaterializedViewCollection`

结构变更：

- `alterCollection`
- `renameCollection`
- `dropCollection`

字段：

- `addField`
- `alterField`
- `dropField`

索引：

- `addIndex`
- `dropIndex`

约束：

- `addConstraint`
- `dropConstraint`

执行计划：

- `apply`

相关专题：

- [命名映射](./naming.md)
- [方言能力与降级](./dialect-capabilities.md)
- [Collection Metadata Service](../collection-metadata/collection-metadata-service.md)

## 三种写法

Object DSL 是可序列化表示，适合 HTTP、CLI、`collection.json` 和跨进程传输：

```ts
await builder.createCollection('orders', {
  fields: [
    { name: 'id', type: 'increments', primaryKey: true },
    { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
  ],
});
```

Fluent DSL 是代码编写层，适合 migration、插件代码、测试，以及 Agent 直接生成 TypeScript 代码：

```ts
await builder.createCollection('orders', (collection) => {
  collection.increments('id');
  collection.decimal('amount', { precision: 12, scale: 2 });
});
```

Operation DSL 是执行计划层：

```ts
await builder.apply([
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
]);
```

## 推荐选择

- 写 migration 文件、插件代码或测试时，优先使用 Fluent DSL。
- Agent 写 migration 文件或 TypeScript 代码时，也优先使用 Fluent DSL。
- HTTP API、CLI、`collection.json` 和其他配置载体，优先使用 Object DSL。
- file sync、snapshot diff、自动 apply 和审计场景，优先使用 Operation DSL。
- 需要解释变更计划时，使用 `builder.apply()` 更清晰。
- destructive 操作先用 `dryRun` 和 `previewSql`。

## Agent 安全界面

完整 Builder API 适合高级开发者和框架内部使用。Agent 自动化场景建议再包一层更受限的操作界面：

- 只允许白名单 operation。
- destructive 操作必须先 dry-run。
- Metadata Service 更新和 Schema 操作分开提交。
- 每次执行前输出 `operations`、`schemaOperations`、`warnings`、`impact`。
- 出现 `severity: 'unsafe'` 的 warning 时，应要求用户确认或改用 `strict: true` 阻止执行。
- 目标数据库不明确时，不生成 `native`、`asRaw`、物化视图或方言敏感约束。

## 返回结果

大部分 Builder API 返回 `BuilderResult`：

```ts
interface BuilderResult {
  operations: CollectionOperation[];
  schemaOperations?: SchemaOperation[];
  sql?: string[];
  warnings?: BuilderWarning[];
  impact?: BuilderImpact[];
}
```

## Agent 注意事项

- 不要让 Agent 直接拼 Knex schema builder。
- 不要把 `unique` 当普通 index 建模。
- 不要把 `title`、`description` 写成 `db.comment`。
- 不要假设所有数据库都支持物化视图。
- 涉及物理表名、列名和 underscored 时，先看 [命名映射](./naming.md)。
