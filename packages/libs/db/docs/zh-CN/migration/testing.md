---
title: Migration 测试
description: 通过真实 Migrator 和数据库验证 migration 的物理 Schema、Metadata、数据结果、回滚、checksum 与安装链路。
---

# Migration 测试

Migration 测试应执行 package 中真实的 migration 文件，并验证升级后的物理 Schema、
Resolved Collection、Metadata 和数据结果。测试某个具体 migration 时，默认使用
`migrator.upTo(name)` 固定执行上界；只有验证 package 能从空数据库安装到当前最新版时，
才使用 `migrator.latest()`。

## 核心原则

通过 `database.createMigrator()` 运行 migration：

```ts
const migrator = database.createMigrator({
  directory: migrationsDirectory,
  packageName: '@nocobase/app-plugin-example',
});

await migrator.upTo('202609010002_add_user_status');
```

不要直接 import migration 后调用 `up()` 或 `down()`：

```ts
// Do not test migrations this way.
import migration from '../database/migrations/202609010002_add_user_status.js';

await migration.up(context);
```

直接调用 callback 会绕过：

- migration 文件加载和定义校验；
- 文件名与 migration `name` 的一致性校验；
- migration history 和 checksum 校验；
- migration lock；
- batch 和 rollback 规则；
- runner 管理的事务；
- `schemaManagement` 检查；
- migration 完成后的 Collection Registry 失效。

测试不应复制 migration 中的 Builder 操作来准备数据库。需要构造历史版本时，应执行真实的
历史 migrations。

## 三个执行方法的测试职责

| 方法           | 测试职责                                                        |
| -------------- | --------------------------------------------------------------- |
| `upTo(target)` | 执行到指定 migration，包含目标；用于固定具体测试的执行边界      |
| `latest()`     | 执行全部 pending migrations；用于验证当前最新版可以完整安装     |
| `rollback()`   | 回滚最近一个 batch；用于验证刚执行的目标 migration 可以正确撤销 |

`upTo()` 只向前执行，不会回滚目标之后已经执行的 migration。目标名称必须精确匹配
当前 sources 中的 migration。

## 推荐目录结构

Migration 文件和测试分别放在 package 的 `database/migrations/` 和 `tests/` 中：

```text
packages/plugins/app-plugin-example/
  database/
    migrations/
      202609010001_create_users.ts
      202609010002_add_user_status.ts
      202609010003_backfill_user_status.ts
  tests/
    database.test.ts
```

测试文件不要放在 migration 目录中。

## 基础测试环境

每个测试使用一个独立数据库，并在结束后销毁连接。SQLite 内存数据库适合基础行为测试：

```ts
import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  validateMigrations,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(
  new URL('../database/migrations', import.meta.url),
);

const migrations = {
  createUsers: '202609010001_create_users',
  addUserStatus: '202609010002_add_user_status',
  backfillUserStatus: '202609010003_backfill_user_status',
} as const;

describe('example plugin migrations', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  // Add migration tests here.
});
```

使用持久化临时数据库文件时，同样必须在测试结束后销毁连接并删除临时目录。

## 校验 migration 文件

可以先用 `validateMigrations()` 固定 package 提供的 migration 列表：

```ts
it('provides valid migrations', async () => {
  const loaded = await validateMigrations(migrationsDirectory);

  expect(loaded.map((migration) => migration.name)).toEqual([
    migrations.createUsers,
    migrations.addUserStatus,
    migrations.backfillUserStatus,
  ]);
});
```

这个测试会覆盖文件加载、定义形状、名称一致性和全局重名校验。它不执行数据库变更，不能替代
下面的真实 migration 测试。

## 测试第一个 migration

即使目录中已经有后续 migrations，测试第一个 migration 时也只执行到它：

```ts
it('creates and rolls back users', async () => {
  const migrator = database.createMigrator({
    directory: migrationsDirectory,
    packageName: '@nocobase/app-plugin-example',
  });

  await expect(migrator.upTo(migrations.createUsers)).resolves.toEqual({
    batch: 1,
    executed: [migrations.createUsers],
    skipped: [],
  });

  const connection = database.connection();
  await expect(connection.builder.hasCollection('users')).resolves.toBe(true);
  await expect(connection.collections.get('users')).resolves.toMatchObject({
    name: 'users',
    fields: expect.arrayContaining([
      expect.objectContaining({ name: 'id' }),
      expect.objectContaining({ name: 'email' }),
    ]),
  });

  await expect(migrator.rollback()).resolves.toEqual({
    batch: 1,
    rolledBack: [migrations.createUsers],
  });
  await expect(connection.builder.hasCollection('users')).resolves.toBe(false);
  await expect(connection.collections.get('users')).resolves.toBeUndefined();
});
```

