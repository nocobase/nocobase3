---
title: Schema Inspector 设计
description: 定义如何通过数据库方言读取 Collection 解析所需的 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server 物理 Schema。
---

# Schema Inspector 设计

> 本文描述 `@nocobase/db` 第一版 `SchemaInspector` 的接口、语义和能力边界。

`SchemaInspector` 是数据库物理结构的只读入口。它把不同数据库的系统目录、`information_schema` 和
SQLite PRAGMA 统一为稳定的 NocoBase 物理 Schema 模型。

```text
DatabaseConnection
  -> SchemaInspector
  -> PhysicalCollectionSchema
```

当前支持 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server。后续数据库继续通过新的方言实现接入，不在公共接口中增加方言判断。

本文中的“完整”是指完整覆盖 Collection 解析所需且已声明支持的方面，不表示无损导出数据库全部目录。第一版不读取
trigger、stored procedure、grant、partition rule、storage parameter 等与运行时 Collection 模型无关的对象，
也不保证能从返回值还原原始 DDL。

## 设计目标

`SchemaInspector` 需要满足以下目标：

- 保留数据库中的物理名称、原生类型、索引和约束，不把物理事实改写成应用语义；
- 对 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server 暴露相同的读取接口；
- 完整表达复合主键、复合外键、复合 unique constraint 和复合 index；
- 区分 table、partitioned table、foreign table、view 和 materialized view；
- 显式说明某类信息是完整、部分可用还是不支持；
- 单个 Collection 可以按需读取，列表默认分页，全量扫描必须显式调用；
- 方言实现由明确的 Dialect Adapter 创建，不依赖 Knex 内部类名或运行时猜测。

## 职责边界

`SchemaInspector` 只读取数据库中的物理事实，包括：

- schema、table、view 和 materialized view；
- column、原生类型、nullable、default 和 generated column；
- primary key、unique constraint、foreign key 和 check constraint；
- 普通 index、unique index、表达式 index 和部分 index；
- 数据库能够提供的 table、column comment 和 view definition。

它不负责：

- 将 `order_items` 转换为逻辑 Collection 名 `orderItems`；
- 处理 `underscored`、`tablePrefix` 或 Collection 级 Naming；
- 读取或写入 Collection Metadata；
- 从 foreign key 自动创建应用层 relation；
- 合并出完整的 `CollectionDefinition`；
- 缓存 Collection 或生成 Agent Snapshot；
- 创建、修改或删除数据库对象。

这些职责分别属于 Naming、Metadata Store、Collection Resolver、Collection Registry 和 Collection
Builder：

```text
Physical database
  -> SchemaInspector
  -> PhysicalCollectionSchema
       + Naming
       + CollectionMetadataDocument
  -> CollectionResolver
  -> CollectionDefinition
  -> CollectionRegistry
```

普通应用、插件和 Agent 应使用 `connection.collections`。只有外部数据库接入、Schema 审计、drift
检查和 Schema Snapshot 生成等底层场景才直接使用 `connection.schemaInspector`。

## 与 Connection 和 Dialect 的关系

### 对外入口

`DatabaseConnection` 统一暴露 Inspector：

```ts
export interface DatabaseConnection {
  readonly dialect: DatabaseDialect;
  readonly schemaInspector: SchemaInspector;
}
```

`schemaInspector` 可以延迟创建，并复用 Connection 的底层客户端。读取物理 Schema 不应隐式创建第二个连接池。

事务 Connection 也暴露相同接口，但使用事务自己的底层客户端。调用方不能假设所有数据库都能在一个普通业务事务中
获得跨页一致的系统目录快照。

### 由 Dialect Adapter 创建

当前 `DatabaseDialect` 是配置中的字符串标识：

```ts
export type DatabaseDialect =
  'sqlite' | 'postgres' | 'mysql' | 'oracle' | 'mssql';
```

目标设计保留这个易读的配置值，并使用 `DatabaseDialectAdapter` 承载方言行为。该接口作为方言扩展点公开，
应用代码通常不需要直接使用：

```ts
export interface DatabaseDialectAdapter<TClient = unknown, TConfig = unknown> {
  readonly dialect: DatabaseDialect;

  createSchemaInspector(
    context: SchemaInspectorFactoryContext<TClient, TConfig>,
  ): SchemaInspector;
}

export interface SchemaInspectorFactoryContext<
  TClient = unknown,
  TConfig = unknown,
> {
  readonly connectionName: string;
  readonly config: Readonly<TConfig>;
  resolveClient(): Promise<TClient>;
}
```

