---
title: Seed 维护清单
description: 面向 DB 包维护者和 Agent 的 Seed 接口、顺序、事务、历史记录与测试检查清单。
---

# Seed 维护清单

本页面向维护 `@nocobase/db` Seed 模块的贡献者和 Agent。业务代码的公开入口见 [Seed 概览](../seed/overview.md)。

## 公开 API

- `defineSeed(definition)`：定义 seed 文件。
- `loadSeeds(options)`：加载、校验并排序 seed。
- `validateSeeds(options)`：只执行加载和校验。
- `createSeeder(options)`：创建 seed runner。
- `seeder.run()`：执行所有 pending seeds。

## 稳定规则

- Seed 文件必须 default export `defineSeed({})`。
- 文件名主体必须和 `name` 一致。
- 所有 package 的 `name` 全局唯一，并按 `name` 字符串排序。
- `packageName` 只归类，不参与排序、identity 或 checksum。
- 单目录 API 未传 `packageName` 时默认为 `app`。
- Seed context 只暴露 `query` 和 `connection`，不暴露 `builder`。
- 默认每个 seed 使用独立事务。
- Seed 数据写入和 history 写入必须共享事务连接。
- Seed 失败时不写 history，后续 seed 停止。
- History 中其他 package 的 seed 不要求出现在当前 sources，支持逐个安装插件。
- 已发布的 seed 只能向后追加，不能修改或插队。
- 不提供 rollback；需要纠正数据时新增 seed，schema 升级数据使用 migration。

## 默认表

```text
__nocobase_seeds
__nocobase_seed_lock
```

History 字段：

```text
id
package_name
name
checksum
executed_at
duration_ms
```

## 测试清单

- `defineSeed()` 内部标记。
- plain object 拒绝加载。
- 文件名和 `name` 一致性。
- 多 package 全局排序和重名校验。
- `packageName` 和 source options 校验。
- 执行成功后记录 history，再次执行时跳过。
- checksum 变化时报错。
- 失败时数据和 history 共同回滚。
- 失败后可以重新执行。
- `transaction: false` 可执行并记录 history。