这个测试以后不会因为目录中新增 migration 而扩大执行范围。

## 测试具体的升级 migration

测试非首个 migration 时，先执行到它的直接前置 migration，再准备旧版本数据，最后使用
`upTo(target)` 只执行目标 migration：

```ts
it('backfills user status', async () => {
  const migrator = database.createMigrator({
    directory: migrationsDirectory,
    packageName: '@nocobase/app-plugin-example',
  });

  // Migrations 001 and 002 form batch 1.
  await migrator.upTo(migrations.addUserStatus);

  // Prepare legacy data against the Schema produced by migration 002.
  await database
    .query()
    .insertInto('users')
    .values({
      email: 'alice@example.com',
      status: null,
    })
    .execute();

  // Run only 003; future migrations 004 and 005 will not enter this test.
  await expect(migrator.upTo(migrations.backfillUserStatus)).resolves.toEqual({
    batch: 2,
    executed: [migrations.backfillUserStatus],
    skipped: [migrations.createUsers, migrations.addUserStatus],
  });

  await expect(
    database
      .query()
      .selectFrom('users')
      .select(['email', 'status'])
      .executeTakeFirstOrThrow(),
  ).resolves.toMatchObject({
    email: 'alice@example.com',
    status: 'active',
  });
});
```

不要在这里使用 `latest()`。否则以后增加的 migrations 会自动进入旧测试，测试看到的将是
最新 Schema，而不是目标 migration 刚执行完的状态。

## 测试目标 migration 的 rollback

`rollback()` 回滚最近一个 batch，不是固定回滚一个 migration。因此，要单独测试目标
migration 的 `down()`，必须让目标 migration 单独形成一个 batch：

```ts
it('rolls back the status backfill', async () => {
  const migrator = database.createMigrator({
    directory: migrationsDirectory,
    packageName: '@nocobase/app-plugin-example',
  });

  await migrator.upTo(migrations.addUserStatus); // Batch 1.

  await database
    .query()
    .insertInto('users')
    .values({ email: 'alice@example.com', status: null })
    .execute();

  await migrator.upTo(migrations.backfillUserStatus); // Batch 2.

  await expect(migrator.rollback()).resolves.toEqual({
    batch: 2,
    rolledBack: [migrations.backfillUserStatus],
  });

  await expect(
    database
      .query()
      .selectFrom('users')
      .select('status')
      .executeTakeFirstOrThrow(),
  ).resolves.toMatchObject({ status: null });

  // The Schema created in batch 1 remains.
  await expect(
    database.connection().builder.hasCollection('users'),
  ).resolves.toBe(true);
});
```

如果在空数据库上直接调用：

```ts
await migrator.upTo(migrations.backfillUserStatus);
```

那么 001、002 和 003 会进入同一个 batch，随后一次 `rollback()` 会将三个 migration
全部回滚。这不适合验证 003 自身的 `down()`。

对于 `irreversible: true` 的 migration，不要编造 `down()`。测试应确认 rollback 在执行
任何反向操作之前明确失败，并确认数据库仍保留 migration 执行后的状态。

## 测试重复执行

同一个目标重复调用 `upTo()` 时，已经执行的 migrations 应出现在 `skipped` 中：

```ts
await migrator.upTo(migrations.addUserStatus);

await expect(migrator.upTo(migrations.addUserStatus)).resolves.toEqual({
  batch: 1,
  executed: [],
  skipped: [migrations.createUsers, migrations.addUserStatus],
});
```

这个断言验证 history 阻止成功的 migration 重复执行。它不表示 migration callback 可以依赖
history 处理部分失败；`transaction: false` 的 migration 仍应自行考虑失败后的重试安全性。

## 使用 `latest()` 测试完整安装

每个提供 migrations 的 package 应保留一个完整安装 smoke test，验证当前目录中的所有
migrations 可以从空数据库连续执行：

```ts
it('installs all current migrations', async () => {
  const loaded = await validateMigrations(migrationsDirectory);
  const migrator = database.createMigrator({
    directory: migrationsDirectory,
    packageName: '@nocobase/app-plugin-example',
  });

  await expect(migrator.latest()).resolves.toMatchObject({
    batch: 1,
    executed: loaded.map((migration) => migration.name),
    skipped: [],
  });

  // Verify invariants of the current latest version, not a historical version.
  await expect(
    database.connection().collections.get('users'),
  ).resolves.toMatchObject({ name: 'users' });
});
```

以后新增 migration 时，这个测试扩大执行范围是预期行为。具体 migration 的测试则继续由
`upTo(target)` 保持稳定边界。

