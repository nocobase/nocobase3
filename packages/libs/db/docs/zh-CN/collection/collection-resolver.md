---
title: Collection Resolver 设计
description: 说明物理 Schema、命名规则和补充 Metadata 如何合并为完整 CollectionDefinition。
---

# Collection Resolver 设计

> `@nocobase/db` 已提供本文第一版 `CollectionResolver`；跨 Collection 图校验和 Registry 集成在后续批次实现。

`CollectionResolver` 是纯合并和校验层：

```text
PhysicalCollectionSchema
  + NamingOptions
  + CollectionMetadataDocument
  -> CollectionResolutionResult
```

它不执行 introspection，不写 Metadata Store，也不缓存结果。

可使用 class 或等价的纯函数入口：

```ts
const result = new CollectionResolver().resolve(input);
const sameResult = resolveCollection(input);
```

第一版公共输入和输出契约为：

```ts
export interface CollectionResolutionInput {
  readonly physical: PhysicalCollectionSchema;
  readonly metadata?: CollectionMetadataDocument;
  readonly naming?: NamingOptions;
  readonly context: CollectionResolutionContext;
}

export interface CollectionResolutionResult {
  readonly collection: CollectionDefinition;
  readonly inspection: PhysicalSchemaInspection;
  readonly warnings: readonly CollectionResolutionWarning[];
}

export interface CollectionResolutionContext {
  resolvePhysicalCollection(
    identity: PhysicalCollectionIdentity,
  ): CollectionNamingIdentity | undefined;
}

export interface CollectionNamingIdentity {
  readonly name: string;
  readonly naming: Required<NamingOptions>;
}
```

`physical` 是 Inspector 的单个对象结果；`metadata` 缺失是合法情况；`naming` 是 Connection 默认值。
Resolver 还接收只读 Naming Index 上下文，用于将 foreign key 引用的物理表和字段转换为目标
Collection 自己的逻辑名称。这避免用 source Collection 的命名规则错误解析 target 表。找不到显式 Metadata
时，Naming Index 使用 Connection 默认规则生成 identity。

Resolver 返回 result 而不是裸 `CollectionDefinition`，因为 `partial`、`unsupported` 和 Inspector warning
不能在进入 Registry 时丢失。`inspection` 原样保留 Inspector 的完整性信息；`warnings` 包含 Inspector warning
和 Resolver 根据非 complete aspect 生成的稳定 warning。

Resolver warning 使用 `COLLECTION_INSPECTION_PARTIAL`、`COLLECTION_INSPECTION_UNSUPPORTED` 或
`COLLECTION_INSPECTION_WARNING`。提升 Inspector warning 时，Inspector 原始 code 保存在 `sourceCode`。

## 合并顺序

1. 使用 Connection 级 `naming` 作为默认值。
2. 应用 Collection Metadata 中的确定性 `naming` 覆盖。
3. 将物理 `tableName` 和 `columnName` 转换为逻辑名，并通过 Naming Index 解析外键 target。
4. 从物理 Schema 生成 Field、index 和 constraint。
5. 将 `fields` 中的补充 Metadata 合并到物理 Field。
6. 增加 `relations`。
7. 执行冲突、drift 和 relation 校验。

物理事实不会被 Metadata 覆盖。例如 Metadata 不能改变 `nullable`、物理类型、主键、索引和外键。
输出 `collection.naming` 是合并后的完整 effective naming，保证脱离输入后仍能解释逻辑名与物理名的关系。

## 逻辑命名

`underscored: true` 时，物理 `order_items` 解析为逻辑 `orderItems`，`created_at` 解析为
`createdAt`。`underscored: false` 时保留原名。`tablePrefix` 只从表名头部移除，不影响 Field。

任意 `tableName` 和 `columnName` 映射不属于第一版设计。如果反向命名不能确定唯一逻辑名，Resolver 应报告
冲突，不得静默猜测。

反向命名不是天然双射。例如多个异常物理列名可能同时归一化成同一个逻辑名。Resolver 必须先转换全部字段，再检查
逻辑名唯一性；冲突时停止解析。每次反向推导还必须用同一个 effective naming 正向计算并与原物理名严格比较；
不能完成 round trip 的名称报告 `COLLECTION_NAME_CONFLICT`。

有 Metadata 时，`metadata.name` 和 effective naming 正向计算出的表名必须与 `physical.tableName` 一致；不一致是
`COLLECTION_SCHEMA_DRIFT`，Resolver 不尝试 rename。没有 Metadata 时，Collection 逻辑名由物理表名反向推导。

## 完整物理到运行时映射

以下表是第一版实现规范。表中 `db.*` 是 `DbOptions` 或 `DialectOptions` 的只读 introspection 扩展，
用于保留当前通用 DSL 没有独立顶层属性的物理细节；这些值不属于 editable Metadata。

### Collection

