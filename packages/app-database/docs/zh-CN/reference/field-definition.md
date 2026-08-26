# FieldDefinition

FieldDefinition 描述 Collection 字段。

```ts
interface FieldDefinition {
  name: string;
  type: FieldType;
  columnName?: string;
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
  interface?: string;
  uiSchema?: Record<string, unknown>;
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

## name 和 columnName

- `name` 是应用层字段名。
- `columnName` 是数据库物理列名覆盖，优先级高于命名策略，并按原样使用。

```ts
{
  name: 'eventName',
  type: 'string',
  columnName: 'event_name',
}
```

## 应用层元信息

- `title`
- `description`
- `interface`
- `uiSchema`

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

关系字段不支持 `columnName`。物理外键列名应配置在本地外键字段上，再通过 `foreignKey` 引用该字段。

## Agent 注意事项

- `type: 'increments'` 会被编译成自增字段。
- `belongsTo` 会创建本地外键列。
- `hasOne`、`hasMany`、`belongsToMany` 默认不创建本地物理列。
- 需要跨数据库时，优先使用通用 FieldType。
- 字段级例外使用 `columnName`，不要再设计字段级 `naming`。
- 关系参数使用逻辑名，不要把物理名写进 `foreignKey`、`targetKey`、`through` 等参数。
- 关系字段不配置 `columnName`；需要物理外键列名时，显式定义本地外键字段。
- `db.query()` 不会读取 `columnName`；需要元数据感知查询时应使用未来的 Repository。
