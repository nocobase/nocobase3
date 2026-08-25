# Migration 维护清单

这份清单面向维护者和 Agent，用于保持 migration 模块的接口、校验、事务和测试规则一致。维护 migration 相关代码或文档时，以本页和 [Migration](./overview.md) 为准。

## 公开 API

- `defineMigration(definition)`：定义 migration 文件的唯一入口。
- `loadMigrations(options)`：加载并校验 migration 目录。
- `validateMigrations(options)`：校验 migration 文件格式和名称。
- `createMigrator(options)`：创建 migration runner。
- `migrator.latest()`：执行 pending migrations。
- `migrator.rollback()`：回滚最近一个 batch。

包入口从 `src/index.ts` 导出 migration public API。调用方不要依赖 `src/migration/*` 下的深层文件。

## 类型边界

`MigrationContext` 顶层只包含：

```ts
interface MigrationContext {
  builder: CollectionBuilder;
  query: QueryAdapter;
  connection: MigrationConnection;
}
```

`MigrationConnection` 是当前连接的受限视图：

```ts
interface MigrationConnection {
  name: string;
  driver: 'better-sqlite3' | 'pg' | 'mysql2';
  dialect: 'sqlite' | 'postgres' | 'mysql';
  capabilities: DatabaseCapabilities;
  client<T = unknown>(): Promise<T>;
}
```

保持以下边界：

- 不把 `database` 放进 `MigrationContext`。
- 不把 `schema` 放进 `MigrationContext` 顶层。
- 不把 `client` 放进 `MigrationContext` 顶层。
- 不把 `dialect` 放进 `MigrationContext` 顶层。
- 底层兜底只通过 `connection.client()`。

Migration 来源支持单目录和多 package 两种写法：

```ts
{ directory: './database/migrations', packageName: 'app' }
```

```ts
{
  sources: [
    { packageName: '@nocobase/plugin-users', directory: './plugins/users/database/migrations' },
  ],
}
```

`packageName` 是 migration 来源的 package name，不写在 migration 定义中。多个来源会被合并后按全局 `name` 排序；`name` 在所有来源中必须唯一，`packageName` 不参与排序、checksum 或唯一性判断。单目录未传 `packageName` 时默认为 `app`。

## 文件加载器

文件加载器负责以下校验：

- 只读取 migration 文件扩展名。
- default export 必须是 `defineMigration({})` 的返回值。
- `name` 必须是非空字符串。
- `name` 必须和文件名主体一致。
- `name` 不能重复。
- `up` 必须是函数。
- `down` 可选。
- 没有 `down` 时必须声明 `irreversible: true`。
- `down` 和 `irreversible: true` 不能同时出现。
- `transaction` 只能是 `true`、`false` 或 `'auto'`。
- `acceptedChecksums` 只能包含 SHA-256 十六进制字符串，并且只用于已验证的 migration 文件搬迁兼容。

文件加载器不根据文件名补齐 `name`，也不猜测 migration 形状。

## 执行流程

`latest()` 的顺序保持稳定：

```text
load migrations
acquire lock
ensure record table
read executed records
validate checksums
calculate pending migrations
run pending migrations
write executed records
release lock
```

执行顺序按 `migration.name` 字符串排序。

返回结果：

```ts
interface MigrationRunResult {
  batch: number;
  executed: string[];
  skipped: string[];
}
```

## 事务

默认事务模式是：

```ts
transaction: 'auto';
```

`transaction: true` 和 `transaction: 'auto'` 走 `connection.transaction()`。

事务内必须用 `trxConnection` 创建 context：

```ts
await connection.transaction(async (trxConnection) => {
  const ctx = createMigrationContext(trxConnection);

  await migration.up(ctx);
  await recordCompleted(ctx, migration);
});
```

必须保证：

- `builder` 来自 `trxConnection.builder`。
- `query` 来自 `trxConnection.query`。
- `connection.client()` 绑定到 `trxConnection.client()`。
- 执行记录写入和 `migration.up()` 在同一个事务里。

`transaction: false` 不调用 `connection.transaction()`。这类 migration 失败后停止后续 migration。

## 执行记录

默认执行记录表：

```text
__nocobase_migrations
```

字段：

```text
id
package_name
name
batch
checksum
executed_at
duration_ms
```

Runner 在执行 pending migration 前校验已执行记录的 checksum。checksum 变化时停止执行；如果当前 migration 明确声明了匹配的 `acceptedChecksums`，则允许该条历史记录继续参与校验，并把执行记录更新为当前 package 和 checksum。源码与编译产物字节不同时，可声明稳定的 `checksum`，使两种运行形态共享同一校验值。

如果 runner 发现已有历史表缺少 `package_name`，会自动补列并将既有记录设置为 `app`。历史表仍以 `name` 作为唯一 migration identity。

## Lock

默认 lock 表：

```text
__nocobase_migration_lock
```

`latest()` 和 `rollback()` 都必须在 lock 内运行。退出时必须释放 lock。

Lock 至少要保证同一进程内串行，并通过数据库表避免常见的多进程重复执行。

## Rollback

`rollback()` 只回滚最近一个 batch：

```text
read executed records
find max batch
load matching migrations
run down in reverse execution order
delete executed records
```

规则：

- 没有执行记录时返回空结果。
- 找不到对应 migration 文件时报错。
- `irreversible: true` 时报错。
- 没有 `down` 时报错。
- `down` 和执行记录删除共享同一个事务。

返回结果：

```ts
interface MigrationRollbackResult {
  batch: number;
  rolledBack: string[];
}
```

## 测试清单

单元测试覆盖：

- `defineMigration()` 添加内部标记。
- plain object 不是合法 migration。
- migration callback 可以获得 context 类型。
- loader 按 `migration.name` 排序。
- loader 计算 checksum。
- loader 校验 default export。
- loader 校验 `name`。
- loader 校验文件名主体和 `name`。
- loader 校验重复 `name`。
- loader 校验 `down` 和 `irreversible`。
- loader 校验 `transaction`。

集成测试覆盖：

- `latest()` 只执行 pending migrations。
- `latest()` 成功后写执行记录。
- `latest()` 重复执行时跳过已执行 migration。
- migration 失败时事务回滚。
- 执行记录写入和 migration 变更共享同一个事务。
- checksum 变化时报错。
- `rollback()` 反向执行最近 batch 的 `down`。
- `rollback()` 成功后删除执行记录。
- `transaction: false` 不开启主事务。

## 文档清单

- 新人文档只展示 `defineMigration({})` 一种文件形状。
- 示例优先使用 `builder`。
- 数据迁移示例使用 `query`。
- 底层兜底示例使用 `connection.client()`。
- 不在示例里展示顶层 `schema`。
- 不在示例里展示顶层 `database`。
- 不在文档中引入 class、named export 或 `module.exports` 写法。
- 文档直接描述当前规则，不写路线图口吻。
- Agent 规则使用直接、可执行的约束。
