---
title: NocoBase 数据源 v2 和 v3 的区别
description: 简单介绍 NocoBase v2 和 v3 在数据源与 Collection 设计上的主要区别。
---

# NocoBase 数据源 v2 和 v3 的区别

## 重要说明

DataSource

- **v2**：使用统一的 DataSource 接口接入数据库、HTTP API 等不同数据源。
- **v3**：只处理 SQL 数据库，其他数据源由独立的插件或服务处理。

Collection

- v2 的前后端都依赖 Collection；
- v3 的 Collection 主要用于描述数据表结构和关系，帮助开发者和 AI 理解数据库结构。

## 主要区别

|              | v2                                 | v3                       |
| ------------ | ---------------------------------- | ------------------------ |
| 支持的数据源 | 数据库、HTTP API 等                | 只处理 SQL 数据库        |
| Collection   | 应用运行必需的核心模型             | 对数据库结构的说明       |
| Field        | 包含邮件、密码、图标等应用类型     | 直接对应真实的数据库字段 |
| 数据查询     | 通过 Sequelize Model 和 Repository | 通过轻量 Query Builder   |
| 查询结果     | Sequelize Model 实例               | 普通 JavaScript 对象     |

## v2：应用依赖 Collection

v2 希望用一套方式访问数据库、HTTP API 等不同数据来源：

```text
数据源
  -> Collection
  -> Field
  -> Repository
  -> Model
```

Collection 不只是数据库表的说明。数据查询、API、权限和前端界面都会使用它。

因此，接入一种新数据源时，需要实现一整套接口，工作量比较大。

v2 的 Field 还包含邮件、密码、图标等应用类型。系统需要把这些类型转换成真实的数据库字段。

## v3：直接使用数据库

v3 的 `@nocobase/db` 只负责 SQL 数据库。应用可以直接查询数据库，不需要先创建完整的 Collection。

```ts
const orders = await db
  .query()
  .selectFrom('orders')
  .select(['id', 'status'])
  .execute();
```

查询结果是普通 JavaScript 对象。

v3 的 Field 直接对应真实的数据库字段，不再有邮件、密码、图标等应用类型，也不需要进行类型转换。

## v3 的 Collection 从哪里来

v3 的 Collection 由两部分合并得到：

```text
Resolved Collection = Physical Schema + Metadata Document
```

- **Physical Schema**：数据库里真实的表、字段、类型和约束；
- **Metadata Document**：补充数据库里没有的标题、描述和关系；
- **Resolved Collection**：最终得到的数据库模型说明。

它主要帮助开发者和 AI 看懂数据库，而不是应用运行时必须依赖的模型。

## 其他数据来源

HTTP API 等非 SQL 数据来源不再放进数据库包，而是由独立的插件或服务处理。

## 总结

> v2 围绕 Collection 构建应用；v3 直接使用数据库，Collection 主要用于描述和理解数据库。
