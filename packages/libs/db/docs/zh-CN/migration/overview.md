# Migration

Migration 用于把数据库变更按顺序应用到目标连接。每个 migration 文件描述一个独立变更，runner 负责加载文件、校验格式、控制事务、记录执行结果、防止并发执行，并在需要时回滚最近一个 batch。

Migration 的写法刻意保持简单：结构变更用 `builder`，数据变更用 `query`，特殊底层能力才用 `connection.client()`。

一个应用可以同时加载多个 package 的 migration。每个插件 package 提供自己的 migration 目录，runner 会把它们合并成一个全局序列。`packageName` 用于记录来源和诊断，执行顺序与唯一性仍然只由 `name` 决定。

## 先选入口

写 migration 前先判断变更类型：

| 场景                                     | 入口         | 说明                                                           |
| ---------------------------------------- | ------------ | -------------------------------------------------------------- |
| 创建、修改、删除 Collection 或字段       | `builder`    | 走 Collection DSL、命名策略和 metadata 同步                    |
| 添加、删除索引或约束                     | `builder`    | 让 Builder 负责数据库能力检查和稳定命名                        |
| 回填、修正或清理数据                     | `query`      | 使用物理查询名，不读取 Collection metadata                     |
| 需要数据库方言或底层 adapter client 能力 | `connection` | 先判断 `dialect` 或 `capabilities`，再用 `connection.client()` |

常规 migration 不需要接触 `database`、`schema` 或底层 adapter client。只有 `builder` 和 `query` 表达不了时，才使用 `connection.client()`。

## 最小示例

文件名：

```text
202608180001_create_users.ts
```

文件内容：

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202608180001_create_users',

  async up({ builder }) {
    await builder.createCollection(
      'users',
      (collection) => {
        collection.increments('id');
        collection.string('name');
        collection.string('email').unique();
        collection.datetime('createdAt');
      },
      { ifNotExists: true },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('users', { ifExists: true });
  },
});
```

这个示例包含 migration 的基本形状：

- 使用 `export default defineMigration({})`。
- `name` 显式声明。
- 文件名主体和 `name` 一致。
- `up` 执行变更。
- `down` 撤销变更。
- 常规结构变更只用 `builder`。

## 文件规则

Migration 文件只有一种合法形状：

```ts
export default defineMigration({
  name: '202608180001_create_users',
  async up(context) {},
  async down(context) {},
});
```

`name` 是 migration identity。文件名主体必须和 `name` 一致：

```text
202608180001_create_users.ts
```

```ts
name: '202608180001_create_users';
```

推荐命名格式：

```text
YYYYMMDDHHmmss_action_target.ts
```

例如：

```text
202608180001_create_users.ts
202608180002_add_status_to_users.ts
202608180003_backfill_user_status.ts
```

已经执行过的 migration 文件不要修改。需要调整时，新增一个 migration 文件表达下一步变化。

## Context

Migration context 顶层只暴露三个入口：

```ts
interface MigrationContext {
  builder: CollectionBuilder;
  query: QueryAdapter;
  connection: MigrationConnection;
}
```

`connection` 是当前 migration 正在使用的连接视图：

```ts
interface MigrationConnection {
  name: string;
  driver: 'better-sqlite3' | 'pg' | 'mysql2';
  dialect: 'sqlite' | 'postgres' | 'mysql';
  capabilities: DatabaseCapabilities;
  client<T = unknown>(): Promise<T>;
}
```

选择规则：

| 要做什么                     | 用什么                    |
| ---------------------------- | ------------------------- |
| 创建、修改、删除 Collection  | `builder`                 |
| 添加、修改、删除字段         | `builder`                 |
| 添加、删除索引或约束         | `builder`                 |
| 回填数据、修正数据           | `query`                   |
| 判断数据库类型               | `connection.dialect`      |
| 判断数据库能力               | `connection.capabilities` |
| 使用底层 adapter client 能力 | `connection.client()`     |

Migration context 顶层没有 `database`、`schema`、`client` 或 `dialect`。

`database` 只属于 `createMigrator()` 配置，不进入 migration 文件。这样可以避免 migration 在事务内又回到外层连接。

`schema` 是 `builder` 和底层数据库 schema builder 之间的 adapter。Migration 文件不要直接使用它，避免绕过 Collection metadata、命名策略和 Builder 的能力检查。

`client` 和 `dialect` 放在 `connection` 下，语义更明确：它们属于当前连接；如果 runner 正在事务里执行 migration，`connection.client()` 拿到的也必须是当前事务连接的 adapter client。默认 Knex adapter 下，它返回 Knex 实例。

## 结构变更

创建或修改数据库结构时，优先使用 `builder`：

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202608180004_create_orders',

  async up({ builder }) {
    await builder.createCollection(
      'orders',
      (collection) => {
        collection.increments('id');
        collection.string('orderNo').unique({ name: 'uk_orders_order_no' });
        collection.decimal('amount', { precision: 12, scale: 2 });
        collection.string('status').defaultTo('draft');
        collection.datetime('createdAt');
      },
      { ifNotExists: true },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('orders', { ifExists: true });
  },
});
```