具体结构如下：

```text
DatabaseConnection
  -> DatabaseDialectAdapter
       └── createSchemaInspector()
             ├── SqliteSchemaInspector
             ├── PostgresSchemaInspector
             └── MysqlSchemaInspector
```

Connection Adapter 根据已经校验过的 `config.dialect` 选择对应的 Dialect Adapter。禁止通过
`knex.client.constructor.name` 判断方言，也不在一个 `KnexSchemaInspector` 中堆叠大量 dialect switch。

第一阶段只需要让 Dialect Adapter 创建 Inspector，不要求同时重构现有 Query Adapter、Schema Adapter 或
Collection Builder。

## 公共读取接口

第一版公共接口保持少而明确：

```ts
export interface SchemaInspector {
  listSchemas(): Promise<PhysicalSchemaInfo[]>;

  getPhysicalCollection(
    identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined>;

  listPhysicalCollections(
    options?: ListPhysicalCollectionsOptions,
  ): Promise<PhysicalCollectionPage>;

  scanPhysicalCollections(
    options?: ScanPhysicalCollectionsOptions,
  ): AsyncIterable<PhysicalCollectionSchema>;
}
```

接口刻意不提供无参数的 `tables()`、`columns()` 或 `columnInfo()`。这类接口容易在表很多时隐式读取整个
数据库，也会把同一个物理对象拆成互相难以校验的零散结果。

### `listSchemas()`

返回当前 Connection 可用于 introspection 的物理 schema：

```ts
export interface PhysicalSchemaInfo {
  readonly name: string;
  readonly default: boolean;
}
```

`default: true` 表示省略 `schema` 时用于解析未限定物理名称的第一个有效 schema。一个结果集中最多只能有一个
default schema。

第一版中的方言语义：

- PostgreSQL 返回当前 Connection 有权访问的 schema，并标记 search path 中优先使用的 schema；
- MySQL 把当前 database 作为 schema 返回，不默认扫描同一服务器上的其他 database；
- SQLite 返回 `main`，第一版不扫描 `temp` 或通过 `ATTACH DATABASE` 附加的数据库。

`listSchemas()` 不返回 PostgreSQL 的 `pg_catalog`、`information_schema`，也不返回 MySQL 系统 database，
除非未来增加明确的系统对象读取选项。

### `getPhysicalCollection()`

读取一个 table 或 view 的完整物理结构：

```ts
export interface PhysicalCollectionIdentifier {
  readonly tableName: string;
  readonly schema?: string;
}

export interface PhysicalCollectionIdentity {
  readonly tableName: string;
  readonly schema: string;
}
```

`PhysicalCollectionIdentifier` 是查询参数，允许省略 schema；`PhysicalCollectionIdentity` 是 Inspector 已解析的
物理身份，schema 必填。两者的 `tableName` 都是物理名称，不接受逻辑 Collection 名。

如果调用方持有的是逻辑 Collection 名，应使用 `connection.collections.getPhysical(name)`。该入口先应用有效的
Connection 和 Collection naming（包括动态 `tablePrefix`），再调用 Inspector 读取真实物理结构。

如果省略 `schema`：

- PostgreSQL 按 Connection 配置的 search path 解析第一个匹配对象；
- MySQL 使用当前 database；
- SQLite 使用 `main`。

返回结果始终包含实际解析到的 `schema`。目标对象不存在时返回 `undefined`；权限错误、连接错误或系统目录查询失败
时抛错，不能伪装成不存在。

`getPhysicalCollection()` 默认读取本文模型规定的全部可用方面，不增加 `include` 参数。这样相同调用不会因为
调用方遗漏 include 而产生语义不完整却看似完整的结果。轻量发现由 `listPhysicalCollections()` 负责。

### `listPhysicalCollections()`

只返回轻量摘要，不读取字段、索引或约束：

```ts
export interface PhysicalCollectionSummary {
  readonly schema: string;
  readonly tableName: string;
  readonly kind: PhysicalCollectionKind;
  readonly comment?: string;
}

export interface ListPhysicalCollectionsOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly schemas?: readonly string[];
  readonly tableNamePrefixes?: readonly string[];
  readonly kinds?: readonly PhysicalCollectionKind[];
}

export interface PhysicalCollectionPage {
  readonly items: readonly PhysicalCollectionSummary[];
  readonly nextCursor?: string;
}
```

