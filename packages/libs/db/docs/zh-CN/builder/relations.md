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

固定命名规则会创建 `created_by_id`。

如果写了：

```ts
collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

`foreignKey` 表示当前 Collection 里的逻辑字段名，不是物理列名。如果没有同名逻辑字段定义，会按固定规则推导成本地列 `created_by_id`。

如果需要让关系复用已有的本地字段，应显式定义该逻辑字段，再用 `foreignKey()` 引用：

```ts
collection.bigInt('createdById');
collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

最终关系使用 `created_by_id`，并且不会重复创建外键列。

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

关系参数始终写逻辑名。物理列由 Collection 的 effective naming 生成：

```ts
collection.bigInt('createdById');
collection.belongsTo('createdBy', 'users').foreignKey('createdById');
```

## Agent 注意事项

- 只有 `belongsTo` 默认创建本地物理列。
- `belongsTo` 的外键约束需要显式 `constraints(true)`。
- 不要期望 `belongsToMany` 自动创建中间表。
- 需要跨 MySQL 时，整型外键和自增主键的 unsigned 属性要匹配。
- 关系参数引用逻辑名，不要把 `foreignKey()`、`sourceKey()`、`targetKey()`、`otherKey()`、`through()` 当作物理名配置。
- 不要在关系字段或本地外键字段上配置 `columnName()`。
