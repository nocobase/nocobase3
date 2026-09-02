---
title: Seed 概览
description: 使用 defineSeed() 声明一次性安装数据，并通过 db.createSeeder() 加载、执行和记录 Seed。
---

# Seed 概览

Seed 用于插件或应用首次安装时写入默认角色、权限、配置和内置选项。数据库结构变更和升级驱动的数据回填属于 Migration。

```text
defineSeed()
  -> seed files
  -> db.createSeeder(options)
  -> run()
```

## 两个核心入口

### 定义文件

```ts
import { defineSeed } from '@nocobase/db';

export default defineSeed({
  name: '202609030002_create_default_status',
  async run({ query }) {
    await query
      .insertInto('orderStatuses')
      .values({ code: 'draft', title: 'Draft' })
      .execute();
  },
});
```

Seed Context 只包含 `query` 和 `connection`，没有 `builder`。

### 创建 Runner

```ts
const seeder = db.createSeeder({
  directory: './database/seeds',
  packageName: 'my-app',
});

await seeder.run();
```

安装器先运行 Migration，再运行 Seed。

## 稳定规则

- 文件名主体与 `name` 一致，名称全局唯一。
- 使用稳定业务 key 和数据库唯一约束保证幂等。
- 默认每个 Seed 使用事务，失败时不写历史。
- 已发布 Seed 不修改、不插队；变化通过更晚的新 Seed 表达。
- Seed 没有 rollback、refresh、truncate 或 repeatable 模式。

## 文档地图

- [定义 Seed](./define-seed.md)
- [创建和运行 Seeder](./create-seeder.md)
- [Seed 维护清单](../development/seed-maintenance.md)
- [Agent Seed 实现流程](../agent/implement-seed-data.md)
