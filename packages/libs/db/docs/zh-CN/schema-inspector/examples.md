---
title: Schema Inspector 示例
description: 通过 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server 示例说明物理 Schema 读取、分页、扫描和检查完整性。
---

# Schema Inspector 示例

> **文档类型：当前 API 示例。** 先阅读 [`connection.schemaInspector`](./overview.md) 了解当前 API 和名称语义，再按数据库方言查阅本页。

> 本文使用 [Schema Inspector 内部实现](../internals/schema-inspector/architecture.md) 中已经实现的接口。不同数据库版本返回的
> 原生表达式文本可能略有差异，调用方应以结构化字段为主，不应依赖表达式字符串的排版。

`SchemaInspector` 面向物理数据库结构。示例中的 `tableName`、`columnName` 和
`referencedCollection` 都是物理名称，不应用 `underscored` 或 `tablePrefix`。

## 读取可用 Schema

```ts
const schemas = await connection.schemaInspector.listSchemas();
```

PostgreSQL Connection 配置了 `schema: ['tenant_a', 'public']` 时，可以返回：

```ts
[
  { name: 'tenant_a', default: true },
  { name: 'public', default: false },
];
```

`default: true` 表示省略 schema 时首先用于解析未限定物理名称。MySQL 当前只返回 Connection 使用的 database；SQLite 当前只返回：

```ts
[{ name: 'main', default: true }];
```

Oracle 返回当前 user 的 schema，例如：

```ts
[{ name: 'NOCOBASE', default: true }];
```

当前 Oracle Inspector 不跨 schema 扫描；请求其他 schema 会返回明确的 invalid options 错误。

SQL Server 会返回当前数据库中可见的用户 schema，并将登录用户的默认 schema 标记为 `default: true`：

```ts
[
  { name: 'dbo', default: true },
  { name: 'sales', default: false },
];
```

## 读取 SQL Server Table

```ts
const orders = await connection.schemaInspector.getPhysicalCollection({
  schema: 'dbo',
  tableName: 'orders',
});
```

SQL Server 的 identity、computed persisted column、filtered index 和 included column 会保留为结构化信息：

```ts
{
  schema: 'dbo',
  tableName: 'orders',
  kind: 'table',
  columns: [
    {
      columnName: 'id',
      dataType: 'bigInt',
      nativeType: 'bigint',
      autoIncrement: true,
    },
    {
      columnName: 'normalized_email',
      nativeType: 'nvarchar(255)',
      generated: {
        expression: '(lower([email]))',
        stored: true,
      },
    },
  ],
  indexes: [
    {
      name: 'idx_orders_email',
      keys: [{ columnName: 'email', order: 'desc' }],
      includeColumns: ['created_at'],
      predicate: '([email] IS NOT NULL)',
      unique: false,
    },
  ],
}
```

`nvarchar(max)` 本身不证明字段是 JSON。Inspector 不根据应用习惯猜测物理语义；JSON relation 或业务含义应由 Metadata 和 Resolver 补充。

## 读取 Oracle Table

```ts
const orders = await connection.schemaInspector.getPhysicalCollection({
  tableName: 'orders',
});
```

Oracle identity、`DATE` 和函数索引会保留为可判断的结构：

```ts
{
  schema: 'NOCOBASE',
  tableName: 'orders',
  kind: 'table',
  columns: [
    {
      columnName: 'id',
      dataType: 'decimal',
      nativeType: 'NUMBER',
      autoIncrement: true,
    },
    {
      columnName: 'created_at',
      dataType: 'datetime',
      nativeType: 'DATE',
      autoIncrement: false,
    },
  ],
  indexes: [
    {
      name: 'idx_orders_email_lower',
      keys: [{ expression: 'LOWER("email")', order: 'asc' }],
      unique: false,
      method: 'FUNCTION-BASED NORMAL',
    },
  ],
}
```

不要依赖 Oracle 返回的表达式关键字大小写；对表达式做审计或 diff 时应先规范化空白和大小写。

## 读取 PostgreSQL Table

```ts
const orders = await connection.schemaInspector.getPhysicalCollection({
  schema: 'sales',
  tableName: 'orders',
});
```

