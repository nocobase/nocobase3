# View Collection

View Collection 用于把数据库视图映射成 Collection。

当前 API：

- `createViewCollection`
- `replaceViewCollection`
- `createMaterializedViewCollection`
- `refreshMaterializedViewCollection`

## createViewCollection

```ts
await builder.createViewCollection('adultUsers', (view) => {
  view.tableName('adult_users');
  view.string('firstName', { columnName: 'first_name' });
  view.as((query) =>
    query.from('users').select('firstName').where('age', '>', 18),
  );
});
```

推荐优先使用结构化 `view.as(...)`，因为它可以把 Collection 逻辑名编译到数据库物理名。已有 metadata 中的 `tableName`、`columnName` 会优先使用；缺省时再走命名策略。

## replaceViewCollection

```ts
await builder.replaceViewCollection('adultUsers', (view) => {
  view.tableName('adult_users');
  view.string('firstName', { columnName: 'first_name' });
  view.as((query) =>
    query.from('users').select('firstName').where('age', '>', 16),
  );
});
```

## asRaw

```ts
await builder.createViewCollection('adultUsers', (view) => {
  view.tableName('adult_users');
  view.string('firstName', { columnName: 'first_name' });
  view.asRaw('select first_name from users where age > ?', [18]);
});
```

`asRaw` 是方言敏感的。只有在结构化 view query DSL 无法表达时才使用。

## 物化视图

```ts
await builder.createMaterializedViewCollection('adultUsers', (view) => {
  view.tableName('adult_users');
  view.string('firstName', { columnName: 'first_name' });
  view.as((query) =>
    query.from('users').select('firstName').where('age', '>', 18),
  );
});

await builder.refreshMaterializedViewCollection('adultUsers');
```

SQLite 和 MySQL 不支持 PostgreSQL 风格的 materialized view。当前真实数据库集成测试只覆盖普通 view。

## Agent 注意事项

- 优先使用结构化 `view.as(...)`。
- `asRaw` 需要 Agent 明确知道目标数据库方言。
- 不要假设所有数据库支持 materialized view。
- view collection 默认 `writable: false`。
- `view.as(...)` 引用已有 Collection 时，会优先使用已有 Collection metadata 中的物理名映射。
