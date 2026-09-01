# apply 和 CollectionOperation

`builder.apply()` 接收 `CollectionOperation[]`，它是 Collection Builder 的执行计划层。

对 Agent 的 file sync、snapshot diff、批量 apply 和审计场景来说，Operation DSL 是最稳定的变更表达：结构化、可解释、可 dry-run。

## 基本用法

```ts
await builder.apply([
  {
    type: 'createCollection',
    name: 'orders',
    definition: {
      fields: [
        { name: 'id', type: 'increments', primaryKey: true },
        { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
      ],
    },
  },
]);
```

## dryRun 和 previewSql

```ts
const result = await builder.apply(operations, {
  dryRun: true,
  previewSql: true,
});

console.log(result.operations);
console.log(result.schemaOperations);
console.log(result.sql);
console.log(result.impact);
```

`dryRun: true` 不执行数据库结构变更。

`previewSql: true` 会尝试返回底层 SQL，前提是 adapter 支持 SQL 编译。

## CollectionOperation 列表

```ts
{
  type: ('createCollection', name, definition);
}
{
  type: ('alterCollection', collection, changes);
}
{
  type: ('dropCollection', collection);
}
{
  type: ('renameCollection', from, to);
}
{
  type: ('createViewCollection', name, definition);
}
{
  type: ('replaceViewCollection', name, definition);
}
{
  type: ('createMaterializedViewCollection', name, definition);
}
{
  type: ('refreshMaterializedViewCollection', collection, concurrently);
}
{
  type: ('addField', collection, field);
}
{
  type: ('alterField', collection, field, changes);
}
{
  type: ('dropField', collection, field);
}
{
  type: ('addIndex', collection, index);
}
{
  type: ('dropIndex', collection, index);
}
{
  type: ('addConstraint', collection, constraint);
}
{
  type: ('dropConstraint', collection, constraint);
}
```

## destructive 操作

当前 `dropField` 和 `dropCollection` 会产生 destructive impact：

```ts
[
  {
    level: 'destructive',
    operation: 'dropField',
    message: 'Dropping field users.name may remove existing data.',
  },
];
```

## Agent 注意事项

- Agent 输出执行计划、diff 结果或批量 apply payload 时，优先输出 `CollectionOperation[]`。
- destructive 操作必须先 dry-run。
- file sync 场景应先生成 snapshot + diff，再转换成 operation，再调用 `apply()`。
- 纯 Metadata 更新不属于 `CollectionOperation`，使用 `connection.collectionMetadata`。
- `renameCollection` 总是同步重命名物理表和 Metadata；存在无法原子更新的依赖时会在 DDL 前拒绝。