一个包含复合 unique constraint、复合 foreign key、部分 index 和 check constraint 的结果可以是：

```ts
const orders: PhysicalCollectionSchema = {
  schema: 'sales',
  tableName: 'orders',
  kind: 'table',
  comment: 'Customer orders.',
  columns: [
    {
      columnName: 'id',
      ordinalPosition: 1,
      dataType: 'bigInt',
      nativeType: 'int8',
      nativeTypeSchema: 'pg_catalog',
      nullable: false,
      default: {
        expression: "nextval('sales.orders_id_seq'::regclass)",
      },
      autoIncrement: true,
      comment: 'Internal order ID.',
    },
    {
      columnName: 'tenant_id',
      ordinalPosition: 2,
      dataType: 'bigInt',
      nativeType: 'int8',
      nativeTypeSchema: 'pg_catalog',
      nullable: false,
      autoIncrement: false,
    },
    {
      columnName: 'order_no',
      ordinalPosition: 3,
      dataType: 'string',
      nativeType: 'varchar(40)',
      nativeTypeSchema: 'pg_catalog',
      nullable: false,
      autoIncrement: false,
      length: 40,
    },
    {
      columnName: 'customer_id',
      ordinalPosition: 4,
      dataType: 'bigInt',
      nativeType: 'int8',
      nativeTypeSchema: 'pg_catalog',
      nullable: false,
      autoIncrement: false,
    },
    {
      columnName: 'status',
      ordinalPosition: 5,
      dataType: 'native',
      nativeType: 'order_status',
      nativeTypeSchema: 'sales',
      nullable: false,
      default: {
        expression: "'pending'::sales.order_status",
        value: 'pending',
      },
      autoIncrement: false,
    },
    {
      columnName: 'created_at',
      ordinalPosition: 6,
      dataType: 'datetime',
      nativeType: 'timestamptz',
      nativeTypeSchema: 'pg_catalog',
      nullable: false,
      default: {
        expression: 'now()',
      },
      autoIncrement: false,
    },
    {
      columnName: 'deleted_at',
      ordinalPosition: 7,
      dataType: 'datetime',
      nativeType: 'timestamptz',
      nativeTypeSchema: 'pg_catalog',
      nullable: true,
      autoIncrement: false,
    },
  ],
  primaryKey: {
    name: 'orders_pkey',
    columns: ['id'],
  },
  uniqueConstraints: [
    {
      name: 'orders_tenant_order_no_key',
      columns: ['tenant_id', 'order_no'],
      deferrable: false,
      initiallyDeferred: false,
    },
  ],
  indexes: [
    {
      name: 'orders_pkey',
      keys: [{ columnName: 'id', order: 'asc' }],
      unique: true,
      backsConstraint: {
        kind: 'primaryKey',
        name: 'orders_pkey',
      },
      method: 'btree',
    },
    {
      name: 'orders_tenant_order_no_key',
      keys: [
        { columnName: 'tenant_id', order: 'asc' },
        { columnName: 'order_no', order: 'asc' },
      ],
      unique: true,
      backsConstraint: {
        kind: 'unique',
        name: 'orders_tenant_order_no_key',
      },
      method: 'btree',
    },
    {
      name: 'orders_open_customer_created_idx',
      keys: [
        { columnName: 'customer_id', order: 'asc' },
        { columnName: 'created_at', order: 'desc' },
      ],
      includeColumns: ['status'],
      unique: false,
      method: 'btree',
      predicate: 'deleted_at IS NULL',
    },
    {
      name: 'orders_order_no_lower_idx',
      keys: [
        {
          expression: 'lower(order_no::text)',
          order: 'asc',
        },
      ],
      unique: false,
      method: 'btree',
    },
  ],
  foreignKeys: [
    {
      name: 'orders_customer_fk',
      columns: ['tenant_id', 'customer_id'],
      referencedCollection: {
        schema: 'sales',
        tableName: 'customers',
      },
      referencedColumns: ['tenant_id', 'id'],
      onDelete: 'restrict',
      onUpdate: 'cascade',
      deferrable: false,
      initiallyDeferred: false,
    },
  ],
  checkConstraints: [
    {
      name: 'orders_order_no_not_empty',
      expression: 'length(order_no::text) > 0',
    },
  ],
  inspection: {
    aspects: {
      columns: 'complete',
      primaryKey: 'complete',
      uniqueConstraints: 'complete',
      indexes: 'complete',
      foreignKeys: 'complete',
      checkConstraints: 'complete',
      comments: 'complete',
      viewDefinition: 'complete',
    },
    warnings: [],
  },
};
```

