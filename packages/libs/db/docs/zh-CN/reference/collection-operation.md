# CollectionOperation

`CollectionOperation` 是 Builder 的执行计划格式。它适合 file sync、snapshot diff、批量 apply 和审计。

如果 Agent 的产物是 migration 文件或 TypeScript 代码，优先写 Fluent DSL；如果 Agent 的产物是 HTTP、CLI 或 `collection.json` payload，优先写 Object DSL；如果 Agent 的产物是执行计划，再使用 `CollectionOperation[]`。

## createCollection

```ts
{
  type: 'createCollection';
  name: string;
  definition: CollectionDefinition;
}
```

## alterCollection

```ts
{
  type: 'alterCollection';
  collection: string;
  changes: CollectionAlterDefinition;
}
```

## dropCollection

```ts
{
  type: 'dropCollection';
  collection: string;
}
```

destructive 操作。

## renameCollection

```ts
{
  type: 'renameCollection';
  from: string;
  to: string;
}
```

该操作当前只支持 `kind: 'table'`（或省略 `kind`）的 Collection，并总是按确定性命名规则同步重命名物理表和 Metadata，不支持指定任意目标物理表名。对 View 或 Materialized View 调用时会抛出 `COLLECTION_RENAME_UNSUPPORTED_KIND`。存在不能原子更新的 Relation、Foreign Key 或 View 依赖时，操作会在 DDL 前拒绝。

## view operations

```ts
{
  type: 'createViewCollection';
  name: string;
  definition: CollectionDefinition;
}

{
  type: 'replaceViewCollection';
  name: string;
  definition: CollectionDefinition;
}

{
  type: 'createMaterializedViewCollection';
  name: string;
  definition: CollectionDefinition;
}

{
  type: 'refreshMaterializedViewCollection';
  collection: string;
  concurrently?: boolean;
}
```

## field operations

```ts
{
  type: 'addField';
  collection: string;
  field: AnyFieldDefinition;
}

{
  type: 'alterField';
  collection: string;
  field: string;
  changes: FieldAlterInput;
}

{
  type: 'dropField';
  collection: string;
  field: string;
}
```

`dropField` 是 destructive 操作。

## index operations

```ts
{
  type: 'addIndex';
  collection: string;
  index: IndexDefinition;
}

{
  type: 'dropIndex';
  collection: string;
  index: string;
}
```

## constraint operations

```ts
{
  type: 'addConstraint';
  collection: string;
  constraint: ConstraintDefinition;
}

{
  type: 'dropConstraint';
  collection: string;
  constraint: string;
}
```

## Metadata 更新

`CollectionOperation` 只表达物理 Schema 计划。纯 Metadata 更新使用
`connection.collectionMetadata`，不混入 Builder 的执行计划。

## Agent 注意事项

- Agent 输出执行计划、diff 结果或批量 apply payload 时，优先生成 `CollectionOperation[]`。
- destructive operation 先 dry-run。
- Metadata Service 更新不应混入 Schema 执行计划。
