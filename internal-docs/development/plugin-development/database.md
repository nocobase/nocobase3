---
title: Database 模块选择
description: 面向 AI Agent 的 NocoBase v3 插件 Database 导航，区分不可变 Migration、初始数据 Seed、测试 fixture 和运行时业务数据。
---

# Database 模块选择

插件 Database capability 包含 Migrations 和 Seeds。Migration 管理不可变 schema 历史，Seed 写入插件必需的初始数据；测试 fixture 和用户业务数据不属于发布 Seed。

## 选择 Migration 或 Seed

| 变化                                 | 使用               | 继续阅读                                       |
| ------------------------------------ | ------------------ | ---------------------------------------------- |
| 表、字段、关系、索引、约束、metadata | Migration          | [编写插件 Migration](./database-migrations.md) |
| 已有结构中的必要初始记录             | Seed               | [编写插件 Seed](./database-seeds.md)           |
| 单元/集成测试样例数据                | 测试 setup/factory | [测试和验证插件](./testing.md)                 |
| 用户在运行时创建或修改的数据         | Service/Route/Job  | [Server 模块选择](./server.md)                 |

执行顺序是：

```text
Migration establishes structure → Seed inserts required records
```

Seed 不能代替 Migration 创建结构，Migration 不能读取会继续演化的 runtime schema。两者都由 Server plugin declaration 指向 package-relative locations；目标 App 显式注册插件后，使用自己的 migrate/seed scripts 执行。

## 创建安全的空能力

`plugin:create --with database` 会生成 `database/migrations`、`database/seeds`、Server declaration 和测试。示例以 `.ts.example` 结尾，因此不会自动执行。Agent 只有在真实 schema/数据契约明确后才删除 `.example` 并替换完整内容。

## 最终验证

Migration 使用真实测试数据库验证物理 schema、metadata、`up` 和 `down`。Seed 验证首次执行、已有数据和重复执行策略。`server:inspect` 只能确认 locations，不能证明任何数据库操作正确。

数据库前置条件如果影响 App Agent 使用插件，应更新插件顶层 `skills/`；Skill 描述可观察 prerequisite，不要求 App Agent读取 Migration 源码。
