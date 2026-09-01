# 方言能力

Collection DSL 的目标是屏蔽常见数据库差异，但底层数据库能力并不完全一致。Agent 和开发者都不能假设所有方言支持相同能力。

## 当前能力表

| 能力                  | SQLite | PostgreSQL | MySQL  |
| --------------------- | ------ | ---------- | ------ |
| 表                    | 支持   | 支持       | 支持   |
| 外键                  | 支持   | 支持       | 支持   |
| 普通视图              | 支持   | 支持       | 支持   |
| replace view          | 支持   | 支持       | 支持   |
| 物化视图              | 不支持 | 支持       | 不支持 |
| schema                | 不支持 | 支持       | 不支持 |
| comment               | 有限   | 支持       | 支持   |
| native type           | 有限   | 支持       | 支持   |
| partial index         | 支持   | 支持       | 有限   |
| deferrable constraint | 不支持 | 支持       | 不支持 |

## 当前实现中的能力

`DatabaseConnection.capabilities` 会根据 dialect 生成基础能力信息：

```ts
const connection = db.connection();
console.log(connection.dialect);
console.log(connection.capabilities);
```

Builder 会在执行前根据当前连接的 `capabilities` 生成 capability plan。默认策略是 warning-first：不优先抛出底层数据库异常，而是尽量返回结构化 `warnings`，并对 schema operation 做安全降级或跳过。

## warning-first 策略

不支持的能力分成两类：

安全降级：

- `comment`：跳过数据库 comment，应用层 `title` / `description` 仍保存。
- `deferrable constraint`：创建普通 constraint，不带 deferrable 行为。
- `native type`：在当前原型中降级为通用类型；`type: 'native'` 默认降级为 `text`。
- 普通 `partial index`：不支持时移除 predicate，创建普通 index。
- 默认 schema，例如 `public`：不支持 schema 的数据库会忽略 schema。

不安全语义损失：

- `materialized view`：不自动降级成普通 view，不支持时跳过 schema operation。
- `refresh materialized view`：不支持时跳过 schema operation。
- `foreign key`：不支持时跳过会丢失数据完整性。
- `check constraint`：当前 DSL 已建模，但 adapter 还没有编译实现，因此会跳过。
- partial unique constraint：不支持时不能安全降级成 full unique，因此会跳过。
- 非默认 schema：忽略后可能建到错误命名空间。

`strict: true` 时，只要产生 capability warning，实际 apply 会抛出 `UnsupportedCapabilityError`。`dryRun: true` 即使开启 `strict: true`，也会优先返回 warnings，方便 Agent 或 CLI 展示计划和风险。

## warning 示例

```ts
{
  code: 'UNSUPPORTED_MATERIALIZED_VIEW',
  capability: 'materializedViews',
  dialect: 'sqlite',
  fallback: 'skip',
  severity: 'unsafe',
  path: ['view'],
  message: 'SQLite does not support materialized views. The materialized view will not be created.',
}
```

## 方言敏感点

- `native` 字段依赖具体数据库类型。
- `asRaw` 视图 SQL 依赖具体数据库方言。
- materialized view 主要是 PostgreSQL 能力。
- MySQL 外键字段类型需要和被引用字段严格兼容。
- SQLite 对部分 schema alter 操作的支持和其他数据库不同，Knex 会做一定处理。

## Agent 注意事项

- 生成跨数据库代码时，优先使用通用字段类型。
- 不要默认使用 `native`、`asRaw` 或 materialized view。
- 针对目标数据库生成 SQL 前，应先查看 `connection.capabilities`。
- 执行前应检查 `BuilderResult.warnings`，尤其是 `severity: 'unsafe'` 的 warning。
- 集成测试应覆盖真实 SQLite、PostgreSQL、MySQL。
