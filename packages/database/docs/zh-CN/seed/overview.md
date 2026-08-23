# Seed

Seed 用于插件或应用首次安装时写入默认数据，例如默认角色、权限、配置和内置选项。数据库结构变更由 migration 负责；由 schema 升级驱动的数据回填或历史数据修正也应使用 migration。

每个 package 把自己的 seed 放在 `database/seeds/`：

```text
database/
  migrations/
    202608210001_create_roles.ts
  seeds/
    202608210002_create_default_roles.ts
```

## 定义 Seed

文件名主体必须和 `name` 一致：

```ts
import { defineSeed } from '@nocobase/database';

export default defineSeed({
  name: '202608210002_create_default_roles',

  async run({ query }) {
    const existing = await query
      .selectFrom('roles')
      .select('name')
      .where('name', '=', 'member')
      .executeTakeFirst();

    if (!existing) {
      await query
        .insertInto('roles')
        .values({ name: 'member', title: 'Member' })
        .execute();
    }
  },
});
```

Seed context 只包含：

```ts
interface SeedContext {
  query: QueryAdapter;
  connection: SeedConnection;
}
```

Seed 不暴露 `builder`。需要建表、改字段、增加索引时先写 migration。

## 执行

单目录：

```ts
const seeder = createSeeder({
  database,
  connection: 'main',
  directory: './database/seeds',
  packageName: '@nocobase/plugin-users',
});

await seeder.run();
```

多个 package：

```ts
const seeder = createSeeder({
  database,
  connection: 'main',
  sources: [
    {
      packageName: '@nocobase/plugin-users',
      directory: './plugins/users/database/seeds',
    },
    {
      packageName: '@nocobase/plugin-acl',
      directory: './plugins/acl/database/seeds',
    },
  ],
});

await seeder.run();
```

上层安装器应先执行 migrations，再执行 seeds。数据库包不扫描插件，也不解析插件依赖；插件安装顺序由插件系统负责。

所有来源合并后按 `seed.name` 字符串升序执行。`name` 必须全局唯一，`packageName` 只用于历史归属和诊断，不参与排序或 identity。

## 执行历史

默认历史表是：

```text
__nocobase_seeds
- id
- package_name
- name
- checksum
- executed_at
- duration_ms
```

成功执行后写入历史；再次运行时跳过。已经执行过的 seed 文件发生变化时，checksum 校验会停止执行。

发布后的 seed 是不可变历史。默认数据需要补充或修正时新增一个更晚的 seed，不要修改旧文件，也不要向已经发布的 seed 序列中间插入文件。

Seeder 只校验当前 sources 中已执行 seed 的 checksum。历史表中其他 package 的记录不会要求本次重新提供对应文件，因此插件安装器可以只传当前正在安装的 package，也可以一次传入多个 package。

## 事务和失败重试

默认 `transaction: 'auto'`，每个 seed 使用独立事务，seed 数据写入和历史记录共享事务。Seed 失败时：

- 当前 seed 的数据库变更回滚。
- 不写执行历史。
- 后续 seed 不执行。
- 下次运行从失败 seed 继续。

只有确实不能使用事务时才写：

```ts
transaction: false;
```

这类 seed 失败后无法保证数据回滚，必须自行保证幂等。

第一版不提供 rollback、refresh、truncate、repeatable、archive 或 install-only 模式。插件卸载也不会自动删除 seed 创建的数据。