分页规则：

- 默认 `limit` 为 100，最大为 1000；
- Cursor 是不透明字符串，调用方不能解析、修改或自行构造；
- 结果按 `schema`、`tableName` 确定性排序；
- `schemas` 省略时使用当前 Connection 的默认 introspection 范围；
- `tableNamePrefixes` 是物理表名前缀，供 Naming Index 和 Snapshot 工具缩小扫描范围；
- `tableNamePrefixes` 省略表示不过滤，空数组表示不匹配任何对象；
- `tableNamePrefixes: ['']` 表示匹配范围内的全部对象；
- `kinds` 省略表示包含所有受支持的物理对象类型。

Cursor 必须绑定创建它的 schema、prefix、kind 等过滤条件。调用方改变过滤条件后继续使用旧 Cursor 时，Inspector
应报告无效 Cursor，而不是产生不可预测的翻页结果。

列表不提供 `includes` 或 `withColumns`。需要完整结构时，调用
`getPhysicalCollection(identifier)`；需要遍历完整结构时，使用 `scanPhysicalCollections()`。

### `scanPhysicalCollections()`

全量扫描是显式重操作：

```ts
export interface ScanPhysicalCollectionsOptions {
  readonly pageSize?: number;
  readonly schemas?: readonly string[];
  readonly tableNamePrefixes?: readonly string[];
  readonly kinds?: readonly PhysicalCollectionKind[];
}
```

`scanPhysicalCollections()` 内部使用轻量分页，再逐个读取完整结构，并通过 `AsyncIterable` 按需产出结果。它不能
先把所有完整 Collection 加载到内存。

扫描只保证确定性顺序，不保证跨页数据库快照。在扫描过程中新增、删除或重命名对象时，结果可能反映并发变化。需要
一致性检查的工具应在上层记录 fingerprint，并在扫描结束后检测变化；不能假设所有方言都支持相同的系统目录事务
语义。

## 物理 Collection 模型

Inspector 返回的模型只使用物理名称。`tableName`、`columnName` 不得经过 `underscored` 或 `tablePrefix`
反向转换。

```ts
export interface PhysicalCollectionSchema {
  readonly schema: string;
  readonly tableName: string;
  readonly kind: PhysicalCollectionKind;
  readonly comment?: string;
  readonly viewDefinition?: string;
  readonly columns: readonly PhysicalColumnSchema[];
  readonly primaryKey?: PhysicalPrimaryKeySchema;
  readonly uniqueConstraints: readonly PhysicalUniqueConstraintSchema[];
  readonly indexes: readonly PhysicalIndexSchema[];
  readonly foreignKeys: readonly PhysicalForeignKeySchema[];
  readonly checkConstraints: readonly PhysicalCheckConstraintSchema[];
  readonly inspection: PhysicalSchemaInspection;
}

export type PhysicalCollectionKind =
  'table' | 'partitionedTable' | 'foreignTable' | 'view' | 'materializedView';
```

`kind` 使用一个明确的联合类型，不使用 `isView`、`isForeign` 等可能产生无效组合的多个布尔值。

### Field

Field 同时保留跨方言归一化类型和数据库原生类型：

```ts
export interface PhysicalColumnSchema {
  readonly columnName: string;
  readonly ordinalPosition: number;
  readonly dataType: PhysicalDataType;
  readonly nativeType: string;
  readonly nativeTypeSchema?: string;
  readonly nullable: boolean;
  readonly default?: PhysicalColumnDefault;
  readonly autoIncrement: boolean;
  readonly unsigned?: boolean;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly comment?: string;
  readonly generated?: PhysicalGeneratedColumn;
}

export interface PhysicalColumnDefault {
  readonly expression: string;
  readonly value?: unknown;
}

export interface PhysicalGeneratedColumn {
  readonly expression?: string;
  readonly stored?: boolean;
}
```

`default.expression` 保留数据库报告的表达式；只有能无歧义解析的字面量才额外提供 `value`。不能把
`CURRENT_TIMESTAMP`、sequence 或方言函数错误解析成普通字符串。

`generated.expression` 在数据库无法可靠返回表达式时可以省略，但必须通过检查完整性和 warning 说明。

