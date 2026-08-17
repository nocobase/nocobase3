# 命名概念

命名系统用于把应用层逻辑名映射到数据库物理 identifier。

## 两类名称

逻辑名面向应用、DSL、Agent、UI 和元数据：

```text
collection.name
field.name
relation target / foreignKey / sourceKey / targetKey
```

物理名面向数据库：

```text
collection.tableName
field.columnName
database table / view / column / index / constraint
```

Collection Builder 的配置默认使用逻辑名。只有 `tableName`、`columnName` 这类字段明确表示物理名。

## 命名优先级

优先级从高到低：

1. 显式 `tableName` 或 `columnName`。
2. Collection 级 `naming`。
3. connection 级 `naming`。
4. 默认命名策略。

默认命名策略等价于：

```ts
{
  underscored: true,
  tablePrefix: '',
}
```

## underscored

`underscored: true` 会把推导出的表名和列名转成小写下划线：

```text
orderItems -> order_items
createdAt -> created_at
```

它不约束你必须用小写下划线写代码。相反，它允许代码里继续写更自然的 camelCase，并在对接数据库时转成数据库友好的物理名。

## tablePrefix

`tablePrefix` 放在 connection 的 `naming` 下，Collection 可以覆盖。

```ts
const db = createDatabaseManager({
  connections: {
    main: {
      driver: 'knex',
      client: 'pg',
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    },
  },
});
```

这个配置下：

```text
orderItems -> tbl_order_items
createdAt -> created_at
```

`tablePrefix` 只作用于推导出的表名或视图名，不作用于列名。

## Builder 和 Query 的边界

`db.builder()` 是 Collection schema 层，会读取 Collection metadata 和命名配置。它能理解：

```text
collection.name -> tableName
field.name -> columnName
```

`db.query()` 是数据库查询层，不读取 Collection metadata。它只做轻量 identifier 归一化：

```text
orderNo -> order_no
createdAt -> created_at
```

如果字段显式配置了：

```ts
collection.string('orderNo').columnName('order_number');
```

`db.query()` 不会把 `orderNo` 映射到 `order_number`。这属于未来 Repository 的职责。

## 继续阅读

- Builder 命名编译规则见 [Builder 命名映射](../builder/naming.md)。
- Query 结果 key 和 alias 规则见 [Query 命名归一化](../query/naming.md)。
