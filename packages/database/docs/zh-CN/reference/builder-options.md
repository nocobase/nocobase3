# BuilderExecOptions

`BuilderExecOptions` 控制 Builder 执行方式。它面向自动化、CLI、file sync、migration 和 Agent 场景。

```ts
interface BuilderExecOptions {
  dryRun?: boolean;
  previewSql?: boolean;
  syncMetadata?: boolean;
  // reserved; currently not a runtime guarantee
  ifNotExists?: boolean;
  // reserved; currently not a runtime guarantee
  ifExists?: boolean;
  strict?: boolean;
  // reserved; currently not a runtime guarantee
  transaction?: boolean;
}
```

## CollectionBuilderOptions

创建 `CollectionBuilder` 时可以传入 schema adapter、metadata store 和命名配置：

```ts
interface CollectionBuilderOptions {
  schemaAdapter?: SchemaAdapter;
  metadataStore?: CollectionMetadataStore;
  naming?: NamingOptions;
  namingStrategy?: NamingStrategy;
}
```

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

- `underscored: true`：把推导出的表名和列名转成小写下划线。
- `tablePrefix`：只作用于推导出的表名或视图名，不作用于列名。

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

默认会同步 Collection metadata。`syncMetadata: false` 会跳过 metadata 保存或更新。

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

## 预留选项

以下选项已经出现在类型里，但当前原型还没有完整执行语义：

- `ifNotExists`：当前不会阻止重复创建错误。
- `ifExists`：当前不会阻止缺失对象错误。
- `transaction`：当前不会自动包裹 Builder 操作；需要事务时使用 `db.transaction()` 或 `connection.transaction()`。

后续可以把它们接入 capability 校验、幂等执行、严格模式和事务包裹。

## Agent 注意事项

- 自动执行前优先使用 `dryRun: true`。
- 需要给用户展示执行计划时，同时打开 `previewSql: true`。
- migration、CI 和生产发布建议使用 `strict: true`。
- 不要把预留选项当成已经生效的运行时保证。
- destructive 操作不能只依赖选项兜底，应检查 `BuilderResult.impact`。
