---
title: FieldDefinition
description: Collection 字段类型、公共选项、数据库扩展和 RelationFieldDefinition 的类型参考。
---

# FieldDefinition

FieldDefinition 描述 Collection 字段。

```ts
interface FieldDefinition {
  name: string;
  type: FieldType;
  title?: string;
  description?: string;
  nullable?: boolean;
  defaultValue?: unknown;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  index?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  db?: DbOptions;
}
```

## FieldType

```ts
type FieldType =
  | 'increments'
  | 'integer'
  | 'bigInt'
  | 'string'
  | 'text'
  | 'boolean'
  | 'decimal'
  | 'float'
  | 'double'
  | 'date'
  | 'time'
  | 'datetime'
  | 'json'
  | 'uuid'
  | 'native'
  | 'belongsTo'
  | 'hasOne'
  | 'hasMany'
  | 'belongsToMany'
  | string;
```

## name 和物理列名

`name` 是应用层逻辑字段名。物理列名根据 Collection 的 `naming.underscored` 推导；默认转为 snake_case，`underscored: false` 时保持原样。不支持字段级 `columnName` 或 `naming`。

```ts
{
  name: 'eventName',
  type: 'string',
}
```

上面的物理列名是 `event_name`。

## 应用层元信息

- `title`
- `description`

这些信息用于应用和 Agent，不等同于数据库结构。

## 数据库层配置

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

Resolver 从物理 Schema 生成 Field 时，还会在 `db` 中保留当前通用 DSL 没有独立属性的只读事实：

- `db.defaultExpression`：数据库返回的原始 default 表达式；只有 Inspector 同时解析出值时才设置
  `defaultValue`；
- `db.generated`：generated/computed column 的表达式和 stored 标记；
- `db.nativeTypeSchema`：原生类型所属 schema（数据库能够提供时）。

这些属性来自 Inspector，不保存到 Collection Metadata，也不能把 generated column 重新解释成 virtual Field。

## RelationFieldDefinition

```ts
interface RelationFieldDefinition {
  name: string;
  type: 'belongsTo' | 'hasOne' | 'hasMany' | 'belongsToMany';
  target: string;
  sourceKey?: string;
  targetKey?: string;
  foreignKey?: string;
  foreignKeyType?: FieldType;
  otherKey?: string;
  through?: string;
  constraints?: boolean;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
}
```

这些关系参数都是逻辑引用，不直接表示物理名：

- `target` 引用目标 Collection 的 `name`。
- `through` 引用中间表 Collection 的 `name`。
- `belongsTo.foreignKey` 引用当前 Collection 的本地外键字段 `name`。
- `hasOne.foreignKey`、`hasMany.foreignKey` 引用 target Collection 上指回当前 Collection 的字段 `name`。
- `belongsToMany.foreignKey`、`belongsToMany.otherKey` 引用 through Collection 上的字段 `name`。
- `sourceKey` 引用 source Collection 的字段 `name`。
- `targetKey` 引用 target Collection 的字段 `name`。

关系字段也不支持自定义物理列名。`foreignKey` 始终引用逻辑字段名，并按固定规则转换为物理列名。

## Agent 注意事项

- `type: 'increments'` 会被编译成自增字段。
- `belongsTo` 会创建本地外键列。
- `hasOne`、`hasMany`、`belongsToMany` 默认不创建本地物理列。
- 需要跨数据库时，优先使用通用 FieldType。
- 不要生成字段级物理名称映射。
- 关系参数使用逻辑名，不要把物理名写进 `foreignKey`、`targetKey`、`through` 等参数。
- 需要本地外键字段时可以显式定义它，但其物理名称仍由逻辑字段名推导。
