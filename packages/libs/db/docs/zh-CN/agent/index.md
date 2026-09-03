---
title: 数据库任务入口
description: 根据 Schema、数据访问、Seed、Metadata 和外部数据库任务选择 @nocobase/db 的推荐入口与用法文档。
---

# 数据库任务入口

本页只负责把任务路由到当前公开用法。项目约束以适用范围内的 `AGENTS.md` 为准，精确接口以 `@nocobase/db` 的 TypeScript 类型声明为准。

先根据业务目标阅读[任务路由](./task-router.md)。如果尚未理解 Collection、Metadata 或名称层级，再阅读[核心概念](../concepts/README.md)。

## 选择任务

| 任务                            | 阅读                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| 创建或修改业务 Schema           | [实现 Schema 变更](./implement-schema-change.md)                  |
| 编写运行时查询和事务            | [实现数据访问](./implement-data-access.md)                        |
| 添加安装默认数据                | [实现 Seed 数据](./implement-seed-data.md)                        |
| 读取 Collection 或维护 Metadata | [Collection 与 Metadata](./work-with-collections-and-metadata.md) |
| 接入外部数据库                  | [接入外部数据库](./connect-external-database.md)                  |
| 检查当前 API 的使用边界         | [实现护栏](./guardrails.md)                                       |
| 选择与改动匹配的验证范围        | [验证指南](./verification.md)                                     |

查看能力关系时阅读[整体概览](../overview.md)；按 API 名称定位文档时使用[公开 API 导航](../reference/api-index.md)。
