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
  view.string('firstName');
  view.as((query) =>
    query.from('users').select('firstName').where('age', '>', 18),
  );
});
```

推荐优先使用结构化 `view.as(...)`，因为它会按照源 Collection 自己的 effective naming，把逻辑 Collection 和 Field 名编译为确定的物理名称。

## replaceViewCollection

```ts
await builder.replaceViewCollection('adultUsers', (view) => {
  view.string('firstName');
  view.as((query) =>
    query.from('users').select('firstName').where('age', '>', 16),
  );
});
```

## asRaw

```ts
await builder.createViewCollection('adultUsers', (view) => {
  view.string('firstName');
  view.asRaw('select first_name from users where age > ?', [18]);
});
```

`asRaw` 是方言敏感的。只有在结构化 view query DSL 无法表达时才使用。

## 物化视图

```ts
await builder.createMaterializedViewCollection('adultUsers', (view) => {
  view.string('firstName');
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
- `view.as(...)` 引用已有 Collection 时，会使用目标 Collection 自己的 effective naming。
- Raw SQL View 无法可靠分析依赖，因此当前会保守阻止其他 Collection rename。
