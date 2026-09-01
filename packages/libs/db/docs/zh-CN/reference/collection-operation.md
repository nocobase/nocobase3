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

该操作总是按确定性命名规则同步重命名物理表和 Metadata，不支持指定任意目标物理表名。存在不能原子更新的 Relation、Foreign Key 或 View 依赖时，操作会在 DDL 前拒绝。

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

## metadata operations

```ts
{
  type: 'updateCollectionMetadata';
  collection: string;
  patch: CollectionMetadataPatch;
}

{
  type: 'updateFieldMetadata';
  collection: string;
  field: string;
  patch: FieldMetadataPatch;
}
```

metadata operation 不生成 schema operation。

## Agent 注意事项

- Agent 输出执行计划、diff 结果或批量 apply payload 时，优先生成 `CollectionOperation[]`。
- destructive operation 先 dry-run。
- metadata-only operation 不应混入 schema 变更。
