---
title: DB 包源码与测试布局
description: 按职责说明 @nocobase/db 的源码模块、测试分层和新增实现时应修改的位置，避免依赖容易变化的逐文件目录清单。
---

# DB 包源码与测试布局

本页帮助维护者和 Agent 定位实现与测试。它只列稳定的职责边界；具体文件以源码目录为准。

## 源码模块

```text
src/
├── database/          DatabaseManager、DatabaseConnection 和连接生命周期
├── collection/        Collection DSL、编译、解析和 Registry
├── metadata/          Metadata Document、Store、Service 和内部存储实现
├── naming/            逻辑标识符到物理标识符的确定性映射
├── query/             QueryAdapter 契约和内部 Knex 实现
├── schema/            Schema operation、Schema Inspector 和内部 Knex 实现
├── migration/         Migration 定义、加载、锁、历史和执行器
├── seed/              Seed 定义、加载、锁、历史和执行器
└── index.ts           包级公开出口
```

`src/index.ts` 是唯一的 package 公开入口；`internal/` 下的实现不提供 package export。新增公开符号时必须显式加入根入口并更新 API 基线。

### `database/`

负责多 Connection 管理、配置校验、事务和底层 client 生命周期。Knex 连接实现位于 `database/internal/knex/`；`DatabaseManager` 的便捷入口最终都委托给某个 `DatabaseConnection`。

### `collection/`

- `builder/` 提供逻辑 Collection DSL；
- `compiler/` 把 DSL 编译成 Schema operation；
- `fluent/` 实现链式 Collection 和 Field 定义；
- `resolver/` 合并 Physical Schema 与 Metadata Document；
- `registry/` 缓存解析结果并处理失效。

### `metadata/`

负责 Metadata Document 的定义、校验和存储。Module 与 In-memory Store 是公开实现；Database 与事务覆盖 Store 位于 `metadata/internal/`，由 Connection 生命周期组合。`legacy-extraction.ts` 是显式迁移旧 Collection 定义的专用工具，不是运行时 fallback。

### `query/`

提供数据库层 QueryAdapter。它使用 Connection 命名规则，但不读取 Collection Metadata，也不提供 Repository 语义。Knex 实现位于 `query/internal/knex/`。

### `schema/`

Schema Adapter 执行 Builder 编译出的操作，capability planner 处理方言差异，`inspector/` 定义读取真实数据库结构的公共契约。Knex Adapter 和方言 Inspector 位于 `schema/internal/knex/`。Schema Inspector 使用物理名称，不负责补充 Metadata。

### `migration/` 与 `seed/`

两个模块都包含定义辅助、文件加载、执行锁、历史记录和执行器。Migration context 提供 `builder`、`query` 和事务 Connection；Seed context 提供 `query` 和事务 Connection。

包自己的 migration 和 seed 通常放在包级 `database/migrations/` 与 `database/seeds/` 中，由上层应用作为 Source 传给执行器；DB 包不扫描插件目录。

## 测试布局

```text
tests/
├── unit/              纯逻辑、契约、编译结果和 Store 行为
├── integration/       真实数据库上的 Builder、Query、解析和执行器行为
├── fixtures/          Resolver、Metadata 和场景测试数据
├── examples/          可运行的示例用例
└── playground/        本地探索代码，不作为正式断言
```

`tests/unit/` 和 `tests/integration/` 可按源码职责继续分目录，但不要在文档中维护完整测试文件名清单。

## 修改与验证对应关系

| 修改范围                            | 最低测试范围                                                  |
| ----------------------------------- | ------------------------------------------------------------- |
| Builder DSL、编译或 capability      | `tests/unit/builder/` 和 `tests/integration/builder/`         |
| QueryAdapter                        | `tests/integration/query/`，纯转换逻辑另补 unit test          |
| Collection Resolver 或 Registry     | `tests/unit/collection/` 和相关 integration test              |
| Metadata Document、Store 或 Service | `tests/unit/metadata/` 和相关 integration test                |
| Schema Inspector                    | `tests/unit/schema/inspector/` 和 `tests/integration/schema/` |
| Migration                           | `tests/unit/migration/` 和 `tests/integration/migration/`     |
| Seed                                | `tests/unit/seed/` 和 `tests/integration/seed/`               |

## Agent 约束

- 新增公开 API 时，显式加入根入口并更新 API 基线；不要让调用方导入深层实现文件。
- QueryAdapter 测试不得假设它读取 Collection Metadata；需要 Collection 解析时使用 `connection.collections`。
- Migration 必须自包含并固定描述当次 Schema 变化，不得导入会继续演化的运行时 Collection 定义。
- 跨数据库行为优先在真实数据库 integration test 中验证；不要用只记录调用的假 Adapter 代替方言行为测试。

## 相关文档

- [集成测试](./integration-testing.md)
- [Migration 维护](./migration-maintenance.md)
- [Seed 维护](./seed-maintenance.md)
- [Agent 验证清单](../agent/verification.md)