## 应该断言什么

结构 migration 至少按实际变更选择以下断言：

- Collection 是否存在；
- 字段、字段类型、nullable、default 是否正确；
- relation 的类型、target、foreignKey、sourceKey 和 targetKey 是否正确；
- index、unique 和 foreign key constraint 是否存在；
- title、description 等补充 Metadata 是否正确；
- rollback 后物理 Schema 和 Metadata 是否恢复。

数据 migration 至少覆盖：

- 典型旧数据是否被正确转换；
- null、空值、重复值和边界值；
- 失败时数据和 history 是否共同回滚；
- 可逆时，`rollback()` 是否恢复数据；
- rollback 后再次执行是否可以重新升级。

优先通过公共数据库接口断言：

```ts
connection.builder.hasCollection('users');
connection.collections.get('users');
connection.collections.getPhysical('users');
database.query();
```

其中各接口的职责不同：

- `builder.hasCollection()`：按逻辑 Collection 名确认对象是否存在；
- `collections.get()`：验证物理 Schema 与补充 Metadata 合并后的 Collection；
- `collections.getPhysical()`：按逻辑 Collection 名解析动态表前缀，并验证真实的表、字段、主键、索引、
  unique constraint、foreign key 和 check constraint；
- `query()`：验证 migration 处理后的业务数据。

验证托管 Collection 的物理 Schema 时，一般不要直接取得底层 client，也不要自行拼接动态 `tablePrefix`。使用
`collections.getPhysical()`：

```ts
const users = await connection.collections.getPhysical('users');

expect(users).toMatchObject({
  kind: 'table',
  columns: expect.arrayContaining([
    expect.objectContaining({
      columnName: 'email',
      nullable: false,
    }),
  ]),
  indexes: expect.arrayContaining([
    expect.objectContaining({
      name: 'users_email_unique',
      unique: true,
    }),
  ]),
});
```

`getPhysical()` 的参数是逻辑 Collection 名，返回结果中的 `tableName` 是已经解析 Connection 和 Collection naming
后的真实物理名称。只有检查非托管表、view 或已经取得物理名称的底层对象时，才直接使用
`schemaInspector.getPhysicalCollection({ tableName, schema })`。

Schema Inspector 使用物理表名和列名；Resolved Collections 使用逻辑 Collection 名和 Field
名。只有 Schema Inspector 尚未暴露、且 migration 明确依赖的方言特有信息，才考虑用
`connection.client()` 做最后的只读验证。不要为了方便断言而直接使用底层 client 执行 DDL。
Schema Inspector 的返回结构和更多示例见 [Schema Inspector 物理模型](../internals/schema-inspector/physical-schema-model.md) 和
[Schema Inspector 示例](../schema-inspector/examples.md)。

不要只断言 runner 没有抛出异常；测试必须验证 migration 承诺的实际结果。

## 真实数据库矩阵

SQLite 适合快速验证基本流程，但不能证明所有数据库方言都兼容。Migration 使用以下能力时，
需要在对应的真实数据库上测试：

- raw SQL 或 `connection.client()`；
- 数据库原生类型、函数或表达式；
- foreign key、unique constraint 和复合 index；
- view、materialized view 或方言特定 DDL；
- transaction 行为不同的 DDL。

即使 migration 内部确实使用了 raw SQL 或 `connection.client()`，测试也应优先通过
`schemaInspector` 验证执行后的物理 Schema。

数据库服务、连接环境和完整矩阵命令见[DB 包集成测试](../development/integration-testing.md)。

## 最小测试清单

只有一个 migration 的 package：

1. 使用 `validateMigrations()` 校验文件；
2. 使用 `upTo(target)` 执行目标；
3. 验证 Schema、Resolved Collection、Metadata 和必要的数据；
4. 再次调用 `upTo(target)`，验证 migration 被跳过；
5. 对可逆 migration 调用 `rollback()`；
6. 验证 Schema、Metadata 和数据恢复。

增加后续 migration 的 package：

1. 使用 `upTo(previous)` 构造升级前状态；
2. 写入覆盖边界条件的旧数据；
3. 使用 `upTo(target)` 单独执行目标 migration；
4. 验证目标 Schema、Metadata 和数据结果；
5. 对可逆 migration 使用 `rollback()`，验证只撤销目标 batch；
6. 再次使用 `upTo(target)`，验证 rollback 后可以重新升级；
7. 保留一个独立的 `latest()` 完整安装 smoke test。

Migration 文件一旦随功能分支合并，就不应再修改。发现问题时新增 migration，并为新的升级
路径增加测试。不要通过修改历史文件或硬编码旧 checksum 让测试通过。
