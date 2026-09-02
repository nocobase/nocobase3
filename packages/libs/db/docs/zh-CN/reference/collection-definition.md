# CollectionDefinition

`CollectionDefinition` 是 Collection DSL 的核心结构。

```ts
interface CollectionDefinition {
  kind?: CollectionKind;
  name?: string;
  naming?: NamingOptions;
  title?: string;
  description?: string;
  db?: DbOptions;
  fields?: AnyFieldDefinition[];
  constraints?: ConstraintDefinition[];
  indexes?: IndexDefinition[];
  view?: ViewOptions;
}
```

## kind

```ts
type CollectionKind = 'table' | 'view' | 'materializedView';
```

默认可以理解为 `table`。

Resolver 读取 `partitionedTable` 和 `foreignTable` 时也返回 `kind: 'table'`，并在
`db.physicalKind` 中保留精确物理类型；这不代表 Builder 支持创建对应的方言对象。

## name

Collection 的应用层名称。通常由 Builder API 的第一个参数提供，不需要在 definition 中重复写。

## logical name 引用

Collection Builder 的配置默认都使用 logical name，底层对接数据库时才转换成物理名。也就是说：

- `fields[].name` 是逻辑字段名。
- `constraints[].fields`、`indexes[].fields` 是逻辑字段名。
- `constraints[].references.collection` 是逻辑 Collection 名。
- `constraints[].references.fields` 是逻辑字段名。
- `view.as.from` 是逻辑 Collection 名。
- `view.as.select` 和 `view.as.filter` 是逻辑字段名。

这些位置不能写物理表名或物理列名。

## naming

Collection 级命名配置，会覆盖 connection 级 `naming`：

```ts
{
  naming: {
    underscored: false,
    tablePrefix: 'legacy_',
  }
}
```

通常应优先在 Connection 上配置统一规则。只有单个 Collection 需要不同的 `underscored` 或 `tablePrefix` 时，才使用 Collection 级 `naming`。Collection DSL 不支持任意物理表名；物理表名由 effective naming 和逻辑名称确定性生成。

## title 和 description

应用层元信息，用于 UI、Agent 和业务解释。

## db

数据库层配置：

```ts
{
  db: {
    schema: 'public',
    comment: 'Database object comment',
  }
}
```

## fields

字段定义列表。见 [FieldDefinition](./field-definition.md)。

## constraints

数据完整性约束：

```ts
{
  constraints: [
    { type: 'primary', fields: ['id'] },
    { type: 'unique', fields: ['email'], name: 'uk_users_email' },
  ],
}
```

## indexes

查询性能索引：

```ts
{
  indexes: [
    { fields: ['status'], name: 'idx_orders_status' },
  ],
}
```

## view

视图定义：

```ts
{
  view: {
    as: {
      from: 'users',
      select: ['firstName'],
      filter: {
        age: { $gt: 18 },
      },
    },
  },
}
```

Resolver 从 Inspector 读取完整 View SQL 时使用：

```ts
{
  view: {
    asRaw: {
      sql: 'select ...',
    },
  },
}
```

该 SQL 是数据库物理事实，不属于 editable Collection Metadata。

## Agent 注意事项

- Object DSL 中 `CollectionDefinition` 是最适合 HTTP、CLI、`collection.json` 和跨进程序列化的结构。
- 不要把 `title` 和 `description` 当数据库 comment。
- `CollectionDefinition` 不承载统一的记录写权限；`kind` 只描述物理对象类型。
- `constraints` 和 `indexes` 要分开建模。
- 不要生成 `tableName` 或 `columnName`；物理名称由逻辑名确定性推导。
- `renameCollection(from, to)` 当前只支持 Table Collection，并会同步重命名物理表；View、Materialized View 或有无法原子更新的依赖时会在 DDL 前拒绝。
- 命名规则详见 [命名概念](../concepts/naming.md) 和 [Builder 命名映射](../builder/naming.md)。