```ts
export type PhysicalDataType =
  | 'integer'
  | 'bigInt'
  | 'string'
  | 'text'
  | 'boolean'
  | 'decimal'
  | 'float'
  | 'double'
  | 'date'
  | 'time'
  | 'datetime'
  | 'json'
  | 'blob'
  | 'uuid'
  | 'native';
```

`dataType` 用于 Resolver 生成可移植 Field；`nativeType` 用于保存方言细节和诊断未知类型。无法可靠归一化
的类型使用 `dataType: 'native'`，但不能因此拒绝读取，也不得猜测成相近类型。

`increments` 是 Builder/Field 层的建表语义，不是物理数据类型。自增整数应返回 `dataType: 'integer'` 或
`'bigInt'`，同时设置 `autoIncrement: true`；Resolver 再根据主键等上下文决定是否生成 `increments` Field。

`nativeType` 应尽量保存数据库的完整类型表达：MySQL 不能只保存 `DATA_TYPE` 而丢失 `COLUMN_TYPE` 中的
`unsigned` 等信息；PostgreSQL 同时保存类型名称和 `nativeTypeSchema`，以区分内置类型和扩展类型。

### Primary key 和 unique constraint

```ts
export interface PhysicalPrimaryKeySchema {
  readonly name?: string;
  readonly columns: readonly string[];
}

export interface PhysicalUniqueConstraintSchema {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly deferrable?: boolean;
  readonly initiallyDeferred?: boolean;
}
```

`columns` 使用物理字段名，并严格保留数据库中的顺序。复合主键不能降级为第一个字段。普通 unique
constraint 和 unique index 是不同的物理对象，必须分别保存。

### Index

```ts
export type PhysicalIndexKey = (
  | {
      readonly columnName: string;
      readonly expression?: never;
    }
  | {
      readonly expression: string;
      readonly columnName?: never;
    }
) & {
  readonly order?: 'asc' | 'desc';
  readonly nulls?: 'first' | 'last';
};

export interface PhysicalIndexSchema {
  readonly name: string;
  readonly keys: readonly PhysicalIndexKey[];
  readonly includeColumns?: readonly string[];
  readonly unique: boolean;
  readonly backsConstraint?: PhysicalIndexConstraintReference;
  readonly method?: string;
  readonly predicate?: string;
}

export interface PhysicalIndexConstraintReference {
  readonly kind: 'primaryKey' | 'unique';
  readonly name?: string;
}
```

每个 key 必须且只能提供 `columnName` 或 `expression`。表达式 index 保留原始 SQL；部分 index
通过 `predicate` 保留条件；covering index 的非 key 字段放在 `includeColumns`。

约束背后的物理 index 可以出现在 `indexes` 中，并通过 `backsConstraint` 关联，但约束语义仍以
`primaryKey` 或 `uniqueConstraints` 为准。同一底层结构因此可能分别作为约束和 index 出现，它们不是两条独立的
业务规则。方言无法枚举底层约束 index 时，不需要伪造一个 index。

### Foreign key

```ts
export interface PhysicalForeignKeySchema {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly referencedCollection: PhysicalCollectionIdentity;
  readonly referencedColumns: readonly string[];
  readonly onDelete?: PhysicalReferentialAction;
  readonly onUpdate?: PhysicalReferentialAction;
  readonly deferrable?: boolean;
  readonly initiallyDeferred?: boolean;
}

export type PhysicalReferentialAction =
  'noAction' | 'restrict' | 'cascade' | 'setNull' | 'setDefault';
```

`columns` 和 `referencedColumns` 必须一一对应并保留约束中的原始顺序。物理 foreign key 只表示数据库
约束，不等同于 NocoBase relation；是否生成 relation 候选由更上层工具决定。

### Check constraint

```ts
export interface PhysicalCheckConstraintSchema {
  readonly name?: string;
  readonly expression: string;
}
```

第一版保留数据库返回的原始表达式，不尝试把所有方言 SQL 转换成统一 AST。

### View definition

View 和 materialized view 的查询定义属于物理事实，可以通过 `viewDefinition` 返回只读 SQL。它不是
Metadata Store 中可编辑的应用配置，也不能由 Resolver 用来修改外部数据库。

## 检查完整性

