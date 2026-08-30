---
title: 插件数据库迁移和初始数据
description: 为 NocoBase 插件创建显式、自包含且不可变的 Migration 和 Seed，并通过真实测试数据库验证物理 schema、metadata、up 和 down。
---

# 插件数据库迁移和初始数据

Migration 是不可变的 schema 历史，Seed 是一次性的初始数据操作。不要用 Seed 代替 schema 变更，也不要让 Migration 读取会继续演化的运行时定义。

## 先判断 Migration 还是 Seed

| 变化                                 | 使用                          |
| ------------------------------------ | ----------------------------- |
| 表、字段、关系、索引、约束、metadata | Migration                     |
| 插件运行所必需的初始记录             | Seed                          |
| 测试夹具或演示数据                   | 测试 setup；通常不是发布 Seed |

## 编辑前检查历史

修改已有 Migration 前，先检查 `git log -- <file>` 和引入它的分支状态。只有引入 feature branch 尚未合并时才可直接修正；一旦合并，已有 Migration 永不修改，后续修复必须新增 Migration。不得硬编码旧 checksum 来伪造兼容。

## 生成 Database capability

创建插件时显式选择 `--with database`，生成 migrations、seeds、Server database
declaration 和对应测试。生成文件以 `.ts.example` 结尾，不会加载。Agent 实现真实
schema 时再删除最后的 `.example`，并按本页规则替换示例内容：

```text
202608300001-create-audit-logs.ts.example
→ 202608300001-create-audit-logs.ts
```

导出的 `name` 必须等于不含可执行扩展名的文件名，名称在插件内唯一。不要启用模板 Migration 后仍保留示例 collection 或 Seed 值。

## 编写自包含 Migration

在 Migration 中直接写出固定的表名、字段、类型、索引、约束和 metadata 操作：

```ts
const migration: MigrationDefinition = defineMigration({
  name: '202608300001-create-audit-logs',
  async up({ builder }) {
    await builder.createCollection('auditLogs', (collection) => {
      collection.increments('id');
      collection.string('action', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('auditLogs');
  },
});
```

禁止 import 或遍历实时 collection schema、field/model definition、注册列表或其他 runtime application definition。`down` 必须按安全的反向依赖顺序撤销 `up`；确实不可逆时要明确说明和测试其约束。

## 编写 Seed

Seed 用 `defineSeed()`，通过提供的 query context 写入固定目标。考虑幂等性、唯一约束和已有数据；不要用当前时间、随机数或外部服务制造不可复现的关键数据，除非这正是明确契约。

## 接入 Server 插件

在 `server/plugin.ts` 声明 package-relative 路径：

```ts
database: {
  migrations: './database/migrations',
  seeds: './database/seeds',
}
```

路径必须以 `./` 开头。缺失目录和 `.ts.example` 不产生 contribution。目标 App 仍需在 `server/plugins.ts` 注册插件。

## 运行和测试

在目标 App 执行其 migration 和 seed scripts：

```bash
pnpm --filter <target-app> migrate
pnpm --filter <target-app> seed
```

每个 Migration 添加 migration-level test，连接真实测试数据库并验证：

- `up` 后物理表、字段、索引和约束；
- App metadata 与物理 schema 一致；
- 可逆时执行 `down` 并验证清理结果；
- 再次运行、checksum 和历史记录符合 runner 契约；
- Seed 只产生预期记录并正确处理已存在数据。

只调用 `validateMigrations()` 或断言文件可加载，不足以证明 schema 正确。

## 完成条件

- 已确认旧 Migration 是否可编辑；
- Migration 固定、自包含、无运行时 schema import；
- 文件名和 `name` 一致，Server 路径正确；
- `up`、`down`、物理 schema 和 metadata 由真实数据库测试覆盖；
- Seed 数据确定且符合重复执行策略；
- 插件和目标 App 的 typecheck、test、build 通过；
- App 集成前置数据模型变化已同步到 Plugin Skills。
