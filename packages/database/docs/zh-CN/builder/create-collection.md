# createCollection

`createCollection` 用于创建新的 Collection，并创建对应的数据库表。

## 用途

适合从零创建数据表的场景：

```ts
await builder.createCollection('orders', {
  fields: [
    { name: 'id', type: 'increments', primaryKey: true },
    { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
  ],
});
```

## TypeScript 签名

```ts
createCollection(
  name: string,
  input: CollectionDefinitionInput,
  options?: BuilderExecOptions,
): Promise<BuilderResult>
```

## Object DSL

```ts
await builder.createCollection('orders', {
  title: 'Orders',
  description: 'Customer purchase orders.',
  fields: [
    { name: 'id', type: 'increments', primaryKey: true },
    { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
    { name: 'status', type: 'string', length: 32, defaultValue: 'draft' },
  ],
  indexes: [{ fields: ['status'] }],
});
```

## Fluent DSL

```ts
await builder.createCollection('orders', (collection) => {
  collection.title('Orders');
  collection.description('Customer purchase orders.');
  collection.increments('id');
  collection.decimal('amount', { precision: 12, scale: 2 });
  collection.string('status', { length: 32 }).defaultTo('draft');
  collection.index(['status']);
});
```

## 自定义物理表名

```ts
await builder.createCollection('auditLogs', {
  tableName: 'audit_logs',
  fields: [
    { name: 'id', type: 'increments', primaryKey: true },
    { name: 'eventName', type: 'string', columnName: 'event_name' },
  ],
});
```

Fluent DSL 中也可以写成：

```ts
await builder.createCollection('auditLogs', (collection) => {
  collection.tableName('audit_logs');
  collection.increments('id');
  collection.string('eventName').columnName('event_name');
});
```

如果没有显式 `tableName` 或 `columnName`，Builder 会根据 connection 或 Collection 的 `naming` 推导物理名。详见 [命名映射](./naming.md)。

## 与 metadata 的关系

默认情况下，`createCollection` 会同步 Collection 元数据。可以通过 `syncMetadata: false` 禁止：

```ts
await builder.createCollection('orders', definition, {
  syncMetadata: false,
});
```

## Schema 影响

会创建物理表。

## Metadata 影响

默认会保存 Collection 元数据，除非 `syncMetadata: false`。

## Agent 注意事项

- Agent 写 migration 文件或 TypeScript 代码时，优先使用 Fluent DSL。
- Agent 调用 HTTP API、CLI，或生成 `collection.json` 时，优先使用 Object DSL。
- 如果只是补充标题、描述等元信息，不要使用 `createCollection`，应使用 metadata-only API。
- `type: 'increments'` 会在 schema 编译阶段被视为自增主键字段。
- 绑定已有物理表或列时使用 `tableName`、`columnName`，不要把物理名写进逻辑 `name`。
