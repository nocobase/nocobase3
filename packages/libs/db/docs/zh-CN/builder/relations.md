---
title: Builder 关系字段
description: 定义 belongsTo、hasOne、hasMany 和 belongsToMany metadata，并区分关系说明、本地列、索引和外键约束。
---

# 关系字段

关系字段同时描述 Collection Metadata 和可能产生的物理 Schema。先判断关系由哪一侧持有外键，再决定是否需要本地列、索引和数据库约束。

## 行为表

| Relation        | 创建本地列 | 默认创建索引 | 默认创建外键约束 | Metadata |
| --------------- | ---------- | ------------ | ---------------- | -------- |
| `belongsTo`     | 是         | 是           | 否               | 是       |
| `hasOne`        | 否         | 否           | 否               | 是       |
| `hasMany`       | 否         | 否           | 否               | 是       |
| `belongsToMany` | 否         | 否           | 否               | 是       |

四种入口都返回 Relation Builder。常见链式能力按用途分组如下：

| 目的             | API                                                               |
| ---------------- | ----------------------------------------------------------------- |
| 指定关联端       | `target()`、`sourceKey()`、`targetKey()`                          |
| 指定外键         | `foreignKey()`、`foreignKeyType()`                                |
| 配置多对多中间表 | `through()`、`otherKey()`                                         |
| 创建数据库约束   | `constraints()`、`onDelete()`、`onUpdate()`                       |
| 配置本地字段     | `notNull()`、`nullable()`、`defaultTo()`、`index()`、`unsigned()` |

关系键没有默认值，也不从主键或字段名推断。必须显式配置：belongsTo 的 foreignKey/targetKey；hasOne/hasMany 的 sourceKey/foreignKey；belongsToMany 的 sourceKey/targetKey/through/foreignKey/otherKey。Builder 链式配置可以暂时未完成，但编译和 Metadata 校验会拒绝缺失的必要属性。

## 定义 belongsTo

```ts
await builder.createCollection('orders', (collection) => {
  collection.increments('id');
  collection
    .belongsTo('customer', 'customers')
    .foreignKey('customerId')
    .targetKey('id')
    .foreignKeyType('integer')
    .unsigned()
    .constraints(true)
    .index();
});
```

`belongsTo` 会创建本地外键列。默认会创建索引，但只有显式 `.constraints(true)` 时才创建数据库外键约束。

推荐先声明标量外键字段，再由 belongsTo 引用。字段类型不由关系名或 `id` 名称决定：

```ts
collection.string('creatorAccount');
collection
  .belongsTo('createdBy', 'users')
  .foreignKey('creatorAccount')
  .targetKey('account');
```

这里明确关联本地 creatorAccount 与 users.account；不要求 users 有 id 或 bigint 主键。

如果写了：

```ts
collection
  .belongsTo('createdBy', 'users')
  .foreignKey('createdById')
  .targetKey('id')
  .foreignKeyType('integer');
```

`foreignKey` 表示逻辑字段名，不是物理列名。如果没有同名标量字段，必须显式配置 foreignKeyType 才能创建该列；不再默认 bigInt。物理名称仍遵循已配置的 naming。

如果需要让关系复用已有的本地字段，应显式定义该逻辑字段，再用 `foreignKey()` 引用：

```ts
collection.bigInt('createdById');
collection
  .belongsTo('createdBy', 'users')
  .foreignKey('createdById')
  .targetKey('id');
```

最终关系使用 `created_by_id`，并且不会重复创建外键列。

## 定义 hasOne 和 hasMany

```ts
await builder.createCollection('customers', (collection) => {
  collection.increments('id');
  collection
    .hasOne('profile', 'profiles')
    .sourceKey('id')
    .foreignKey('customerId');
  collection
    .hasMany('orders', 'orders')
    .sourceKey('id')
    .foreignKey('customerId');
});
```

`hasOne` 和 `hasMany` 是 inverse relation，默认只保存 metadata，不在当前 Collection 上创建物理列。

这里的 `foreignKey('customerId')` 引用的是 target Collection 上的逻辑字段名，不是当前 Collection 的物理列名。

## 定义 belongsToMany

```ts
collection
  .belongsToMany('products', 'products')
  .sourceKey('id')
  .targetKey('id')
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
collection
  .belongsTo('createdBy', 'users')
  .foreignKey('createdById')
  .targetKey('id');
```

## 使用注意事项

- 只有 `belongsTo` 默认创建本地物理列。
- 没有默认 id、默认关联键或默认外键类型；id 只是普通字段名，可以是 string、uuid、integer 等声明的类型，也可以不是主键。
- 普通物理外键同样需要显式 references.field 或 references.fields；复合外键两端字段数量必须相同。
- `belongsTo` 的外键约束需要显式 `constraints(true)`。
- 不要期望 `belongsToMany` 自动创建中间表。
- 需要跨 MySQL 时，整型外键和自增主键的 unsigned 属性要匹配。
- 关系参数引用逻辑名，不要把 `foreignKey()`、`sourceKey()`、`targetKey()`、`otherKey()`、`through()` 当作物理名配置。
- 不要在关系字段或本地外键字段上配置 `columnName()`。
- 方言兼容和逻辑名解析见[命名与跨数据库兼容](./portability.md)。
