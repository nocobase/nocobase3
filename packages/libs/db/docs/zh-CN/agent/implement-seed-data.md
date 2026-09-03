---
title: 使用 Seed 实现安装默认数据
description: Agent 创建一次性安装数据时的 defineSeed() 文件形状、幂等策略、执行顺序与测试要求。
---

# 使用 Seed 实现安装默认数据

Seed 用于插件或应用首次安装时写入默认角色、权限、配置和内置选项。数据库结构变更和升级驱动的数据回填属于 Migration。

## 完整 Seed 形状

文件：`database/seeds/202609030002_create_default_order_statuses.ts`

```ts
import { defineSeed } from '@nocobase/db';

export default defineSeed({
  name: '202609030002_create_default_order_statuses',

  async run({ query }) {
    const existing = await query
      .selectFrom('orderStatuses')
      .select('code')
      .where('code', '=', 'draft')
      .executeTakeFirst();

    if (!existing) {
      await query
        .insertInto('orderStatuses')
        .values({ code: 'draft', title: 'Draft' })
        .execute();
    }
  },
});
```

Seed Context 只提供 `query` 和 `connection`，不提供 `builder`。如果目标表或唯一约束尚不存在，应先添加 Migration。

## 幂等和历史

- 使用稳定业务 key 查询现有记录。
- 使用数据库唯一约束防止并发或重试产生重复数据。
- 默认每个 Seed 在独立事务中执行，数据写入和历史记录共享事务。
- Seed 失败时不写历史；修复原因后再次执行。
- 已发布 Seed 不修改、不插队。默认数据发生变化时创建一个名称更晚的新 Seed。
- Seed 不支持 rollback、refresh、truncate 或 repeatable 模式。

## 运行顺序

安装器必须先运行 Migration，再运行 Seed：

```ts
await db.createMigrator(migrationOptions).latest();
await db.createSeeder(seedOptions).run();
```

## 完成条件

- 文件名主体与 `name` 一致，且名称全局唯一。
- Seed 只写数据，没有 Builder 或 Schema 操作。
- 首次执行写入预期数据，再次执行安全跳过。
- 测试覆盖失败不写历史，以及 checksum 变化被拒绝。

继续阅读：[定义 Seed](../seed/define-seed.md)、[创建 Seeder](../seed/create-seeder.md)、[数据写入](../query/mutations.md)。