这个结果保留了几个重要边界：

- PostgreSQL 自定义 enum 无法安全归一化时使用 `dataType: 'native'`，同时保留类型所属 schema；
- sequence default 保留为表达式，不解析成普通字符串值；
- 复合 foreign key 两侧字段按位置一一对应；
- unique constraint 与它背后的 unique index 分开表达，再通过 `backsConstraint` 关联；
- `deleted_at IS NULL` 是 index predicate，不是 Collection Metadata；
- 表达式 index 使用 `keys[].expression` 保留原始 SQL，不伪装成普通 Field index。

## 读取同名 PostgreSQL Table

如果 `tenant_a.orders` 和 `public.orders` 同时存在，应显式指定 schema：

```ts
const tenantOrders = await connection.schemaInspector.getPhysicalCollection({
  schema: 'tenant_a',
  tableName: 'orders',
});

const publicOrders = await connection.schemaInspector.getPhysicalCollection({
  schema: 'public',
  tableName: 'orders',
});
```

省略 schema 时，Inspector 按 Connection 的 search path 返回第一个匹配对象。结果中的 `schema` 仍然必填：

```ts
const orders = await connection.schemaInspector.getPhysicalCollection({
  tableName: 'orders',
});

orders?.schema === 'tenant_a';
```

## 读取 PostgreSQL View

```ts
const activeOrders: PhysicalCollectionSchema = {
  schema: 'sales',
  tableName: 'active_orders',
  kind: 'view',
  viewDefinition:
    'SELECT id, order_no FROM sales.orders WHERE deleted_at IS NULL;',
  columns: [
    {
      columnName: 'id',
      ordinalPosition: 1,
      dataType: 'bigInt',
      nativeType: 'int8',
      nativeTypeSchema: 'pg_catalog',
      nullable: true,
      autoIncrement: false,
    },
    {
      columnName: 'order_no',
      ordinalPosition: 2,
      dataType: 'string',
      nativeType: 'varchar(40)',
      nativeTypeSchema: 'pg_catalog',
      nullable: true,
      autoIncrement: false,
      length: 40,
    },
  ],
  uniqueConstraints: [],
  indexes: [],
  foreignKeys: [],
  checkConstraints: [],
  inspection: {
    aspects: {
      columns: 'complete',
      primaryKey: 'complete',
      uniqueConstraints: 'complete',
      indexes: 'complete',
      foreignKeys: 'complete',
      checkConstraints: 'complete',
      comments: 'complete',
      viewDefinition: 'complete',
    },
    warnings: [],
  },
};
```

Inspector 只报告物理 View。View 是否允许写入由 Resolver 和 Connection 能力决定，Metadata 不能把物理只读对象
强制改成可写。

## 读取 SQLite Table

假设 SQLite Table 使用 `INTEGER PRIMARY KEY`，并包含 SQL 文本中的 check constraint：

```ts
const tasks: PhysicalCollectionSchema = {
  schema: 'main',
  tableName: 'tasks',
  kind: 'table',
  columns: [
    {
      columnName: 'id',
      ordinalPosition: 1,
      dataType: 'integer',
      nativeType: 'INTEGER',
      nullable: false,
      autoIncrement: true,
    },
    {
      columnName: 'title',
      ordinalPosition: 2,
      dataType: 'text',
      nativeType: 'TEXT',
      nullable: false,
      autoIncrement: false,
    },
    {
      columnName: 'status',
      ordinalPosition: 3,
      dataType: 'text',
      nativeType: 'TEXT',
      nullable: false,
      default: {
        expression: "'pending'",
        value: 'pending',
      },
      autoIncrement: false,
    },
  ],
  primaryKey: {
    columns: ['id'],
  },
  uniqueConstraints: [],
  indexes: [],
  foreignKeys: [],
  checkConstraints: [
    {
      expression: "status IN ('pending', 'done')",
    },
  ],
  inspection: {
    aspects: {
      columns: 'complete',
      primaryKey: 'complete',
      uniqueConstraints: 'complete',
      indexes: 'complete',
      foreignKeys: 'complete',
      checkConstraints: 'partial',
      comments: 'unsupported',
      viewDefinition: 'complete',
    },
    warnings: [
      {
        code: 'SQLITE_CHECK_CONSTRAINT_PARTIAL',
        message:
          'Check constraints were parsed from the SQLite schema SQL and may be incomplete.',
        aspect: 'checkConstraints',
      },
    ],
  },
};
```

