---
title: FieldDefinition 用法
description: 说明普通字段、原生数据库类型、物理检查信息和四类 Relation Field 的选择与名称语义。
---

# FieldDefinition 用法

FieldDefinition 描述普通字段，RelationFieldDefinition 描述 Collection 关系。本文解释如何选择和组合字段属性；精确字段类型、可选属性和引用动作以 TypeScript 声明为准。

## 定义普通字段

```ts
{
  name: 'eventName',
  type: 'string',
  length: 120,
  nullable: false,
  title: 'Event name',
}
```

常用属性可以分为三组：

| 目的     | 属性示例                                                           |
| -------- | ------------------------------------------------------------------ |
| 数据结构 | `type`、`nullable`、`defaultValue`、`length`、`precision`、`scale` |
| 键和访问 | `primaryKey`、`autoIncrement`、`unique`、`index`                   |
| 应用说明 | `title`、`description`                                             |

支持的完整 `FieldType` 集合以类型声明为准。跨数据库代码优先使用通用类型；`native` 只用于明确依赖某一方言的数据库类型。

## 理解逻辑名和物理列名

`name` 是逻辑字段名。默认 `underscored: true` 时，`eventName` 对应物理列 `event_name`；`underscored: false` 时保持原样。

字段不支持单独设置 `columnName` 或 `naming`。不要自行预测或保存物理列名；需要检查实际数据库列时使用 Schema Inspector。

## 区分应用 Metadata 和数据库信息

`title`、`description` 是应用层 Metadata，不等同于数据库结构。数据库原生类型或数据库 comment 放在 `db`：

```ts
{
  name: 'ipAddress',
  type: 'native',
  db: {
    nativeType: 'inet',
    comment: 'Client IP address',
  },
}
```

Resolver 还会在 `db` 中保留 Inspector 读取到的 default expression、generated column 和原生类型 Schema 等物理事实。这些值用于描述数据库现状，不会写入补充 Metadata，也不应被重新解释成 virtual Field。

## 选择 Relation 类型

| 关系            | 本地物理列 | 关键引用                              |
| --------------- | ---------- | ------------------------------------- |
| `belongsTo`     | 默认创建   | target、foreignKey、targetKey         |
| `hasOne`        | 默认不创建 | target、foreignKey、sourceKey         |
| `hasMany`       | 默认不创建 | target、foreignKey、sourceKey         |
| `belongsToMany` | 默认不创建 | target、through、foreignKey、otherKey |

Relation 的 `target`、`through`、`sourceKey`、`targetKey`、`foreignKey` 和 `otherKey` 都是逻辑引用：

- `target` 指向目标 Collection。
- `through` 指向中间 Collection。
- `belongsTo.foreignKey` 指向当前 Collection 的本地字段。
- `hasOne` 和 `hasMany` 的 `foreignKey` 指向目标 Collection 上的字段。
- `belongsToMany` 的 `foreignKey` 和 `otherKey` 指向 through Collection 上的字段。

需要自定义外键行为时使用 `constraints`、`onDelete` 和 `onUpdate`。不要把物理表名或列名写进 Relation 参数。

## 常见选择

- 自增主键使用 `increments`，无需再模拟独立序列。
- `belongsTo` 需要本地外键列；可以显式定义该字段，但物理名称仍由逻辑名推导。
- `hasOne`、`hasMany` 和 `belongsToMany` 是关系 Metadata，不应假设它们在当前 Collection 上创建列。
- 数据完整性要求优先使用 constraint；`index` 主要表达访问性能需求。

Fluent DSL 写法和 Relation 示例见[在 Migration 中管理 Collection Schema](../builder/collection-schema.md)与[Builder 关系](../builder/relations.md)。
