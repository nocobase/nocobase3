---
title: defineSeed()：定义 Seed 文件
description: Seed 文件形状、Seed Context、幂等、事务和已发布文件不可变规则。
---

# `defineSeed()`：定义 Seed 文件

Seed 用于一次性安装默认数据。Schema 变更和升级驱动的数据回填属于 Migration。

## 文件形状

文件名：

```text
202609030002_create_default_order_statuses.ts
```

文件内容：

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

文件必须 default export `defineSeed({...})` 的结果。`name` 与文件名主体一致，并在全部 sources 中全局唯一。

## 定义契约

```ts
interface SeedDefinition {
  readonly name: string;
  readonly transaction?: true | false | 'auto';
  run(context: SeedContext): Promise<void>;
}
```

Seed Context 只有 `query` 和 `connection`，没有 `builder`。默认 `transaction: 'auto'`，每个 Seed 的数据写入和历史记录共享事务。

## 稳定规则

- 使用稳定业务 key 和数据库唯一约束保证幂等。
- 失败时当前事务回滚且不写历史，下次从失败 Seed 继续。
- 成功后再次运行会根据历史跳过。
- 已发布 Seed 不修改、不插队；变化通过更晚的新 Seed 表达。
- 不提供 rollback、refresh、truncate 或 repeatable 行为。

继续阅读：[创建 Seeder](./create-seeder.md)、[安装默认数据指南](../agent/implement-seed-data.md)。