| Physical Schema                                | CollectionDefinition                                  |
| ---------------------------------------------- | ----------------------------------------------------- |
| `table`                                        | `kind: 'table'`                                       |
| `partitionedTable`                             | `kind: 'table'`，并保存 `db.physicalKind`             |
| `foreignTable`                                 | `kind: 'table'`，并保存 `db.physicalKind`             |
| `view`                                         | `kind: 'view'`                                        |
| `materializedView`                             | `kind: 'materializedView'`                            |
| `schema`                                       | `db.schema`                                           |
| physical Collection comment                    | `db.comment`                                          |
| Metadata `title`、`description`                | 同名属性                                              |
| Connection naming + Metadata collection naming | 完整的 effective `naming`                             |
| 完整的 `viewDefinition`                        | `view.asRaw: { sql: viewDefinition }`                 |
| 缺失或不完整的 View Definition                 | 不生成 `view.asRaw`，通过 inspection/warning 明确说明 |

`partitionedTable` 和 `foreignTable` 映射为 `table` 是因为当前 Builder 的 `CollectionKind` 不承诺创建这两类
方言对象；`db.physicalKind` 保留读取侧差异。Resolver 结果不能据此推导 DDL 能力。

## Field 解析

物理 Field 首先生成可移植 Field 定义：

```text
Physical dataType      -> FieldDefinition.type
Physical nullable      -> FieldDefinition.nullable
Physical default       -> FieldDefinition.defaultValue + db.defaultExpression
Physical nativeType    -> FieldDefinition.db.nativeType
Physical comment       -> FieldDefinition.db.comment
```

Metadata 只合并 `title` 和 `description`。`fields` 项找不到物理 Field 时是 Schema drift，
不得将其隐式解释为虚拟字段。

精确规则如下：

| Physical column                            | FieldDefinition                                              |
| ------------------------------------------ | ------------------------------------------------------------ |
| `columnName`                               | 按 effective naming 反向推导后的 `name`                      |
| `dataType`                                 | `type`；未知原生类型保持 `type: 'native'`                    |
| `nullable`                                 | `nullable`                                                   |
| `autoIncrement`                            | `autoIncrement`；不改写为 DSL 快捷类型 `increments`          |
| `unsigned`、`length`、`precision`、`scale` | 同名属性                                                     |
| `nativeType`、`nativeTypeSchema`           | `db.nativeType`、`db.nativeTypeSchema`                       |
| `comment`                                  | `db.comment`                                                 |
| default 含可解析 `value`                   | `defaultValue`，并始终在 `db.defaultExpression` 保留原表达式 |
| default 只有表达式                         | 只写 `db.defaultExpression`，不猜测 `defaultValue`           |
| generated/computed                         | `db.generated: { expression?, stored? }`                     |

物理列按 `ordinalPosition` 排序后生成 fields。generated column 不会伪装成 default，也不会生成 virtual Field。
单列主键同样不写 `FieldDefinition.primaryKey`；Resolver 对所有主键统一生成 constraint，避免单列和复合主键使用
两套事实表示。

## Index 与 constraint

Inspector 返回的物理列名必须转换为逻辑 Field 名。主键、unique、foreign key 和普通 index 保留原始字段
顺序。映射规则为：

| Physical object                                    | 运行时表示                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| primary key                                        | 一个 `PrimaryConstraintDefinition`；不同时设置 Field `primaryKey` |
| unique constraint                                  | `UniqueConstraintDefinition`                                      |
| foreign key                                        | `ForeignKeyConstraintDefinition`                                  |
| check constraint                                   | `CheckConstraintDefinition.expression` 原始字符串                 |
| 独立普通或 unique index                            | `IndexDefinition`；`db.unique` 保存 unique 标记                   |
| `backsConstraint` index                            | 不再生成普通 index，避免和主键/unique constraint 重复             |
| index column key                                   | 转换后的 `fields`；column key 的 order 同时进入 `order`           |
| index expression key                               | 原始表达式进入 `expressions`                                      |
| key 的完整交错顺序、每个 key 的 `order` 和 `nulls` | `db.keys`                                                         |
| `includeColumns`                                   | 转换后的逻辑 Field 名进入 `db.includeFields`                      |
| `method`                                           | `type`                                                            |
| filtered index `predicate`                         | 原始字符串进入 `db.predicate`                                     |

`fields` 和 `expressions` 分别便于现有消费者读取；`db.keys` 是混合 column/expression index 的无损顺序表示。
原始 predicate 不进入结构化 `FilterExpression`，因为 Resolver 不解析或猜测 SQL 表达式。约束或 index
引用不存在的本地物理列时报告 `COLLECTION_PHYSICAL_REFERENCE_INVALID`。

foreign key 的 target Collection 必须由 `CollectionResolutionContext` 按 `{ schema, tableName }` 精确解析，
再使用 target 自己的 naming 转换 referenced columns。缺少 target identity 或 referenced column 无法 round trip
时报告 `COLLECTION_PHYSICAL_REFERENCE_INVALID`。方言 referential action 映射如下：

| Physical action | ReferentialAction |
| --------------- | ----------------- |
| `cascade`       | `cascade`         |
| `restrict`      | `restrict`        |
| `setNull`       | `set null`        |
| `setDefault`    | `set default`     |
| `noAction`      | `no action`       |

