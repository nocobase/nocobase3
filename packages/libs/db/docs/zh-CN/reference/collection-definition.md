---
title: CollectionDefinition 用法
description: 说明 CollectionDefinition 中名称、类型、Metadata、数据库配置、字段、约束、索引和 View 的语义。
---

# CollectionDefinition 用法

`CollectionDefinition` 是 Collection Object DSL 和解析结果共享的结构。本文解释各部分的用途，不复制完整接口；精确属性和联合类型以 TypeScript 声明为准。

## 理解结构层次

| 部分                    | 表达内容                            | 名称语义       |
| ----------------------- | ----------------------------------- | -------------- |
| `kind`                  | table、view 或 materialized view    | —              |
| `name`                  | Collection 名称                     | 逻辑名         |
| `naming`                | 当前 Collection 的命名覆盖          | —              |
| `title` / `description` | 应用层补充信息                      | —              |
| `db`                    | Schema、数据库 comment 等数据库配置 | 物理配置       |
| `fields`                | 普通字段和关系字段                  | 逻辑字段名     |
| `constraints`           | primary、unique、foreign key、check | 逻辑引用       |
| `indexes`               | 查询性能索引                        | 逻辑字段名     |
| `view`                  | 结构化或原始 View 定义              | 取决于表示方式 |

Builder API 通常通过第一个参数接收 Collection 名称，因此创建时不必在 definition 中重复写 `name`。从 `connection.collections` 读取的解析结果会包含完整名称和物理信息。

## 使用逻辑名称

Collection DSL 中以下位置都使用逻辑名：

- `fields[].name`
- `constraints[].fields`
- `indexes[].fields`
- foreign key 引用的 Collection 和字段
- 结构化 View 的来源、选择字段和筛选字段

不要在这些位置写 Inspector 返回的物理表名或列名。物理名称由 Connection 与 Collection 的 effective naming 确定性生成。

## 区分应用信息和数据库配置

`title` 和 `description` 是供 UI、业务逻辑和自动化工具理解 Collection 的应用层 Metadata，不等同于数据库 comment。

需要指定数据库 Schema 或数据库对象 comment 时使用 `db`：

```ts
{
  title: 'Orders',
  db: {
    schema: 'public',
    comment: 'Application orders',
  },
}
```

Collection 级 `naming` 只应在单个 Collection 确实需要覆盖 Connection 默认值时使用。它不支持任意指定物理表名。完整规则见[命名与跨数据库兼容](../builder/portability.md)。

## 组织字段、约束和索引

- 字段的数据类型、可空性和默认值放在 `fields`。
- 数据完整性要求放在 `constraints`；unique 不是普通性能索引。
- 查询性能需求放在 `indexes`。
- Relation 参数始终引用逻辑 Collection 和字段。

字段与 Relation 的选择见 [FieldDefinition](./field-definition.md)，约束和索引的区别见[在 Migration 中管理 Collection Schema](../builder/collection-schema.md)。

## 定义 View

新建 View 时优先使用结构化 `view.as`，让 Builder 处理命名和参数：

```ts
{
  kind: 'view',
  view: {
    as: {
      from: 'users',
      select: ['firstName'],
      filter: { active: true },
    },
  },
}
```

`view.asRaw` 用于无法由结构化 DSL 表达的方言 SQL，也用于 Resolver 保存 Inspector 读取到的物理 View SQL。原始 SQL 不可移植，并且不属于可编辑的 Collection Metadata。

## 使用边界

- Object DSL 适合 HTTP、CLI、`collection.json` 和跨进程序列化；TypeScript Migration 通常优先使用 Fluent DSL。
- `kind` 描述物理对象类型，不是统一的记录写权限模型。
- Inspector 可能把 partitioned table 或 foreign table 解析为 `kind: 'table'`，并在物理信息中保留更精确的类型；这不表示 Builder 能创建相同对象。
- 不要生成 `tableName` 或 `columnName` 映射。
- `renameCollection()` 当前只支持 Table Collection，并会按确定性规则同步处理物理表和 Metadata。

完整创建示例见[在 Migration 中管理 Collection Schema](../builder/collection-schema.md)。
