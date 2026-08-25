# CollectionDefinition

`CollectionDefinition` 是 Collection DSL 的核心结构。

```ts
interface CollectionDefinition {
  kind?: CollectionKind;
  name?: string;
  tableName?: string;
  naming?: NamingOptions;
  title?: string;
  description?: string;
  writable?: boolean;
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

不要在这些引用位置写 `tableName` 或 `columnName`。

## tableName

物理数据库表名或视图名覆盖。`tableName` 是显式物理名，优先级高于 `naming`，按原样使用。

```ts
{
  tableName: 'audit_logs';
}
```

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

通常应优先在 connection 上配置统一命名规则。只有单个 Collection 需要特殊命名时，才使用 Collection 级 `naming`。

## title 和 description

应用层元信息，用于 UI、Agent 和业务解释。

## writable

表示 Collection 是否可写。View collection 默认不可写。

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

## Agent 注意事项

- Object DSL 中 `CollectionDefinition` 是最适合 HTTP、CLI、`collection.json` 和跨进程序列化的结构。
- 不要把 `title` 和 `description` 当数据库 comment。
- `constraints` 和 `indexes` 要分开建模。
- `tableName` 是物理名状态，不是 rename 操作意图；重命名物理表应使用 `renameTableTo`。
- 命名规则详见 [命名概念](../concepts/naming.md) 和 [Builder 命名映射](../builder/naming.md)。
