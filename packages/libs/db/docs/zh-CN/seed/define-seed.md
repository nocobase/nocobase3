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

  async run({ repository }) {
    await repository('orderStatuses').upsertOne({
      filter: { code: 'draft' },
      create: { code: 'draft', title: 'Draft' },
      update: { title: 'Draft' },
    });
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

Seed Context 只有 `repository`、`query` 和 `connection`，没有 `builder`：Seed 不改结构。默认 `transaction: 'auto'`，每个 Seed 的数据写入和历史记录共享事务。

## 用 repository 写安装数据

安装数据是按 Collection 语义描述的，所以 `repository` 是默认工具：逻辑字段名、关系写入和嵌套写入都由它表达，JSON 与时间字段的方言编码、`createdAt`/`updatedAt` 这类受管理字段也由它处理，不需要每个 Seed 自己拼。

```ts
async run({ repository }) {
  await repository('roles').upsertOne({
    filter: { key: 'member' },
    create: {
      key: 'member',
      title: 'Member',
      // 中间表的行由关系写入生成，不必手写。
      permissions: { connect: [{ key: 'read' }, { key: 'comment' }] },
    },
    update: { title: 'Member' },
  });
}
```

`query` 留给 `repository` 表达不了的场景，例如读取一张不对应任何 Collection 的物理表。

Repository 绑定在本次 Seed 所在的 Connection 上，在事务中即事务 Connection：Seed 失败时它写入的数据会一并回滚。这也是 Seed 的服务容器不放行 `DatabaseManager` 的原因 —— 从那里取到的 Repository 会写在事务之外。

## 稳定规则

- 使用稳定业务 key 和数据库唯一约束保证幂等，`repository.upsertOne` 是表达它的直接方式。
- 失败时当前事务回滚且不写历史，下次从失败 Seed 继续。
- 成功后再次运行会根据历史跳过。
- 已发布 Seed 不修改、不插队；变化通过更晚的新 Seed 表达。
- 不提供 rollback、refresh、truncate 或 repeatable 行为。

继续阅读：[创建 Seeder](./create-seeder.md)、[安装默认数据指南](../agent/implement-seed-data.md)。