不同数据库和版本无法提供完全相同的信息。空数组只能表示“Inspector 已完成检查且没有找到对象”，不能同时表示
“没有权限”“当前方言不支持”或“实现尚未读取”。

```ts
export type PhysicalSchemaAspect =
  | 'columns'
  | 'primaryKey'
  | 'uniqueConstraints'
  | 'indexes'
  | 'foreignKeys'
  | 'checkConstraints'
  | 'comments'
  | 'viewDefinition';

export type PhysicalSchemaInspectionStatus =
  'complete' | 'partial' | 'unsupported';

export interface PhysicalSchemaInspection {
  readonly aspects: Readonly<
    Record<PhysicalSchemaAspect, PhysicalSchemaInspectionStatus>
  >;
  readonly warnings: readonly SchemaInspectionWarning[];
}

export interface SchemaInspectionWarning {
  readonly code: string;
  readonly message: string;
  readonly aspect: PhysicalSchemaAspect;
}
```

状态语义：

- `complete`：Inspector 能可靠判断该方面；空结果表示数据库中确实没有对应对象；
- `partial`：已返回可确认的信息，但数据库版本、权限或解析限制可能导致缺失；
- `unsupported`：当前方言或版本无法提供该方面。

对于普通 table，`viewDefinition: 'complete'` 表示 Inspector 能可靠判断它没有 View Definition，不代表该
table 是 view。这样无需再增加含义重复的 `notApplicable` 状态。

权限不足如果影响整个 Collection 的可靠读取，必须抛出错误。如果只影响一个可选方面且数据库允许可靠识别这一情况，
可以返回 `partial` 或 `unsupported` 并附带稳定 warning。禁止捕获任意 SQL 错误后返回空数组。

Resolver 根据检查状态决定哪些物理信息能够安全进入 `CollectionDefinition`。严格审计工具可以拒绝
`partial`；普通读取可以保留已确认的信息并向调用方暴露 warning。

## 各方言实现

方言实现共享类型、分页、cursor、warning 和基础校验工具，但不共享方言 SQL、default 解析、约束解析或 index
解析逻辑。

建议的源码结构：

```text
src/schema/inspector/
├── inspector.ts
├── types.ts
├── errors.ts
├── shared/
│   ├── cursor.ts
│   ├── pagination.ts
│   ├── result.ts
│   └── type-normalization.ts
└── dialects/
    ├── sqlite.ts
    ├── postgres.ts
    └── mysql.ts
```

### SQLite

主要数据来源：

- `sqlite_schema`；
- `PRAGMA table_xinfo`；
- `PRAGMA index_list`；
- `PRAGMA index_xinfo`；
- `PRAGMA foreign_key_list`；
- 必要时使用 `sqlite_schema.sql` 补充 View、Check、表达式 index 和 `AUTOINCREMENT` 信息。

实现要求：

- 第一版只读取 `main`；
- 支持 table 和 view，不伪造 materialized view；
- `table_xinfo.pk` 是主键顺序，不是简单布尔值；
- 正确保留复合主键和复合外键的顺序；
- 同时识别显式 `AUTOINCREMENT` 和 SQLite `INTEGER PRIMARY KEY` 的 rowid 行为；
- SQLite 没有原生 table/column comment，`comments` 标记为 `unsupported`；
- 依赖 SQL 文本解析才能获得且无法完全保证正确的信息标记为 `partial`，不能猜测。

### PostgreSQL

主要数据来源：

- `pg_class`、`pg_namespace`；
- `pg_attribute`、`pg_type`、`pg_attrdef`；
- `pg_constraint`、`pg_index`、`pg_am`；
- `pg_get_expr`、`pg_get_indexdef`、`pg_get_viewdef`；
- `obj_description`、`col_description`。

实现要求：

- 使用 `pg_catalog` 获取完整语义，不能只依赖 `information_schema`；
- 区分普通 table、partitioned table、foreign table、view 和 materialized view；
- 保留 schema、search path 和自定义类型所属 schema；
- 支持复合 key、deferrable constraint、表达式 index、部分 index 和 include column；
- 保留数据库原始顺序，不使用只取 `conkey[1]` 的实现；
- 排除系统 schema，除非调用方以后通过明确选项请求；
- 只返回当前 Connection 有权限 introspect 的对象。

### MySQL

主要数据来源：

