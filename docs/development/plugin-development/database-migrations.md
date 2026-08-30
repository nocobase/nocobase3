---
title: 编写插件 Migration
description: 在 NocoBase v3 插件中编写显式、自包含、不可变的数据库 Migration，并用真实数据库验证 up、down、物理 schema 和 metadata。
---

# 编写插件 Migration

Migration 是插件数据库结构的不可变历史。表、字段、关系、索引、约束和 metadata 的新增、修改、重命名或删除都属于 Migration；初始业务记录属于 [Seed](./database-seeds.md)。

## 开始前确认历史

编辑已有 Migration 前，先执行 `git log -- <file>`，确认引入它的 feature branch 是否已经合并。尚未合并时可以直接修正；一旦合并，永远不要修改该 Migration，后续变化必须新增 Migration。不要用硬编码旧 checksum 掩盖历史文件被修改的事实。

`plugin:create --with database` 生成的文件以 `.ts.example` 结尾，不会被加载。实现真实结构时，删除最后的 `.example`，并确保导出的 `name` 与文件名一致：

```text
202608300001-create-audit-logs.ts.example
→ 202608300001-create-audit-logs.ts
```

## 写出固定结构

Migration 必须直接声明这次历史操作的完整结构，不能 import 或遍历会继续演化的 collection schema、field definition、model definition 或注册列表。

```ts
import {
  defineMigration,
  type MigrationDefinition,
} from '@nocobase/app-database';

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

export default migration;
```

已有 collection 使用明确的 alter、field、index、constraint 或 metadata 操作。`down` 按安全的反向依赖顺序撤销 `up`；确实不可逆时，在代码、测试和变更说明中明确限制。

## 声明来源

Server 插件使用 package-relative 目录：

```ts
database: {
  migrations: './database/migrations',
}
```

路径必须以 `./` 开头。缺失目录、空目录和 `.ts.example` 文件不会产生可执行 Migration。目标 App 仍需显式注册该 Server 插件。

## 测试真实结果

每个 Migration 都应在真实测试数据库上执行，并验证：

- `up` 后的表、字段、类型、索引和约束；
- 物理 schema 与 App metadata 一致；
- 可逆时执行 `down` 并确认清理结果；
- 名称、checksum 和历史记录符合 runner 契约；
- 方言相关能力有明确处理和覆盖。

只验证文件可以 import，或只调用 `validateMigrations()`，不能证明 Migration 正确。目标 App 最后运行自己的 migration、typecheck、test 和 build，并按风险验证真实升级路径。

## Agent 自检

- 这是结构变化，而不是初始数据；
- 已确认旧 Migration 是否仍可编辑；
- 文件名、导出的 `name` 和执行顺序稳定；
- Migration 不读取任何实时 runtime schema；
- `up` 和 `down` 操作显式且依赖顺序安全；
- 真实数据库测试覆盖物理 schema 和 metadata；
- App Agent 需要知道的新数据前置条件已写入 Plugin Skill。

返回[数据库模块选择](./database.md)，或继续编写[插件 Seed](./database-seeds.md)。