`builder` 会把 Collection DSL 编译成数据库 schema operation，并同步 Collection metadata。写 migration 时优先使用逻辑名，例如 `orders`、`orderNo`、`createdAt`。只有确实需要绑定已有物理表或列时，才写 `tableName` 或 `columnName`。

## 数据变更

数据迁移使用 `query`：

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202608180005_backfill_user_status',

  async up({ query }) {
    await query
      .updateTable('users')
      .set({ status: 'active' })
      .where('status', 'is', null)
      .execute();
  },

  irreversible: true,
});
```

`query` 是数据库层 Query Builder，不读取 Collection metadata。需要应用层字段映射时，不要让 `query` 假装 Repository；应使用物理查询名，或把能力放到 Repository 层。

很多数据迁移没有可靠的反向操作。没有可靠 `down` 时，必须声明：

```ts
irreversible: true;
```

不要为了通过校验而写一个不真实的 `down`。

## 底层兜底

只有 `builder` 和 `query` 表达不了时，才使用 `connection.client()`：

```ts
import type { Knex } from 'knex';
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202608180006_create_pg_extension',
  transaction: false,

  async up({ connection }) {
    if (connection.dialect !== 'postgres') {
      return;
    }

    const knex = await connection.client<Knex>();
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  },

  async down({ connection }) {
    if (connection.dialect !== 'postgres') {
      return;
    }

    const knex = await connection.client<Knex>();
    await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp"');
  },
});
```

使用 `connection.client()` 表示这个 migration 依赖底层 adapter client 或数据库方言。这样的 migration 应显式判断 `connection.dialect` 或 `connection.capabilities`。

## 运行

通过 `createMigrator()` 创建 runner：

```ts
import { createMigrator } from '@nocobase/db';

const migrator = createMigrator({
  database,
  connection: 'main',
  directory: './database/migrations',
});

