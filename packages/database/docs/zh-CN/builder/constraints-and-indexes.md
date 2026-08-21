# Constraints 和 Indexes

Collection DSL 把 constraints 和 indexes 分开建模。

## Constraints

Constraints 表示数据完整性规则：

- `primary`
- `unique`
- `foreignKey`
- `check`

## Indexes

Indexes 表示查询性能优化：

- 普通 index

## primary

```ts
collection.string('email');
collection.primary('email', {
  name: 'users_primary_key',
});
```

## unique

```ts
collection.unique(['accountId', 'programId'], {
  name: 'job_composite_unique',
});
```

`unique` 应作为 constraint 建模，而不是普通 index。即使某些数据库底层用索引实现 unique，它在 Collection DSL 中仍表示数据完整性约束。

高级选项：

```ts
collection.unique(['accountId', 'programId'], {
  name: 'job_composite_unique',
  mode: 'constraint',
  deferrable: 'deferred',
  indexType: 'hash',
  predicate: {
    accountId: { $notNull: true },
  },
});
```

这些选项用于表达 Knex 里常见的 `unique` 能力，但不是所有数据库都支持。当前 Knex adapter 已处理 `name`、`mode: 'constraint'`、`deferrable`、`indexType` 和 `predicate`。

`predicate` 会先经过 Collection 字段名到数据库列名的映射。支持 partial index 的数据库会编译到底层 SQL；不支持 partial unique constraint 的数据库不会自动降级成 full unique，而是 warning + skip，因为 full unique 会改变业务语义。

## foreignKey

```ts
collection.integer('userId').unsigned();
collection.foreignKey('userId', {
  references: {
    collection: 'items',
    fields: ['id'],
  },
});
```

`collection.foreignKey(...)` 是表级外键约束 API。这里的 `userId` 和 `references.fields` 也都是逻辑字段名，会在编译阶段解析成物理列名。

字段级 shortcut：

```ts
collection
  .integer('userId')
  .unsigned()
  .references({ collection: 'items', field: 'id' });
```

## index

```ts
collection.index(['status'], {
  name: 'idx_jobs_status',
});
```

如果没有显式 `name`，Builder 会根据表名和字段名生成稳定名称。为了兼容 MySQL 和 PostgreSQL 常见的标识符长度限制，过长的自动名称会截断并追加稳定哈希。

生产 migration 中建议为重要 index 和 constraint 显式命名，尤其是后续需要 drop 的对象。

## add/drop shortcut

```ts
await builder.addIndex('orders', {
  fields: ['paidAt'],
  name: 'idx_orders_paid_at',
});

await builder.addConstraint('orders', {
  type: 'unique',
  fields: ['paidAt'],
  name: 'uk_orders_paid_at',
});

await builder.dropIndex('orders', 'idx_orders_paid_at');
await builder.dropConstraint('orders', 'uk_orders_paid_at');
```

## 当前限制

`check` constraint 已经建模，但当前还没有完整编译到 SQL。

`dropConstraint` 当前实现较基础，后续需要按 primary、unique、foreign key 等类型分别处理。

## Agent 注意事项

- 数据完整性用 constraints。
- 查询性能用 indexes。
- 不要把 unique 建成普通 index。
- 跨数据库时，不要依赖所有方言都支持 deferrable、partial index 或 check constraint。
- 重要 index、constraint 显式写 `name`，不要依赖自动名做长期维护。
