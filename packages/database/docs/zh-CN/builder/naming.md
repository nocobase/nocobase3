# Builder 命名映射

Collection Builder 同时维护两类名称：

- 逻辑名：`collection.name`、`field.name`，面向应用、DSL、Agent、UI 和元数据。
- 物理名：`collection.tableName`、`field.columnName`，面向数据库表、视图和列。

如果没有显式物理名，Builder 会根据当前连接或 Collection 的 `naming` 配置推导物理名。

跨模块的命名概念见 [命名概念](../concepts/naming.md)。本页只聚焦 Builder 编译 Collection DSL 时的命名规则。

## 基本规则

优先级从高到低：

1. `collection.tableName` 或 `field.columnName`。
2. `collection.naming`。
3. `connection.naming`。
4. 默认命名策略。

默认命名策略等价于：

```ts
{
  underscored: true,
  tablePrefix: '',
}
```

`underscored: true` 会把推导出的表名和列名转成小写下划线：

```ts
orderItems -> order_items
createdAt -> created_at
```

`tablePrefix` 只作用于推导出的表名或视图名，不作用于列名：

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

这个配置下，`orderItems.createdAt` 会映射为：

```text
tbl_order_items.created_at
```

## Builder 配置的命名边界

Collection Builder 的配置面向应用层，跨对象引用统一使用 logical name。底层 SchemaAdapter 对接数据库时，才把 logical name 编译成 table、view、column 等物理名。

这些值都应写 logical name：

- Builder 方法参数里的 Collection 名，例如 `createCollection('orders')`、`alterCollection('orders')`。
- Field 的 `name`。
- Index 和 constraint 的 `fields`。
- Foreign key 的 `references.collection`、`references.fields`。
- Relation 的 `target`、`through`、`foreignKey`、`sourceKey`、`targetKey`、`otherKey`。
- 结构化 view query 的 `from`、`select`、`filter` 字段名。

`tableName` 和 `columnName` 只用于声明逻辑名到物理名的映射，不作为引用值使用：

```ts
collection.tableName('tbl_order_item');
collection.string('orderNo').columnName('order_number');

collection.index(['orderNo']);
collection.foreignKey('orderNo', {
  references: {
    collection: 'legacyOrders',
    fields: ['orderNo'],
  },
});
```

上面的 `index` 和 `foreignKey` 都写 `orderNo`，不要写 `order_number`。

## 显式物理名

`tableName` 和 `columnName` 表示物理数据库名称，优先级最高，并且按原样使用：

```ts
await builder.createCollection('orderItems', (collection) => {
  collection.tableName('tbl_order_item');

  collection.string('orderNo').columnName('order_number');
  collection.datetime('createdAt');
});
```

上面的定义会创建：

```text
tbl_order_item.order_number
tbl_order_item.created_at
```

`createdAt` 没有显式 `columnName`，所以仍然使用命名策略推导为 `created_at`。

## Collection 级覆盖

可以在单个 Collection 上覆盖连接级命名规则：

```ts
await builder.createCollection('orderItems', (collection) => {
  collection.naming({
    underscored: false,
    tablePrefix: 'legacy_',
  });

  collection.datetime('createdAt');
});
```

在默认连接配置为 `underscored: true` 的情况下，这个 Collection 会创建：

```text
legacy_orderItems.createdAt
```

Collection 级 `naming` 用于少量特殊表。不建议为每个字段都增加 naming 配置；字段级例外应使用 `columnName`。

## 关系字段

`belongsTo` 会先尝试通过逻辑 `foreignKey` 找到已有字段；没有 `foreignKey` 时，会自己创建本地外键列，默认列名是：

```text
<field_name>_id
```

在 `underscored: true` 下：

```ts
collection.belongsTo('createdBy', 'users');
```

会创建：

```text
created_by_id
```

关系字段本身不配置 `columnName`。如果需要显式外键列名，应把物理列名配置在本地外键字段上：

```ts
collection.bigInt('createdById').columnName('creator_id');
collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

`foreignKey()` 不是物理列名，它引用的是当前 Collection 的逻辑字段名：

```ts
collection.bigInt('createdById').columnName('creator_id');

collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

上面的关系最终使用 `creator_id`，因为 `createdById` 这个逻辑字段显式设置了 `columnName`。

关系参数都按逻辑名解析，不直接表示物理表名或物理列名：

```text
foreignKey() -> 对应作用域里的 field.name
sourceKey()  -> source collection 的 field.name
targetKey()  -> target collection 的 field.name
otherKey()   -> through collection 的 field.name
through()    -> collection.name
```

如果没有找到对应 field，Builder 会把参数当作逻辑字段名按命名策略推导。例如 `foreignKey('createdById')` 在 `underscored: true` 下会推导为 `created_by_id`。

## 自动生成的索引和约束名

如果没有显式 `name`，Builder 会为 index、unique、foreign key 等生成稳定名称：

```text
idx_<table>_<columns>
fk_<table>_<columns>_<targetTable>
```

为了兼容 MySQL 和 PostgreSQL 常见的 63/64 字符限制，自动生成的长名称会截断并追加稳定哈希。短名称保持原样。

重要的生产 migration 建议显式写 `name`，这样数据库对象名更可读，也更方便后续 drop 或排查：

```ts
collection.unique(['accountId', 'programId'], {
  name: 'uk_jobs_account_program',
});
```

## renameCollection

`renameCollection(from, to)` 默认只重命名 Collection metadata，不重命名物理表：

```ts
await builder.renameCollection('orderItems', 'orderLines');
```

这样做是为了避免逻辑改名意外移动真实数据库对象。默认逻辑改名时，Builder 会把旧的有效物理表名写入新的 `tableName`，从而冻结映射：

```text
orderItems 原本映射到 order_items
orderLines.tableName = order_items
```

如果确实要按命名规则重命名物理表：

```ts
await builder.renameCollection('orderItems', 'orderLines', {
  renameTable: true,
});
```

如果要重命名到指定物理表名：

```ts
await builder.renameCollection('orderItems', 'orderLines', {
  renameTableTo: 'tbl_order_line',
});
```

不要使用 `{ tableName: ... }` 表达 rename 操作。`tableName` 是 Collection 的状态，`renameTableTo` 是操作意图。

## 和 QueryAdapter 的边界

`db.query()` 是数据库查询层，不是 Repository，也不读取 Collection metadata。它只做轻量 identifier 归一化，不会做 `field.name -> columnName` 的元数据映射。

Query 的结果 key、alias、`selectAll()` 和 `tablePrefix` 边界详见 [Query 命名归一化](../query/naming.md)。

## Agent 注意事项

- 写 Builder schema 代码时使用逻辑名，只有确实需要绑定物理数据库对象时才写 `tableName` 或 `columnName`。
- `tableName`、`columnName` 是物理名，不要再参与命名转换。
- `tablePrefix` 放在 connection 的 `naming` 下；Collection 可以覆盖。
- 关系参数引用 Collection 或 Field 的 `name`，不要把 `foreignKey()`、`targetKey()`、`through()` 当作物理名配置。
- 重要 index、constraint 建议显式命名；未命名时 Builder 会生成稳定名称，过长会截断加哈希。
- `db.query()` 是物理查询层，不要把它当成 Collection Repository。
- 需要 `field.name -> columnName` 的查询映射时，等待或实现 Repository，而不是让 `db.query()` 读取 Collection metadata。
