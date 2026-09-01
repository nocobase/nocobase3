---
title: Collection Resolver 设计
description: 说明物理 Schema、命名规则和补充 Metadata 如何合并为完整 CollectionDefinition。
---

# Collection Resolver 设计

> 本文描述目标设计，当前 `@nocobase/db` 尚未提供正式的 `CollectionResolver`。

`CollectionResolver` 是纯合并和校验层：

```text
PhysicalCollectionSchema
  + NamingOptions
  + CollectionMetadataDocument
  -> CollectionDefinition
```

它不执行 introspection，不写 Metadata Store，也不缓存结果。

Resolver 还接收只读的 Naming Index 上下文，用于将 foreign key 引用的物理表和字段转换为目标 Collection
自己的逻辑名称：

```ts
export interface CollectionResolutionContext {
  resolvePhysicalCollection(
    tableName: string,
    schema?: string,
  ): CollectionNamingIdentity | undefined;
}

export interface CollectionNamingIdentity {
  name: string;
  naming: Required<NamingOptions>;
}
```

这避免用 source Collection 的命名规则错误解析 target 表。找不到显式 Metadata 时，Naming Index 使用
Connection 默认规则生成 identity。

## 合并顺序

1. 使用 Connection 级 `naming` 作为默认值。
2. 应用 Collection Metadata 中的确定性 `naming` 覆盖。
3. 将物理 `tableName` 和 `columnName` 转换为逻辑名，并通过 Naming Index 解析外键 target。
4. 从物理 Schema 生成 Field、index 和 constraint。
5. 将 `fields` 中的补充 Metadata 合并到物理 Field。
6. 增加 `relations`。
7. 执行冲突、drift 和 relation 校验。

物理事实不会被 Metadata 覆盖。例如 Metadata 不能改变 `nullable`、物理类型、主键、索引和外键。

## 逻辑命名

`underscored: true` 时，物理 `order_items` 解析为逻辑 `orderItems`，`created_at` 解析为
`createdAt`。`underscored: false` 时保留原名。`tablePrefix` 只从表名头部移除，不影响 Field。

任意 `tableName` 和 `columnName` 映射不属于第一版设计。如果反向命名不能确定唯一逻辑名，Resolver 应报告
冲突，不得静默猜测。

反向命名不是天然双射。例如多个异常物理列名可能同时归一化成同一个逻辑名。Resolver 必须先转换全部字段，再检查
逻辑名唯一性；冲突时停止解析。

## Field 解析

物理 Field 首先生成可移植 Field 定义：

```text
Physical dataType      -> FieldDefinition.type
Physical nullable      -> FieldDefinition.nullable
Physical default       -> FieldDefinition.defaultValue / db.defaultExpression
Physical nativeType    -> FieldDefinition.db.nativeType
Physical comment       -> FieldDefinition.db.comment
```

Metadata 只合并 `title` 和 `description`。`fields` 项找不到物理 Field 时是 Schema drift，
不得将其隐式解释为虚拟字段。

## Index 与 constraint

Inspector 返回的物理列名必须转换为逻辑 Field 名。主键、unique、foreign key 和普通 index 保留原始字段
顺序。普通 unique constraint 与 unique index 保持区别；表达式索引不能伪装成普通 Field index，原始表达式
保存在 `expressions` 或明确的方言扩展中。

Relation Metadata 表达应用关联，物理 foreign key 表达数据库约束，两者可以同时存在：

```text
RelationFieldDefinition       应用层关联
ForeignKeyConstraintDefinition 物理外键事实
```

有物理外键不代表必须自动生成 relation。只有明确可推导且没有命名冲突时，工具才可将它作为候选；经确认后写入
Metadata。

### Relation 分阶段校验

Relation 可能形成循环依赖，例如 `users.department -> departments` 和 `departments.owner -> users`。因此
`get('users')` 不能为了验证 target 而递归等待 `get('departments')`，否则会形成循环 Promise。

校验分为两阶段：

1. Resolver 在解析单个 Collection 时完成本地结构校验，包括字段重名、`sourceKey` 和 `foreignKey` 是否存在。
2. `CollectionRelationValidator` 在 Metadata 写入、显式模型审计、`scan()` 或 `export()` 时完成跨 Collection
   校验，包括 target 是否存在、`targetKey` 是否存在和 through Collection 是否有效。

普通 `get()` 不递归解析整张关系图。跨 Collection 校验按图遍历，并通过 visited 状态处理循环关系。

## View 与写入能力

Inspector 负责报告物理对象是 table、view 还是 materialized view，Resolver 将其保留为
`CollectionDefinition.kind`。第一版不在 Collection Metadata 中保存 `writable`，也不由 Resolver
推导统一的记录写权限。记录 mutation 能力由数据库、Query 执行结果和上层权限模型负责；
`schemaManagement` 仅控制 DDL 和 Migration，不能据此判断业务记录是否可写。

## 校验结果

第一版对单个 Collection 的本地结构默认严格校验，不完整结果不能静默进入 Registry。跨 Collection 错误由
`CollectionRelationValidator` 汇总。错误应带稳定 code 和可定位 path，至少覆盖：

- `COLLECTION_SCHEMA_DRIFT`；
- `COLLECTION_NAME_CONFLICT`；
- `COLLECTION_FIELD_CONFLICT`；
- `COLLECTION_RELATION_INVALID`；

无法归一化的物理类型以 `type: 'native'` 和 `db.nativeType` 进入解析结果，不会仅因为类型未知而阻止读取。
只有 Builder 试图执行不可移植的 Schema 修改时，才需要按方言能力拒绝操作。

## 兼容当前 Metadata Store

当前 Store 仍然返回完整 `CollectionDefinition`。迁移期 Resolver 只从中提取 Collection/Field 的
`title`、`description`、relations 和 `naming`；物理 Field、index 和 constraint 仍以 Inspector 为准。

Metadata Store 切换到 `CollectionMetadataDocument` 后，Resolver 的物理输入和完整输出不变。

## 相关文档

- [Schema Inspector 设计](./schema-inspector.md)
- [Collection Registry 设计](./collection-registry.md)
- [Metadata Store 设计](./metadata-store.md)
- [Collection 解析生命周期](./collection-resolution.md)