- `information_schema.TABLES`；
- `information_schema.COLUMNS`；
- `information_schema.STATISTICS`；
- `information_schema.TABLE_CONSTRAINTS`；
- `information_schema.KEY_COLUMN_USAGE`；
- `information_schema.REFERENTIAL_CONSTRAINTS`；
- `information_schema.CHECK_CONSTRAINTS`；
- `information_schema.VIEWS`。

实现要求：

- 第一版只读取 Connection 配置的当前 database；
- database 在统一模型中作为 `schema`；
- 保留 `COLUMN_TYPE`，不能只保留 `DATA_TYPE`；
- `AUTO_INCREMENT` 从 `EXTRA` 读取；
- index key 顺序使用 `SEQ_IN_INDEX`；
- 支持的版本中通过 `STATISTICS.EXPRESSION` 保留表达式 index；
- Check Constraint 能力按实际服务器版本标记，不能把不支持误报为“没有”；
- 不默认把所有 `tinyint(1)` 推断为 boolean，类型归一化必须使用明确且可测试的规则；
- MySQL 没有 materialized view，不伪造对应对象类型。

### Oracle

主要数据来源：

- `USER_TABLES`、`USER_VIEWS`、`USER_MVIEWS`；
- `USER_TAB_COLS`、`USER_TAB_COMMENTS`、`USER_COL_COMMENTS`；
- `USER_CONSTRAINTS`、`USER_CONS_COLUMNS`；
- `USER_INDEXES`、`USER_IND_COLUMNS`、`USER_IND_EXPRESSIONS`；
- `USER_TRIGGERS`、`DBMS_XMLGEN` 和 `DBMS_METADATA`。

实现要求：

- 当前只读取当前 Connection user 的 schema，显式请求其他 schema 会报错；
- 区分 table、partitioned table、view 和 materialized view；
- `NUMBER(p,s)`、`VARCHAR2`、`CLOB`、`RAW`、`DATE` 等原生类型保留在 `nativeType`；
- Oracle `DATE` 归一化为 `datetime`，不错误归一化为只含日期的 `date`；
- 同时识别 Oracle identity column，以及 Knex 历史实现创建的 sequence + trigger 自增列；
- `ON UPDATE` 不作为 Oracle foreign key 能力；未声明 `ON DELETE` 时返回 `noAction`；
- 列表的 kind、prefix、cursor 和 limit 过滤在 SQL 层完成，不能先加载当前 schema 的所有对象再分页；
- `DBMS_XMLGEN` 不可用时，列 default 可以标记为 `partial`；连接失败和其他目录查询错误必须继续抛出。

### SQL Server

主要数据来源：

- `sys.schemas`、`sys.objects`、`sys.tables`、`sys.views`；
- `sys.columns`、`sys.types`、`sys.identity_columns`、`sys.computed_columns`；
- `sys.key_constraints`、`sys.foreign_keys`、`sys.foreign_key_columns`、`sys.check_constraints`；
- `sys.indexes`、`sys.index_columns`；
- `sys.default_constraints`、`sys.extended_properties`、`sys.sql_modules`。

实现要求：

- 默认 schema 使用当前登录用户的 `SCHEMA_NAME()`，通常是 `dbo`；
- identity、computed column 和 persisted 状态必须分别保留；
- filtered index 映射到 `predicate`，included column 映射到 `includeColumns`；
- 区分 unique constraint 和普通 unique index，并通过 `backsConstraint` 保留关系；
- `MS_Description` extended property 映射为 table/column comment；
- `bit`、`uniqueidentifier`、`datetime2`、`nvarchar(max)` 等类型保留原始 `nativeType`；
- 不把任意 `nvarchar(max)` 猜测成 JSON；没有明确物理证据时保持为字符串或原生类型；
- `RESTRICT` 在 SQL Server 中表现为 `NO ACTION`，Inspector 返回实际物理语义；
- SQL Server 系统 catalog 读取遇到错误 1205 deadlock 时做有限重试，其他错误仍必须抛出。

## 命名边界

Inspector 的输入和输出都是物理名称：

```text
SchemaInspector:       tbl_order_items.order_no
Naming + Metadata:     orderItems.orderNo
CollectionResolver:    CollectionDefinition
```

`tablePrefix` 不是 Inspector 自动移除的配置。上层可以把 Connection 默认前缀和 Naming Index 中的
Collection 级前缀整理成 `tableNamePrefixes`，用于缩小列表范围；Inspector 返回的仍然是带前缀的完整
`tableName`。

