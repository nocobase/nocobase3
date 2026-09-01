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

## Collection 级表前缀

```ts
await builder.createCollection('auditLogs', {
  naming: { underscored: true, tablePrefix: 'archive_' },
  fields: [
    { name: 'id', type: 'increments', primaryKey: true },
    { name: 'eventName', type: 'string' },
  ],
});
```

Fluent DSL 中也可以写成：

```ts
await builder.createCollection('auditLogs', (collection) => {
  collection.naming({ underscored: true, tablePrefix: 'archive_' });
  collection.increments('id');
  collection.string('eventName');
});
```

两种写法都会创建 `archive_audit_logs.event_name`。Collection 可以覆盖 `underscored` 和 `tablePrefix`，但不能指定任意表名或列名。详见 [Builder 命名](./naming.md)。

## 与 metadata 的关系

默认情况下，`createCollection` 只同步补充 Metadata（Collection/Field 的 title、description、naming 和
relations）。物理 type、nullable、default、index 和 constraint 以数据库为准，不写入 Store。可以通过
`syncMetadata: false` 禁止补充文档同步：

```ts
await builder.createCollection('orders', definition, {
  syncMetadata: false,
});
```

## Schema 影响

会创建物理表。

## Metadata 影响

默认只保存可提取的补充 Metadata；没有补充信息时不创建空文档。`syncMetadata: false` 时不保存。

## Agent 注意事项

- Agent 写 migration 文件或 TypeScript 代码时，优先使用 Fluent DSL。
- Agent 调用 HTTP API、CLI，或生成 `collection.json` 时，优先使用 Object DSL。
- 如果只是补充标题、描述等元信息，不要使用 `createCollection`，应使用 metadata-only API。
- `type: 'increments'` 会在 schema 编译阶段被视为自增主键字段。
- 不要生成 `tableName`、`columnName` 或任意物理名称映射。