`deferrable: false` 映射为 `false`；可延迟且 `initiallyDeferred: true` 映射为 `deferred`，否则映射为
`immediate`。

Relation Metadata 表达应用关联，物理 foreign key 表达数据库约束，两者可以同时存在：

```text
RelationFieldDefinition       应用层关联
ForeignKeyConstraintDefinition 物理外键事实
```

有物理外键不代表必须自动生成 relation。只有明确可推导且没有命名冲突时，工具才可将它作为候选；经确认后写入
Metadata。

### Relation 分阶段校验

Relation 可能形成循环依赖，例如 `users.department -> departments` 和 `departments.owner -> users`。因此
`get('users')` 不能为了验证 target 而递归等待 `get('departments')`，否则会形成循环 Promise。

校验分为两阶段：

1. Resolver 在解析单个 Collection 时完成本地结构校验，包括字段重名、`sourceKey` 是否存在，以及
   `belongsTo.foreignKey` 是否能定位本地物理 Field。`belongsTo.foreignKey` 缺失时按 relation 的确定性
   foreign-key 名查找并在输出中补成逻辑 Field 名；找不到时报告 `COLLECTION_RELATION_INVALID`。
2. `CollectionRelationValidator` 在 Metadata 写入、显式模型审计、`scan()` 或 `export()` 时完成跨 Collection
   校验，包括 target 是否存在、`targetKey` 是否存在、`hasOne`/`hasMany` 的 remote foreign key 和 through
   Collection 是否有效。

普通 `get()` 不递归解析整张关系图。跨 Collection 校验按图遍历，并通过 visited 状态处理循环关系。

## View 与写入能力

Inspector 负责报告物理对象是 table、view 还是 materialized view，Resolver 将其保留为
`CollectionDefinition.kind`。第一版不在 Collection Metadata 中保存 `writable`，也不由 Resolver
推导统一的记录写权限。记录 mutation 能力由数据库、Query 执行结果和上层权限模型负责；
`schemaManagement` 仅控制 DDL 和 Migration，不能据此判断业务记录是否可写。

## inspection 完整性策略

`columns` 是生成 Collection fields 的最低必要事实。`inspection.aspects.columns` 为 `partial` 或
`unsupported` 时，Resolver 抛出 `COLLECTION_SCHEMA_INCOMPLETE`，不返回看似完整的 Collection。

其他 aspect 为 `partial` 或 `unsupported` 时，Resolver 保留已经确认的结果并返回 warning：

- `primaryKey`、`uniqueConstraints`、`indexes`、`foreignKeys`、`checkConstraints` 不完整时，不补猜缺失对象；
- `comments` 不完整时，只保留已取得的 comment；
- `viewDefinition` 不完整时不生成 `view.asRaw`；
- 每个非 complete aspect 至少生成一个 `COLLECTION_INSPECTION_PARTIAL` 或
  `COLLECTION_INSPECTION_UNSUPPORTED` warning；Inspector 自己的 warning 也原样提升到 result。

调用方可以正常展示或查询 partial 结果，但需要完整审计、Snapshot 或迁移规划时必须自行要求所有相关 aspect
为 `complete`。Resolver 不把 warning 自动升级成跨方言的一刀切错误。

## 校验错误

第一版对单个 Collection 的本地结构默认严格校验，不完整结果不能静默进入 Registry。跨 Collection 错误由
`CollectionRelationValidator` 汇总。Resolver 聚合当前输入中所有可确认错误：

```ts
export class CollectionResolutionError extends Error {
  readonly code = 'COLLECTION_RESOLUTION_FAILED';
  readonly issues: readonly CollectionResolutionIssue[];
}
```

每个 issue 有稳定 code、结构化 path 和 message。第一版 code 为：

- `COLLECTION_SCHEMA_INCOMPLETE`；
- `COLLECTION_SCHEMA_DRIFT`；
- `COLLECTION_NAME_CONFLICT`；
- `COLLECTION_FIELD_CONFLICT`；
- `COLLECTION_PHYSICAL_REFERENCE_INVALID`；
- `COLLECTION_RELATION_INVALID`；

无法归一化的物理类型以 `type: 'native'` 和 `db.nativeType` 进入解析结果，不会仅因为类型未知而阻止读取。
只有 Builder 试图执行不可移植的 Schema 修改时，才需要按方言能力拒绝操作。

## 兼容当前 Metadata Store

当前 Store 仍然返回完整 `CollectionDefinition`。迁移期 Resolver 只从中提取 Collection/Field 的
`title`、`description`、relations 和 `naming`；物理 Field、index 和 constraint 仍以 Inspector 为准。

Metadata Store 切换到 `CollectionMetadataDocument` 后，Resolver 的物理输入和完整输出不变。

## 相关文档

- [Schema Inspector 设计](./schema-inspector.md)
- [Collection Registry 设计](./collection-registry.md)
- [Metadata Store 设计](./metadata-store.md)
- [Collection 解析生命周期](./collection-resolution.md)
