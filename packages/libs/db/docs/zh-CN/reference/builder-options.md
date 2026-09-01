# BuilderExecOptions

`BuilderExecOptions` 控制 Builder 执行方式。它面向自动化、CLI、file sync、migration 和 Agent 场景。

```ts
interface BuilderExecOptions {
  dryRun?: boolean;
  previewSql?: boolean;
  syncMetadata?: boolean;
  ifNotExists?: boolean;
  ifExists?: boolean;
  strict?: boolean;
  // reserved; currently not a runtime guarantee
  transaction?: boolean;
}
```

## CollectionBuilderOptions

创建 `CollectionBuilder` 时可以传入 Schema adapter、Collection 读取入口、Metadata Service 和命名配置：

```ts
interface CollectionBuilderOptions {
  schemaAdapter?: SchemaAdapter;
  collections?: Pick<ConnectionCollections, 'get' | 'scan'>;
  collectionMetadata?: CollectionMetadataService;
  schemaInvalidator?: CollectionMetadataInvalidator;
  naming?: NamingOptions;
}
```

完整应用通过 `DatabaseConnection` 自动注入这些协作者：Builder 从 `collections` 读取物理 Schema 与补充
Metadata 的解析结果，通过 `collectionMetadata` 只写补充文档，并通过 `schemaInvalidator` 清理解析缓存。

`naming` 用于默认逻辑名到物理名的映射：

```ts
const builder = new CollectionBuilder({
  naming: {
    underscored: true,
    tablePrefix: 'tbl_',
  },
});
```

在完整应用里更推荐通过 connection 配置传入：

```ts
createDatabaseManager({
  connections: {
    main: {
      dialect: 'postgres',
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    },
  },
});
```

## NamingOptions

```ts
interface NamingOptions {
  underscored?: boolean;
  tablePrefix?: string;
}
```

- `underscored`：是否把逻辑表名和字段名转换为小写下划线，默认 `true`。
- `tablePrefix`：只作用于推导出的表名或视图名，不作用于列名。

Collection 可以用自己的 `naming` 覆盖 Connection 或 Builder 默认值；`tablePrefix: ''` 表示清除继承的前缀。

## 当前已验证选项

### dryRun

```ts
const result = await builder.apply(operations, {
  dryRun: true,
});
```

`dryRun: true` 只编译 operation，不执行数据库 schema 变更，也不会同步 metadata。

### previewSql

```ts
const result = await builder.apply(operations, {
  dryRun: true,
  previewSql: true,
});
```

`previewSql: true` 会尝试返回底层 SQL。只有当前 `SchemaAdapter` 支持 SQL 编译时才会有结果。

### syncMetadata

```ts
await builder.createCollection('orders', definition, {
  syncMetadata: false,
});
```

默认会同步补充 Collection Metadata。`syncMetadata: false` 会跳过文档保存或更新，但 DDL 成功后仍然使
Registry 中的旧物理结构失效。物理 field、index 和 constraint 不会因为默认同步而复制进 Metadata Store。

### strict

```ts
await builder.apply(operations, {
  strict: true,
});
```

`strict: true` 用于 migration、CI 和生产发布。只要执行计划里出现 capability warning，实际 apply 会抛出 `UnsupportedCapabilityError`。

`strict: true` 不是 destructive 操作确认机制。`dropCollection()`、`dropField()` 等危险操作会体现在 `BuilderResult.impact` 中，调用方需要显式检查。

`dryRun: true` 会优先返回 warnings，不会因为 `strict: true` 直接抛错：

```ts
const result = await builder.apply(operations, {
  dryRun: true,
  strict: true,
});

console.log(result.warnings);
```

这样 Agent、CLI 或 UI 可以先展示风险，再决定是否继续。

### ifNotExists

```ts
await builder.createCollection('orders', definition, {
  ifNotExists: true,
});
```

`ifNotExists: true` 用于创建类操作。当前支持 `createCollection()`：当底层表已经存在时跳过建表，避免重复创建错误。

这个选项只表示“对象不存在才创建”，不会对已经存在的表做字段、索引或约束对齐。需要调整结构时，应继续写新的 migration，并使用 `alterCollection()`、`addField()`、`addIndex()` 等明确操作。

### ifExists

```ts
await builder.dropCollection('orders', {
  ifExists: true,
});
```

`ifExists: true` 用于删除类操作。当前支持 `dropCollection()`：当底层表不存在时跳过删除，避免缺失对象错误。

## 预留选项

以下选项已经出现在类型里，但当前还没有完整执行语义：

- `transaction`：当前不会自动包裹 Builder 操作；需要事务时使用 `db.transaction()` 或 `connection.transaction()`。

后续可以把 `transaction` 接入 Builder 执行流程。

## Agent 注意事项

- 自动执行前优先使用 `dryRun: true`。
- 需要给用户展示执行计划时，同时打开 `previewSql: true`。
- migration、CI 和生产发布建议使用 `strict: true`。
- 创建 collection 的 migration 建议使用 `{ ifNotExists: true }`，删除 collection 的回滚建议使用 `{ ifExists: true }`。
- destructive 操作不能只依赖选项兜底，应检查 `BuilderResult.impact`。
