# 关系字段

Collection Builder 当前支持四种关系字段：

- `belongsTo`
- `hasOne`
- `hasMany`
- `belongsToMany`

## 行为表

| Relation        | 创建本地列 | 默认创建索引 | 默认创建外键约束 | Metadata |
| --------------- | ---------- | ------------ | ---------------- | -------- |
| `belongsTo`     | 是         | 是           | 否               | 是       |
| `hasOne`        | 否         | 否           | 否               | 是       |
| `hasMany`       | 否         | 否           | 否               | 是       |
| `belongsToMany` | 否         | 否           | 否               | 是       |

## belongsTo

```ts
await builder.createCollection('orders', (collection) => {
  collection.increments('id');
  collection
    .belongsTo('customer', 'customers')
    .foreignKey('customerId')
    .foreignKeyType('integer')
    .unsigned()
    .constraints(true)
    .index();
});
```

`belongsTo` 会创建本地外键列。默认会创建索引，但只有显式 `.constraints(true)` 时才创建数据库外键约束。

`belongsTo` 会先尝试通过逻辑 `foreignKey` 找到已有字段；没有 `foreignKey` 时，会自己创建本地外键列，默认列名是 `<field>_id`，并会受命名策略影响：

```ts
collection.belongsTo('createdBy', 'users');
```

在 `underscored: true` 下会创建 `created_by_id`。

如果写了：

```ts
collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

`foreignKey` 表示当前 Collection 里的逻辑字段名，不是物理列名。在 `underscored: true` 下，如果没有同名逻辑字段定义，会按命名策略推导成本地列 `created_by_id`。

如果已有字段显式设置了物理列名：

```ts
collection.bigInt('createdById').columnName('creator_id');
collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

最终关系会使用 `creator_id`，并且不会重复创建 `created_by_id`。

关系字段本身不配置 `columnName`。如果需要指定物理外键列名，应显式定义本地外键字段，再用 `foreignKey()` 引用它：

```ts
collection.bigInt('createdById').columnName('creator_id');
collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

## hasOne 和 hasMany

```ts
await builder.createCollection('customers', (collection) => {
  collection.increments('id');
  collection.hasOne('profile', 'profiles').foreignKey('customerId');
  collection.hasMany('orders', 'orders').foreignKey('customerId');
});
```

`hasOne` 和 `hasMany` 是 inverse relation，默认只保存 metadata，不在当前 Collection 上创建物理列。

这里的 `foreignKey('customerId')` 引用的是 target Collection 上的逻辑字段名，不是当前 Collection 的物理列名。

## belongsToMany

```ts
collection
  .belongsToMany('products', 'products')
  .through('orderProducts')
  .foreignKey('customerId')
  .otherKey('productId');
```

当前建议把 many-to-many 的 through table 显式建成一个 Collection，而不是由关系字段隐式创建。

`through('orderProducts')` 引用的是中间表 Collection 的逻辑名。`foreignKey` 和 `otherKey` 引用的是 through Collection 上的逻辑字段名。

## 关系参数的作用域

关系参数只引用 Collection 和 Field 层面的 `name`：

| 参数                                       | 逻辑作用域                                                |
| ------------------------------------------ | --------------------------------------------------------- |
| `target`                                   | 目标 Collection 的 `name`                                 |
| `through`                                  | 中间表 Collection 的 `name`                               |
| `belongsTo.foreignKey`                     | 当前 Collection 的本地外键字段 `name`                     |
| `hasOne.foreignKey` / `hasMany.foreignKey` | target Collection 上指回当前 Collection 的字段 `name`     |
| `belongsToMany.foreignKey`                 | through Collection 上指向 source Collection 的字段 `name` |
| `belongsToMany.otherKey`                   | through Collection 上指向 target Collection 的字段 `name` |
| `sourceKey`                                | source Collection 上的字段 `name`                         |
| `targetKey`                                | target Collection 上的字段 `name`                         |

物理表名和物理列名只通过 `tableName`、`columnName` 表达。即使数据库列叫 `creator_id`，关系里也应写逻辑字段名：

```ts
collection.bigInt('createdById').columnName('creator_id');
collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

## Agent 注意事项

- 只有 `belongsTo` 默认创建本地物理列。
- `belongsTo` 的外键约束需要显式 `constraints(true)`。
- 不要期望 `belongsToMany` 自动创建中间表。
- 需要跨 MySQL 时，整型外键和自增主键的 unsigned 属性要匹配。
- 关系参数引用逻辑名，不要把 `foreignKey()`、`sourceKey()`、`targetKey()`、`otherKey()`、`through()` 当作物理名配置。
- 关系字段不配置 `columnName()`；需要显式物理外键列名时，在本地外键字段上使用 `columnName()`。
