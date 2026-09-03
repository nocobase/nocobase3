---
title: 命名概念
description: 区分逻辑名称、Connection 相对查询标识符和数据库物理名称，并说明 Builder、Query 与 Inspector 的命名边界。
---

# 命名概念

`@nocobase/db` 使用确定性规则在 Collection、Field 的逻辑名称与数据库物理名称之间转换。不同 API 接受的名称层级不同，不能混用。

## 三种名称语义

| 名称层级                  | 示例                            | 使用位置                                     |
| ------------------------- | ------------------------------- | -------------------------------------------- |
| 逻辑名称                  | `orderItems`、`createdAt`       | Collection DSL、Builder、Metadata、Relation  |
| Connection 相对查询标识符 | `orderItems`、`createdAt`       | Query 表来源和字段表达式                     |
| 完整物理名称              | `app_order_items`、`created_at` | Schema Inspector 结果、底层 client、原始 SQL |

逻辑名称和 Connection 相对查询标识符可能写法相同，但语义不同：Builder 可以读取 Collection 局部 naming；Query 只应用 Connection naming。

## 确定性规则

```text
effectiveNaming = merge(connection.naming, collection.naming)
normalized(name) = effectiveNaming.underscored ? snake_case(name) : name
physicalTable = effectiveNaming.tablePrefix + normalized(collectionName)
physicalColumn = normalized(fieldName)
```

例如默认 `underscored: true` 时：

```text
orderItems.createdAt -> order_items.created_at
```

设置 `tablePrefix: 'app_'` 后：

```text
orderItems.createdAt -> app_order_items.created_at
```

Collection 可以覆盖 Connection 的 `underscored` 和 `tablePrefix`。没有配置时，`underscored` 默认为 `true`，`tablePrefix` 默认为空字符串。

## API 边界

| API                          | 输入名称                  | 使用 Connection naming | 使用 Collection 局部 naming |
| ---------------------------- | ------------------------- | ---------------------- | --------------------------- |
| `connection.builder`         | Collection / Field 逻辑名 | 是                     | 是                          |
| `connection.query`           | Connection 相对查询标识符 | 是                     | 否                          |
| `connection.collections`     | Collection 逻辑名         | 是                     | 是                          |
| `connection.schemaInspector` | 物理名称                  | 否                     | 否                          |
| `connection.client()`        | 物理名称                  | 否                     | 否                          |

这一区分是使用 DB API 时最重要的约束。不要把 Inspector 返回的完整物理表名直接传给普通 Query；Query 会把它再次当作相对标识符应用 Connection naming。

## 逻辑引用

Builder 中以下位置都使用逻辑名称：

- Collection 和 Field 的 `name`；
- Index 与 Constraint 的字段；
- Relation 的 `target`、`through`、`foreignKey`、`sourceKey`、`targetKey` 和 `otherKey`；
- 结构化 View 的 `from`、`select` 和 `filter`。

跨 Collection 引用使用目标 Collection 自己的 effective naming，不会把当前 Collection 的前缀直接套给目标。

## 不支持任意物理映射

Collection DSL 不支持自定义 `tableName`、`columnName` 或 `namingStrategy`。不规则外部 Schema 应通过 Schema Inspector 和 `connection.collections` 读取；必须直接使用完整物理名称时进入 `connection.client()` 这一显式底层边界。

## 修改 naming 配置

Collection 创建后再修改 `underscored` 或 `tablePrefix`，可能改变表、列、Index、Constraint、Foreign Key 和 View 引用。配置变更本身不会迁移已有数据库，生产环境必须通过显式 Migration 完成相应的物理 Schema 变更。

## 使用规则

- Builder、Metadata、Relation 和结构化 View 中始终使用逻辑名。
- Query 表来源使用不带 Connection 前缀的相对标识符。
- Schema Inspector 和底层 client 使用完整物理名称。
- 不要生成 `tableName`、`columnName` 或自定义 naming strategy。
- 修改现有数据库的 naming 配置前，先编写并审查 Migration。

## 继续阅读

- [`underscored` 命名规则](./underscored.md)
- [`tablePrefix` 表前缀](./table-prefix.md)
- [Builder 命名](../../builder/naming.md)
- [Query 命名归一化](../../query/naming.md)
