---
title: v2 到 v3 的数据源模型变化
description: 记录 NocoBase v2 到 v3 在 DataSource、Collection、Field 和数据查询模型上的历史变化；不作为当前 API 使用指南。
---

# v2 到 v3 的数据源模型变化

> 本文是版本演进记录，不是当前 API 合同。编写新代码时，请从 [DB 文档概览](../../overview.md)、[Collection 概念](../../concepts/collection.md)和 [QueryAdapter](../../query/overview.md)开始。

## 变化概览

| 主题       | v2                                              | v3                                                             |
| ---------- | ----------------------------------------------- | -------------------------------------------------------------- |
| 数据源范围 | 通过统一 DataSource 接入数据库、HTTP API 等来源 | `@nocobase/db` 只处理 SQL 数据库；其他来源由独立插件或服务处理 |
| Collection | 应用运行依赖的核心模型                          | 由物理 Schema 和补充 Metadata 解析出的数据库结构说明           |
| Field      | 还包含邮件、密码、图标等应用类型                | 对应真实数据库字段；应用类型不属于 DB 包                       |
| 数据查询   | Sequelize Model 和 Repository                   | 数据库层 QueryAdapter                                          |
| 查询结果   | Sequelize Model 实例                            | 普通 JavaScript 对象                                           |

## v2：应用围绕 Collection 运行

v2 用一套抽象访问多种数据来源：

```text
DataSource
  -> Collection
  -> Field
  -> Repository
  -> Model
```

Collection 不只是数据库表的说明，数据查询、API、权限和前端界面都会使用它。接入一种新数据源通常需要实现整套接口。

## v3：DB 包直接面向 SQL 数据库

v3 的 `@nocobase/db` 提供数据库连接、Schema Builder、QueryAdapter、Migration、Seed，以及数据库结构解析能力。查询不要求先创建完整 Collection：

```ts
const orders = await db
  .query()
  .selectFrom('orders')
  .select(['id', 'status'])
  .execute();
```

当前 Collection 由两类信息合并得到：

```text
Resolved Collection = Physical Schema + Metadata Document
```

- Physical Schema 是数据库中真实存在的表、字段、索引和约束；
- Metadata Document 补充标题、描述和关系等数据库不能完整表达的信息；
- Resolved Collection 用于帮助开发者、工具和 Agent 理解数据库结构。

## 当前文档

- [Collection 概念](../../concepts/collection.md)
- [Collection Metadata 概念](../../concepts/metadata.md)
- [QueryAdapter](../../query/overview.md)
- [Resolved Collections](../../collections/overview.md)
- [Collection Metadata](../../collection-metadata/overview.md)