`autoIncrement: true` 表示 SQLite 的 `INTEGER PRIMARY KEY` 使用 rowid 分配整数值，不要求原始 DDL
一定写了 `AUTOINCREMENT`。SQLite 没有原生 table/column comment，所以 `comments` 是
`unsupported`，而不是 `complete`。

复合主键必须按 SQLite `table_xinfo.pk` 的序号排序：

```ts
{
  primaryKey: {
    columns: ['tenant_id', 'task_no'],
  },
}
```

不能只返回第一个主键字段，也不能按字段名重新排序。

## 读取 MySQL Table

MySQL 必须保留 `COLUMN_TYPE` 中的完整类型信息：

```ts
const inventoryColumns: PhysicalColumnSchema[] = [
  {
    columnName: 'id',
    ordinalPosition: 1,
    dataType: 'bigInt',
    nativeType: 'bigint unsigned',
    nullable: false,
    autoIncrement: true,
    unsigned: true,
  },
  {
    columnName: 'quantity',
    ordinalPosition: 2,
    dataType: 'integer',
    nativeType: 'int unsigned',
    nullable: false,
    default: {
      expression: '0',
      value: 0,
    },
    autoIncrement: false,
    unsigned: true,
  },
  {
    columnName: 'enabled',
    ordinalPosition: 3,
    dataType: 'integer',
    nativeType: 'tinyint(1)',
    nullable: false,
    default: {
      expression: '1',
      value: 1,
    },
    autoIncrement: false,
    unsigned: false,
  },
  {
    columnName: 'available_quantity',
    ordinalPosition: 4,
    dataType: 'integer',
    nativeType: 'int',
    nullable: true,
    autoIncrement: false,
    generated: {
      expression: 'greatest(quantity, 0)',
      stored: true,
    },
  },
];
```

这个示例刻意把 `tinyint(1)` 归一化为 `integer`。Inspector 不能只根据显示宽度猜测 boolean；原始
`nativeType: 'tinyint(1)'` 始终保留。

旧 MySQL 或兼容数据库无法可靠读取 check constraint 时，应明确报告：

```ts
{
  checkConstraints: [],
  inspection: {
    aspects: {
      checkConstraints: 'unsupported',
    },
    warnings: [
      {
        code: 'MYSQL_CHECK_CONSTRAINT_UNSUPPORTED',
        message:
          'Check constraint introspection is not supported by this server version.',
        aspect: 'checkConstraints',
      },
    ],
  },
}
```

上面的片段只展示相关字段，不是完整的 `PhysicalCollectionSchema`。

## 分页读取物理摘要

```ts
const firstPage = await connection.schemaInspector.listPhysicalCollections({
  schemas: ['sales'],
  tableNamePrefixes: ['app_', 'audit_'],
  kinds: ['table', 'view'],
  limit: 100,
});
```

返回值只包含摘要：

```ts
{
  items: [
    {
      schema: 'sales',
      tableName: 'app_customers',
      kind: 'table',
      comment: 'Customers.',
    },
    {
      schema: 'sales',
      tableName: 'app_orders',
      kind: 'table',
      comment: 'Customer orders.',
    },
  ],
  nextCursor: 'opaque-cursor',
}
```

读取下一页时必须保持相同过滤条件：

```ts
const secondPage = await connection.schemaInspector.listPhysicalCollections({
  schemas: ['sales'],
  tableNamePrefixes: ['app_', 'audit_'],
  kinds: ['table', 'view'],
  limit: 100,
  cursor: firstPage.nextCursor,
});
```

