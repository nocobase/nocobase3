---
title: 编写插件 Seed
description: 在 NocoBase v3 插件中编写确定、可重复验证的初始数据 Seed，并明确重复执行、已有数据和应用前置条件。
---

# 编写插件 Seed

Seed 写入插件运行所必需的初始记录，例如默认配置、基础规则或固定系统记录。表、字段、索引和约束属于 [Migration](./database-migrations.md)；测试夹具和演示数据通常只属于测试 setup。

## 先确认是否真的需要 Seed

适合 Seed：

- 没有这些固定记录，插件无法正常工作；
- 安装后必须存在的默认配置或系统记录；
- 与插件公开契约绑定的稳定初始数据。

不适合 Seed：

- 创建或修改数据库结构；
- 只为演示页面准备样例记录；
- 每次测试需要重置的 fixture；
- 可以在首次业务操作时自然创建的用户数据。

## 编写确定的数据操作

```ts
import { defineSeed, type SeedDefinition } from '@nocobase/app-database';

const seed: SeedDefinition = defineSeed({
  name: '202608300002-seed-audit-settings',
  async run({ query }) {
    await query
      .insertInto('auditSettings')
      .values({ key: 'retentionDays', value: '30' })
      .execute();
  },
});

export default seed;
```

关键数据应固定且可复现。不要用当前时间、随机数或外部服务生成记录 identity，除非这就是明确业务契约。根据 runner 和业务要求，明确重复执行策略：拒绝重复、基于唯一键跳过，或以确定方式更新。不要默默覆盖用户已经修改的数据。

## 声明与执行顺序

在 `server/plugin.ts` 声明：

```ts
database: {
  seeds: './database/seeds',
}
```

Seed 依赖的结构必须由更早的 Migration 建立。路径必须 package-relative 且以 `./` 开头；`.ts.example` 文件不会执行。

目标 App 使用自己的 Seed 命令：

```bash
pnpm --filter <target-app> seed
```

## 测试行为而不是文件

测试至少验证：

- 前置 Migration 完成后 Seed 能成功运行；
- 只产生预期记录；
- 唯一键、已有数据和重复执行符合明确策略；
- 失败不会留下误导性的部分状态；
- App 的查询和业务能力能观察到这些初始记录。

若 Seed 建立的是 App Agent 使用插件前必须存在的数据，应在 Plugin Skill 的 prerequisites 和 verification 中说明；不要要求 App Agent猜测内部 Seed 文件。

## Agent 自检

- Seed 不承担 schema 变化；
- 数据是插件必需的，不是测试或演示 fixture；
- identity、值和重复执行策略确定；
- 不意外覆盖应用或用户数据；
- 测试覆盖首次执行和已有数据；
- Plugin Skill 描述了可观察的前置结果，而不是内部实现路径。

返回[数据库模块选择](./database.md)，或阅读[测试和验证插件](./testing.md)。
