---
title: Schema Inspector 物理 Schema 模型
description: 说明 PhysicalCollectionSchema 对表、视图、列、约束、索引、默认值和检查完整性的统一表示。
---

# Schema Inspector 物理 Schema 模型

Schema Inspector 用统一的只读模型表达各数据库可观察到的物理结构。字段名保留物理标识符，不经过 Collection 命名转换。

## Collection 标识与类型

```ts
interface PhysicalCollectionIdentity {
  tableName: string;
  schema: string;
}

type PhysicalCollectionKind =
  'table' | 'partitionedTable' | 'foreignTable' | 'view' | 'materializedView';
```

`PhysicalCollectionSummary` 在 identity 上增加 `kind` 和可选 comment，用于轻量分页列表。

## 完整结构

```ts
interface PhysicalCollectionSchema extends PhysicalCollectionSummary {
  viewDefinition?: string;
  columns: readonly PhysicalColumnSchema[];
  primaryKey?: PhysicalPrimaryKeySchema;
  uniqueConstraints: readonly PhysicalUniqueConstraintSchema[];
  indexes: readonly PhysicalIndexSchema[];
  foreignKeys: readonly PhysicalForeignKeySchema[];
  checkConstraints: readonly PhysicalCheckConstraintSchema[];
  inspection: PhysicalSchemaInspection;
}
```

空数组只有在对应 inspection aspect 为 `complete` 时，才能解释为数据库中确定没有该类对象。

## Column

`PhysicalColumnSchema` 同时保留跨数据库类型和方言原始信息：

- `columnName` 与 `ordinalPosition`；
- 统一的 `dataType`；
- `nativeType` 和可选 `nativeTypeSchema`；
- `nullable`、`autoIncrement`；
- `length`、`precision`、`scale`、`unsigned`；
- default expression 和可安全解析的 literal value；
- comment；
- generated expression 和 stored 状态。

无法安全还原为 literal 的默认值只保留 `expression`。数据库特有类型不能丢失原始 `nativeType`。

## Primary 与 unique constraint

Primary key 和 unique constraint 使用有序列名数组。复合约束不得按字母排序，也不得只保留第一列。

Unique constraint 还可以表达 `deferrable` 和 `initiallyDeferred`。它与普通 unique index 分开建模。

## Index

Index key 是 column 或 expression 二选一，并可保留排序和 nulls 顺序：

```ts
type PhysicalIndexKey =
  | { columnName: string; order?: 'asc' | 'desc'; nulls?: 'first' | 'last' }
  | { expression: string; order?: 'asc' | 'desc'; nulls?: 'first' | 'last' };
```

`PhysicalIndexSchema` 还可以保存：

- include columns；
- unique 标记；
- backing primary/unique constraint；
- index method；
- partial/filtered predicate。

Resolver 会跳过 `backsConstraint` 的 index，避免同一数据库完整性规则同时成为 constraint 和普通 index。

## Foreign key

Foreign key 保存：

- 本地物理列；
- 目标 `schema` 和 `tableName`；
- 目标物理列；
- `onDelete`、`onUpdate`；
- deferrable 状态。

本地列与目标列数量必须一致，并保持数据库定义顺序。Referential action 统一为 `noAction`、`restrict`、`cascade`、`setNull` 或 `setDefault`。

## Check constraint 与 View

Check constraint 保留数据库提供的原始 expression，不尝试把各方言 SQL 转为统一 AST。

View definition 同样保留数据库返回的 SQL 文本。只有 inspection status 为 `complete` 时，Resolver 才把它放入 resolved Collection。

## 检查完整性

`inspection.aspects` 分别描述：

- columns；
- primary key；
- unique constraints；
- indexes；
- foreign keys；
- check constraints；
- comments；
- view definition。

每项状态为 `complete`、`partial` 或 `unsupported`。`warnings` 提供稳定 code、message 和所属 aspect，解释为何不是完整结果。

## 相关文档

- [Schema Inspector 内部架构](./architecture.md)
- [方言行为](./dialects.md)
- [Collection Resolver](../collection/resolver.md)