改变过滤条件后继续使用旧 Cursor 应被拒绝。省略 `tableNamePrefixes` 或传入 `['']` 表示匹配当前范围内
全部对象；传入空数组表示不匹配任何对象。

## 显式扫描完整 Schema

```ts
for await (const collection of connection.schemaInspector.scanPhysicalCollections(
  {
    schemas: ['sales'],
    tableNamePrefixes: ['app_'],
    pageSize: 100,
  },
)) {
  await snapshotWriter.write(collection);
}
```

`scanPhysicalCollections()` 先分页读取摘要，再按需读取单个对象的完整结构。调用方可以逐个生成 Snapshot，不需要
把整个数据库保存在内存中。扫描期间 Schema 可能变化，需要一致性的 Snapshot 工具应另外记录和比较 fingerprint。

## 区分“没有”和“不支持”

已经完整检查并确认没有 index：

```ts
{
  indexes: [],
  inspection: {
    aspects: {
      indexes: 'complete',
    },
  },
}
```

当前方言或版本无法读取 index：

```ts
{
  indexes: [],
  inspection: {
    aspects: {
      indexes: 'unsupported',
    },
  },
}
```

返回了能够确认的 index，但结果可能不完整：

```ts
{
  indexes: [
    {
      name: 'orders_customer_idx',
      keys: [{ columnName: 'customer_id' }],
      unique: false,
    },
  ],
  inspection: {
    aspects: {
      indexes: 'partial',
    },
    warnings: [
      {
        code: 'INDEX_EXPRESSION_PARTIAL',
        message: 'One or more index expressions could not be inspected.',
        aspect: 'indexes',
      },
    ],
  },
}
```

这些片段只突出完整性语义。调用方不能只判断数组是否为空；Resolver、Schema 审计和 Snapshot 工具必须同时读取
对应的检查状态。

## 对象不存在与读取失败

对象不存在时返回 `undefined`：

```ts
const missing = await connection.schemaInspector.getPhysicalCollection({
  schema: 'sales',
  tableName: 'missing_orders',
});

missing === undefined;
```

以下情况必须抛出带稳定 code 的错误，不能返回 `undefined` 或空数组：

- 数据库连接失败；
- 无权访问请求的 schema 或系统目录；
- Cursor 无效或与过滤条件不匹配；
- `limit` 超过最大值；
- 方言 introspection 查询失败。

```ts
try {
  await connection.schemaInspector.listPhysicalCollections({
    limit: 10_000,
  });
} catch (error) {
  if (
    error instanceof SchemaInspectorError &&
    error.code === 'SCHEMA_INSPECTION_INVALID_OPTIONS'
  ) {
    // Handle an invalid caller option.
  }
}
```

错误可以包含 Connection 名、dialect、schema 和 tableName，但不能包含密码、完整连接串或其他凭据。

## 从物理 Schema 到 Collection

Inspector 返回物理名称：

```text
app_order_items.created_at
```

Naming、Metadata 和 Resolver 再生成逻辑名称：

```text
orderItems.createdAt
```

普通应用、插件和 Agent 应读取解析后的入口：

```ts
const orderItems = await connection.collections.get('orderItems');
```

需要验证托管 Collection 的原始物理 Schema 时，仍然传入逻辑名称，由 Registry 解析动态前缀和 Collection 级
naming：

```ts
const physicalOrderItems =
  await connection.collections.getPhysical('orderItems');
```

只有外部数据库接入、drift 检查或数据库结构审计等底层工具需要直接使用
`connection.schemaInspector`。

## 相关文档

- [Schema Inspector 内部架构](../internals/schema-inspector/architecture.md)
- [物理 Schema 模型](../internals/schema-inspector/physical-schema-model.md)
- [方言行为](../internals/schema-inspector/dialects.md)
- [分页、完整性与错误](../internals/schema-inspector/pagination-and-errors.md)
- [Collection Resolver 内部实现](../internals/collection/resolver.md)
- [Collection Registry 内部实现](../internals/collection/registry.md)
- [Collection 解析生命周期](../internals/collection/resolution-lifecycle.md)