同理，`underscored` 不影响 Inspector。物理字段 `created_at` 始终返回 `created_at`，由 Resolver 决定它
最终是逻辑字段 `createdAt` 还是保留原名。

## 错误约定

第一版至少区分以下错误：

```ts
export type SchemaInspectorErrorCode =
  | 'SCHEMA_INSPECTION_FAILED'
  | 'SCHEMA_INSPECTION_PERMISSION_DENIED'
  | 'SCHEMA_INSPECTION_INVALID_CURSOR'
  | 'SCHEMA_INSPECTION_INVALID_OPTIONS'
  | 'SCHEMA_INSPECTION_UNSUPPORTED_DIALECT';
```

错误必须包含稳定 code、Connection 名、dialect，以及能够定位问题的 schema/tableName；不得在错误信息中输出
密码、连接串或其他凭据。

目标对象不存在不是错误，`getPhysicalCollection()` 返回 `undefined`。Cursor 无效、`limit` 超出范围、请求
不存在或无权访问的 schema，以及系统目录查询失败属于错误，不能返回空页掩盖问题。

## 性能与一致性约束

- `listPhysicalCollections()` 只查询轻量摘要，不连接所有字段和约束目录；
- `getPhysicalCollection()` 的方言查询必须限定到一个明确的物理对象；
- `scanPhysicalCollections()` 必须分页并按需产出；
- 不为一次扫描对所有表发起无限并发查询；并发度由实现设置安全上限；
- Cursor 必须包含版本信息，未来调整编码格式时可以明确拒绝旧 Cursor；
- 列表排序和复合 key/index 字段顺序必须确定，便于 Snapshot、diff 和 Agent 使用；
- Snapshot 生成器负责记录生成时间、dialect 和 fingerprint，Inspector 本身不持久化结果；
- Schema 在读取期间发生变化时，Inspector 不合并两个版本的结构；只允许对 SQL Server catalog 的瞬时 deadlock 做有限重试。

## 第一版验收范围

实现完成至少需要覆盖以下测试：

- SQLite、PostgreSQL、MySQL、Oracle、SQL Server 的 table、view、字段和注释能力；
- PostgreSQL materialized view、partitioned table 和 foreign table；
- 单字段与复合 primary key、unique constraint、foreign key；
- 普通、unique、复合、表达式和部分 index，在不支持的方言中验证状态；
- default、generated column、auto increment、unknown native type；
- schema/search path、同名 table 和不存在对象；
- 默认分页、最大 limit、cursor 翻页、filter 和无效 cursor；
- `complete`、`partial`、`unsupported` 三种检查状态；
- 权限错误和连接错误不能退化为空结果；
- 大量 table 的列表不会隐式加载全部字段和约束；
- 事务 Connection 复用事务客户端，普通 Connection 不创建额外连接池。

当前不要求实现 SQLite attached database、MySQL 跨 database 扫描或 Oracle 跨 schema 扫描，但公共模型不能阻止以后添加这些能力。

## 后续扩展方向

SQLite、PostgreSQL、MySQL、Oracle、SQL Server Inspector 及公共接口已经实现，并已作为
`CollectionResolver` 的稳定输入。后续扩展不影响当前 M0–M7 完整链路：

1. 持续补充权限、并发变化及各数据库版本差异测试；
2. 按实际需求增加其他方言 Adapter；
3. 在 Resolver 之上增加可选的 Snapshot 与 Agent 导出工具。

## 参考边界

实现时可以借鉴 Kysely 的 Dialect 创建 Introspector、独立方言类、只读结果和确定性排序；也可以参考
`knex-schema-inspector` 中各数据库系统目录查询和测试场景。

NocoBase 不直接采用这两个项目的公共接口，也不把它们作为核心运行时依赖，因为它们没有完整表达本设计要求的
复合约束、index、View、检查完整性和分页语义。复制第三方实现代码时必须遵循其许可证并保留必要声明。

## 相关文档

- [Schema Inspector 示例](./schema-inspector-examples.md)
- [Collection 架构](./architecture.md)
- [Collection Resolver 设计](./collection-resolver.md)
- [Collection Registry 设计](./collection-registry.md)
- [Metadata Store 设计](./metadata-store.md)
- [Collection 解析生命周期](./collection-resolution.md)
