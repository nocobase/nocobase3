---
title: Agent 验证指南
description: 按数据库改动类型选择测试、类型检查、构建和多方言验证，并定义交付完成条件。
---

# Agent 验证指南

验证范围由改动行为决定。不要只运行格式化，也不要在普通局部改动后无差别运行整个 workspace。

## 验证矩阵

| 改动                         | 最低验证                                                         |
| ---------------------------- | ---------------------------------------------------------------- |
| Database 配置或 Manager 使用 | Typecheck + 对应连接测试                                         |
| Builder Schema 行为          | Unit + SQLite integration                                        |
| Query 行为                   | Integration test                                                 |
| Migration                    | `up` + 物理 Schema/Metadata 断言；可逆时测试 `down`              |
| Seed                         | 首次执行 + 重复执行 + 失败不写历史                               |
| Transaction                  | commit + rollback 集成测试                                       |
| Metadata Store/Service       | validation + revision/CAS + transaction；持久后端还要测试 reopen |
| Schema Inspector             | 真实数据库集成测试                                               |
| 方言专用行为                 | 对应数据库方言测试                                               |
| 公共导出或类型               | 当前包和直接消费者的 typecheck/build                             |

## 修改 `@nocobase/db` 本身

```bash
pnpm --filter @nocobase/db lint
pnpm --filter @nocobase/db typecheck
pnpm --filter @nocobase/db test
pnpm --filter @nocobase/db build
```

也可以运行包内聚合检查：

```bash
pnpm --filter @nocobase/db check
```

数据库行为先运行 SQLite 集成测试：

```bash
pnpm --filter @nocobase/db test:integration
```

变更涉及方言差异时，再启动并运行对应的 PostgreSQL、MySQL、Oracle 或 SQL Server 测试。SQLite 通过不代表其他方言已经验证。

## 业务包使用 DB API

按照仓库要求验证修改包和必要的直接消费者：

```bash
pnpm --filter <package-name> lint
pnpm --filter <package-name> typecheck
pnpm --filter <package-name> test
pnpm --filter <package-name> build
```

Migration 测试必须在真实测试数据库执行 `up`；可逆时执行 `down`。不要只断言 Builder 返回值，要检查真实表、列、索引、约束和相应 Metadata。

## 完成条件

Agent 交付时应说明：

- 修改或新增了哪些文件；
- 为什么选择 Migration、Seed、Query、Metadata 或其他实现层；
- 新增了哪些测试，覆盖了哪些行为；
- 实际运行了哪些命令；
- 实际验证了哪些数据库方言；
- 哪些检查没有运行及原因。