await migrator.latest();
```

插件系统需要加载多个 package 时，使用 `sources`：

```ts
const migrator = createMigrator({
  database,
  connection: 'main',
  sources: [
    {
      packageName: '@nocobase/plugin-users',
      directory: './plugins/users/database/migrations',
    },
    {
      packageName: '@nocobase/plugin-workflow',
      directory: './plugins/workflow/database/migrations',
    },
  ],
});
```

旧的 `directory` 写法仍然有效，未指定 `packageName` 时记录为 `app`。同一 runner 中所有来源的 migration `name` 必须全局唯一；不能因为属于不同 package 就使用相同的 name。

`database` 只用于 runner 找到目标连接。Migration 文件里不会收到 `database`。

`latest()` 会：

- 加载 migration 目录。
- 校验文件格式和名称。
- 获取 migration lock。
- 确保执行记录表存在。
- 读取已执行记录。
- 校验 checksum。
- 计算 pending migrations。
- 按顺序执行 pending migrations。
- 写入执行记录。
- 释放 migration lock。

返回结果：

```ts
interface MigrationRunResult {
  batch: number;
  executed: string[];
  skipped: string[];
}
```

## 事务

Migration 作者不手动管理主事务。Runner 会根据 `transaction` 选项控制事务。

默认事务策略是：

```ts
transaction: 'auto';
```

普通 migration 不需要显式写 `transaction`。

可选值：

| 值       | 含义                        |
| -------- | --------------------------- |
| `'auto'` | 默认值，runner 尽量使用事务 |
| `true`   | 要求使用事务                |
| `false`  | 不使用事务                  |

事务内执行时，runner 必须用事务连接创建 context：

```ts
await connection.transaction(async (trxConnection) => {
  const ctx = createMigrationContext(trxConnection);

  await migration.up(ctx);
  await recordCompleted(ctx, migration);
});
```

这能保证：

- `ctx.builder` 来自事务连接。
- `ctx.query` 来自事务连接。
- `ctx.connection.client()` 来自事务连接。
- migration 变更和执行记录写入共享同一个事务。

`transaction: false` 适用于数据库不允许放进事务的 DDL 或特殊长任务。这类 migration 不能承诺原子性，应该尽量写成可重复执行。

## 执行记录

Runner 使用执行记录表保存已经成功执行的 migration：

```text
__nocobase_migrations
- id
- package_name
- name
- batch
- checksum
- executed_at
- duration_ms
```

`checksum` 用于检测已经执行过的 migration 文件是否被修改。检测到变化时，runner 会停止执行并报错。

已有的旧历史表没有 `package_name` 时，runner 会自动增加该字段，并把旧记录归类为 `app`。已执行判断仍按全局 `name` 进行，不会因为 `packageName` 变化而重复执行。

## Lock

Runner 在 `latest()` 和 `rollback()` 前获取 migration lock，结束后释放。Lock 用于避免多个进程同时执行 migration。

默认 lock 表：

```text
__nocobase_migration_lock
```

## Rollback

`rollback()` 回滚最近一个 batch：

```ts
await migrator.rollback();
```

行为：

- 读取最大 `batch`。
- 按执行顺序反向执行 `down`。
- 成功后删除对应执行记录。
- 遇到 `irreversible: true` 时停止并报错。

返回结果：

```ts
interface MigrationRollbackResult {
  batch: number;
  rolledBack: string[];
}
```

## 校验

可以单独校验 migration 目录：

```ts
import { validateMigrations } from '@nocobase/db';

await validateMigrations('./database/migrations');
```

校验规则：

- default export 必须是 `defineMigration({})` 的返回值。
- `name` 必须是非空字符串。
- `name` 必须和文件名主体一致。
- `name` 不能重复。
- `up` 必须是函数。
- `down` 可选。
- 没有 `down` 时必须声明 `irreversible: true`。
- `down` 和 `irreversible: true` 不能同时出现。
- `transaction` 只能是 `true`、`false` 或 `'auto'`。

## Agent 规则

Agent 生成 migration 文件时遵守以下规则：

- 只生成 `export default defineMigration({})`。
- 文件名主体和 `name` 完全一致。
- 结构变更只用 `builder`。
- 数据迁移只用 `query`。
- 不在 context 顶层使用 `database`、`schema`、`client` 或 `dialect`。
- 特殊底层能力使用 `connection.client()`，并判断 `connection.dialect` 或 `connection.capabilities`。
- 普通 migration 不写 `transaction`。
- 没有可靠 `down` 时写 `irreversible: true`。
- 不生成虚假的 rollback。
- 不为 class、named export 或 `module.exports` 增加额外写法。
- 已经执行过的变更需要调整时，新增 migration。
