---
title: Repository 提案
description: Collection-aware Repository 的分批实现设计与当前运行时能力。
---

# Repository 概览

> **状态：V1 运行时已实现。** 公共类型、`RepositoryError`、`db.repository()` 和 `connection.repository()` 已导出；标量 CRUD、关系 selection/filter/sort、Relation Mutation、optimistic lock 和结果 envelope 均可执行，并已通过 SQLite、PostgreSQL、MySQL、Oracle 与 MSSQL 集成测试。本页同时记录 V1 契约与后续边界。

`Repository` 是应用层数据访问入口。它和 `db.query()` 的核心区别不是 API 写法，而是所处层级不同：

| API               | 层级         | 输入名                          | 是否读取 Collection metadata | 当前状态 |
| ----------------- | ------------ | ------------------------------- | ---------------------------- | -------- |
| `db.query()`      | 数据库查询层 | table / column query identifier | 否                           | 已实现   |
| `db.repository()` | 应用数据层   | Collection / Field 逻辑名       | 是                           | 已实现   |

Repository 会面向 Collection 工作，理解字段类型、关系、约束、应用层元信息和未来的数据转换规则。它适合承载常规 CRUD、关系筛选、HTTP / CLI 数据访问，以及 Agent 需要理解业务数据模型的场景。

## 为什么需要 Repository

`QueryAdapter` 的职责是提供跨数据库的基础查询能力。它不读取 Collection metadata，因此不会知道：

- `collection.name` 对应哪个物理表。
- `field.name` 对应哪个物理列。
- 某个字段属于 string、number、date 还是 relation。
- 某个 relation 是 to-one 还是 to-many。
- 某个筛选条件应该使用哪个 NocoBase filter operator group。

Repository 则工作在应用层：

```text
Repository operation
  -> bound DatabaseConnection
  -> resolved CollectionDefinition
  -> resolve Field / Relation / Constraint
  -> normalize and validate Select / Filter / Sort / Mutation AST
  -> compile query or mutation plan
  -> execute on the bound DatabaseConnection
  -> Database
  -> assemble logical result
```

因此，Repository 的输入、AST 和逻辑计划只使用 Collection / Field 逻辑名，不暴露、保存或向下传递 `tableName`、`columnName` 等物理 identifier。绑定 connection 的数据库 adapter 在编译或执行时，根据 Collection 与 Connection naming 完成物理 identifier 映射和 quoting；这是 adapter 内部职责，不是 Repository API 或逻辑计划契约。

## Repository 与 Collection

Repository 绑定一个 `DatabaseConnection` 和一个 Collection 逻辑名。Collection 是
Repository 的唯一结构模型来源；Repository 不维护第二套字段、关系、约束或命名定义。

```text
Repository(collectionName)
  -> connection.collections.get(collectionName)
  -> resolved CollectionDefinition
  -> resolve Field / Relation / Constraint
  -> validate and compile AST
  -> execute through the bound connection's database adapter
```

`connection.collections.get()` 返回物理 Schema 与补充 Collection metadata 合并后的
`CollectionDefinition`。Repository 只使用解析结果中的逻辑名称和结构信息：

- 从 `fields` 解析直接标量 Field 和 relation Field；
- 从 relation Field 解析基数、目标 Collection、source/target key、foreign key 和 through
  Collection；
- 从 `constraints` 解析主键和允许作为 `UniqueSelector` 的唯一 Field 集合；
- 从 Field 的 `type` 判断可用的 Filter operator group、值校验和排序能力；
- 将只含逻辑名的查询或写入计划交给绑定 connection 的数据库 adapter。

Repository 的创建入口可以保持同步；解析 Collection 可以延迟到第一次 operation，并复用
`connection.collections` 的缓存与失效机制。Repository 不直接把原始
`CollectionMetadataDocument` 当作完整 Collection，也不要求调用方为 Repository 重复注册
相同的字段和关系。

关系路径的每一级都从当前 Collection 解析。以 `orders.customer.name` 为例，Repository
先从 `orders` Collection 找到 `customer` relation，再加载它的目标 Collection，并在目标
Collection 中解析 `name` Field。Repository 不根据路径名称、输入值形状或物理列类型猜测
字段和关系语义。

Collection 决定 Repository V1 的结构能力。Repository V1 不注入或执行 policy；授权必须由
调用 Repository 的可信边界预先完成。`context` 只用于变量解析，不能承载或暗示已完成授权。

### Field 语义来源

Repository V1 不再定义一套独立的“应用字段类型”。字段是否为标量或 relation、值类型、
nullable、默认值、生成方式、唯一性以及关系基数，都从 resolved `CollectionDefinition` 的
Field、Relation 和 Constraint 读取。Filter Builder 的 group 也只由路径终点 Field 的
`type` 决定；UI 控件类型和字段名称不参与推断。

V1 只支持文档明确列出的内置 Field type/operator group 映射。遇到尚无 Repository 语义的
自定义 Field type、`blob` 或 `native` 时，应返回 capability/validation error，而不是根据
输入值或物理列类型猜测。未来扩展也应挂在 Collection Field type 的能力定义上，不在
Repository 中复制字段配置。

V1 使用固定 Field type capability matrix：

| Field type                                           | Filter group  | Sort     | 普通 `values` 写入                |
| ---------------------------------------------------- | ------------- | -------- | --------------------------------- |
| `increments`                                         | number        | 是       | 否                                |
| `integer` / `bigInt`                                 | number        | 是       | 是，但 optimistic lock Field 除外 |
| `decimal` / `float` / `double`                       | number        | 是       | 是                                |
| `string` / `uuid`                                    | string        | 是       | 是                                |
| `text`                                               | text          | 否       | 是                                |
| `boolean`                                            | boolean       | 是       | 是                                |
| `date` / `datetime`                                  | date          | 是       | 是                                |
| `time`                                               | time          | 是       | 是                                |
| `json`                                               | 暂无 operator | 否       | 是                                |
| `blob` / `native`                                    | 不支持        | 否       | 是                                |
| `belongsTo` / `hasOne` / `hasMany` / `belongsToMany` | relation      | 专用节点 | `values` 中的字段级关系操作       |

generated、virtual 和 auto-increment Field 不接受普通写入；optimistic lock Field 只由
Repository 管理；relation Field 在 `createOne()` / `updateOne()` 的模型形状 `values` 中使用
字段级 Builder 或纯 JSON 操作对象。View 和 materialized view 在
Repository V1 中只读。

### Collection optimistic lock 配置

Repository 不根据 `version`、`_version`、`updatedAt` 等名称猜测并发控制。需要 optimistic
lock 的 Collection 必须显式配置版本 Field。提案中的扩展形态为：

```ts
interface OptimisticLockDefinition {
  field: string;
  strategy: 'increment';
}

interface CollectionDefinition {
  optimisticLock?: OptimisticLockDefinition;
}
```

`field` 是当前 Collection 的直接、非空 `integer` 或 `bigInt` Field 逻辑名。该 Field 由
Repository 管理：创建时初始化为 `1`，普通 `values` 不能提供或修改，根记录每次成功更新时
递增。
该配置属于补充 Collection metadata，必须持久化在 `CollectionMetadataDocument` 并合并到
resolved `CollectionDefinition`，不能从物理 Schema 猜测。metadata 校验必须确认 Field
存在、为直接非空 `integer` 或 `bigInt`，并拒绝 view/materialized view。当前运行时代码已实现该配置、metadata 持久化、校验与标量 mutation 版本递增。

### 内部执行适配器

Repository 不直接扩大公共 `QueryAdapter` 的职责。实现使用包内的
`RepositoryExecutionAdapter`：它接收 resolved Collection graph 和只含逻辑名的 query /
mutation plan，在数据库 adapter 内完成命名、quoting、join、locking、returning 和事务方言
处理。该接口是 Repository 与具体数据库实现之间的内部边界，不向 Repository 调用方导出。

Repository、AST 和逻辑计划始终不持有物理 identifier；内部执行 adapter 只有在生成具体
数据库操作时才解析物理表列名。现有 `db.query()` 继续保持轻量基础查询层定位。

Repository 的查询和写入都通过它绑定的 `DatabaseConnection` 执行。事务回调中的
`connection.repository()` 必须复用该事务 connection，不能回到外层 `DatabaseManager` 或
另一条 connection。

## V1 接口

Repository 保持克制，但接口把结果选择、筛选、排序、分页、变量上下文和写入作用域表达
完整。下面的类型摘录当前 V1 契约：

```ts
type RepositoryRecord = Record<string, unknown>;

type RepositoryContext = Readonly<Record<string, unknown>>;

type FilterShorthandValue = string | number | boolean | null;

type FilterShorthand<TRecord extends object> = Readonly<
  Partial<{
    [TKey in keyof TRecord]: FilterShorthandValue;
  }>
>;

type RepositoryFilter<TRecord extends object> =
  | FilterShorthand<TRecord>
  | FilterAst
  | ((filter: FilterBuilder<TRecord>) => FilterNode);

interface NonEmptySortAst extends SortAst {
  items: readonly [SortItemNode, ...SortItemNode[]];
}

interface RepositoryReadOptions {
  select?: SelectAst;
  context?: RepositoryContext;
}

interface FindManyOptions<
  TRecord extends object,
> extends RepositoryReadOptions {
  filter?: RepositoryFilter<TRecord>;
  sort?: SortAst;
  limit?: number;
  offset?: number;
}

type FindOneOptions<TRecord extends object> = RepositoryReadOptions &
  (
    | {
        filter: RepositoryFilter<TRecord>;
        sort?: SortAst;
      }
    | {
        filter?: RepositoryFilter<TRecord>;
        sort: NonEmptySortAst;
      }
  );

interface FilterOnlyOptions<TRecord extends object> {
  filter?: RepositoryFilter<TRecord>;
  context?: RepositoryContext;
}

interface CreateOneOptions<TCreate extends object> {
  values: CreateMutationValues<TCreate>;
  select?: SelectAst;
}

interface CreateManyOptions<TCreate extends object> {
  values: readonly [TCreate, ...TCreate[]];
}

interface SingleMutationSelector<TRecord extends object> {
  filter: RepositoryFilter<TRecord>;
}

type UpdateOneOptions<
  TUpdate extends object,
  TRecord extends object,
> = SingleMutationSelector<TRecord> & {
  select?: SelectAst;
  ifVersion?: string | number;
  context?: RepositoryContext;
  values: UpdateMutationValues<TUpdate>;
};

interface DescribeMutationOptions {
  operation: 'createOne' | 'updateOne';
}

type ValidateMutationOptions<
  TCreate extends object,
  TUpdate extends object,
  TRecord extends object,
> =
  | {
      operation: 'createOne';
      values: CreateMutationValues<TCreate>;
    }
  | {
      operation: 'updateOne';
      filter: RepositoryFilter<TRecord>;
      ifVersion?: string | number;
      values: UpdateMutationValues<TUpdate>;
    };

type MutationScope<TRecord extends object> =
  | {
      filter: RepositoryFilter<TRecord>;
      all?: never;
    }
  | {
      filter?: never;
      all: true;
    };

type UpdateManyOptions<
  TRecord extends object,
  TUpdate extends object,
> = MutationScope<TRecord> & {
  values: TUpdate;
  context?: RepositoryContext;
};

type DeleteOneOptions<TRecord extends object> =
  SingleMutationSelector<TRecord> & {
    ifVersion?: string | number;
    context?: RepositoryContext;
  };

type DeleteManyOptions<TRecord extends object> = MutationScope<TRecord> & {
  context?: RepositoryContext;
};

interface CreateManyResult {
  createdCount: number;
}

interface UpdateManyResult {
  updatedCount: number;
}

interface DeleteOneResult {
  deleted: true;
}

interface DeleteManyResult {
  deletedCount: number;
}

interface CreatedTargetReference {
  clientKey: string;
  // Logical Collection name; unique also contains logical Field names.
  collection: string;
  unique: UniqueSelector;
}

interface SingleMutationResult<TResult> {
  record: TResult;
  createdTargets: readonly CreatedTargetReference[];
  version?: string | number;
}

interface DatabaseManager {
  repository<
    TRecord extends object = RepositoryRecord,
    TCreate extends object = Partial<TRecord>,
    TUpdate extends object = Partial<TCreate>,
  >(
    collectionName: string,
    connectionName?: string,
  ): Repository<TRecord, TCreate, TUpdate>;
}

interface DatabaseConnection {
  repository<
    TRecord extends object = RepositoryRecord,
    TCreate extends object = Partial<TRecord>,
    TUpdate extends object = Partial<TCreate>,
  >(
    collectionName: string,
  ): Repository<TRecord, TCreate, TUpdate>;
}

interface Repository<
  TRecord extends object = RepositoryRecord,
  TCreate extends object = Partial<TRecord>,
  TUpdate extends object = Partial<TCreate>,
> {
  readonly collectionName: string;

  findMany(options?: FindManyOptions<TRecord>): Promise<RepositoryRecord[]>;
  findOne(
    options: FindOneOptions<TRecord>,
  ): Promise<RepositoryRecord | undefined>;

  count(options?: FilterOnlyOptions<TRecord>): Promise<number>;
  exists(options?: FilterOnlyOptions<TRecord>): Promise<boolean>;

  describeMutation(
    options: DescribeMutationOptions,
  ): Promise<RepositoryMutationDescription>;
  validateMutation(
    options: ValidateMutationOptions<TCreate, TUpdate, TRecord>,
  ): Promise<MutationValidationResult>;

  createOne(
    options: CreateOneOptions<TCreate>,
  ): Promise<SingleMutationResult<RepositoryRecord>>;
  createMany(options: CreateManyOptions<TCreate>): Promise<CreateManyResult>;
  updateOne(
    options: UpdateOneOptions<TUpdate, TRecord>,
  ): Promise<SingleMutationResult<RepositoryRecord>>;
  updateMany(
    options: UpdateManyOptions<TRecord, TUpdate>,
  ): Promise<UpdateManyResult>;
  deleteOne(options: DeleteOneOptions<TRecord>): Promise<DeleteOneResult>;
  deleteMany(options: DeleteManyOptions<TRecord>): Promise<DeleteManyResult>;
}

type RepositoryErrorCode =
  | 'COLLECTION_NOT_FOUND'
  | 'FIELD_NOT_FOUND'
  | 'FIELD_CAPABILITY_NOT_SUPPORTED'
  | 'INVALID_AST'
  | 'INVALID_FILTER'
  | 'INVALID_SELECT'
  | 'INVALID_SORT'
  | 'INVALID_MUTATION'
  | 'INVALID_UNIQUE_SELECTOR'
  | 'RECORD_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'RELATION_ACTION_NOT_ALLOWED'
  | 'RELATION_REASSIGNMENT_REQUIRED';

interface RepositoryErrorShape {
  code: RepositoryErrorCode;
  message: string;
  path?: readonly (string | number)[];
  collection?: string;
  field?: string;
  relation?: string;
  retryable: boolean;
  details?: Readonly<Record<string, unknown>>;
}
```

所有 Repository 公共执行方法失败时抛出携带上述 shape 的 `RepositoryError`。
`validateMutation()` 不返回 `Error` 实例，而返回可序列化、与 `RepositoryErrorShape` 同构的
错误项。`code` 是程序分支依据，`message` 用于诊断；AST 校验错误尽可能携带精确 `path`。
实现可以继续补充稳定的细分 code，但不能用数据库原始错误文本作为公共错误契约。

这里用 `RepositoryRecord` 简化表示 Select AST 产生的动态结果。正式 TypeScript API
实现时，返回结构应由 Collection 类型信息和 `select` 常量推导，不能提供
`findMany<TResult>()` 让调用方任意断言结果类型。无论有没有静态类型，Repository 都
必须在运行时根据 Collection metadata 校验 Select、Filter、Sort 和写入值。

### 查询语义

- `select` 省略时返回根 Collection 的全部直接非 relation Field，不自动加载 relation。
- `select.root.fields` 只接受当前 selection 节点的直接标量字段；relation 使用显式的
  `select.root.relations` 节点递归选择。
- `findMany()` 可以不带 `filter`，表示读取整个 Collection。`limit` 和 `offset` 必须是
  非负整数；不传 `limit` 时 Repository 本身不偷偷增加上限，HTTP、CLI 等边界层应设置
  自己的默认分页限制。
- `findOne()` 不是“按唯一键查找”的别名。它返回匹配结果中的第一条，因此必须至少提供
  `filter` 或含排序项的 `sort`。Repository 根据 Collection metadata 自动追加唯一
  tie-breaker，确保单条选择与分页稳定。
- `sort` 使用 Sort AST，不使用 `-createdAt`、`createdAt DESC`、tuple 或 object map
  简写。直接字段、to-one relation field 和 to-many relation aggregate 使用不同节点。
- `count()` 统计符合筛选条件的记录总数，`exists()` 只判断是否至少存在一条；二者忽略
  Select、Sort 和分页，因此只接受 `filter` 与 `context`。

Select AST 的结果形状、relation filter/sort、批量加载和兼容转换见
[Select AST](./select-ast.md)。Sort AST 的直接字段、关系字段、关系聚合、NULL 和稳定排序
语义见 [Sort AST](./sort-ast.md)。

### 写入语义与安全边界

写入方法按记录基数对称命名，方法名本身即表达选择方式、关系能力和结果形态：

| 方法           | 根记录作用域                  | V1 关系写入 | 结果                   |
| -------------- | ----------------------------- | ----------- | ---------------------- |
| `createOne()`  | 一个新根记录                  | 支持        | `SingleMutationResult` |
| `createMany()` | 一个非空的根记录列表          | 不支持      | `{ createdCount }`     |
| `updateOne()`  | `filter` 必须恰好匹配一条记录 | 支持        | `SingleMutationResult` |
| `updateMany()` | 显式 `filter` 或 `all: true`  | 不支持      | `{ updatedCount }`     |
| `deleteOne()`  | `filter` 必须恰好匹配一条记录 | 不支持      | `{ deleted: true }`    |
| `deleteMany()` | 显式 `filter` 或 `all: true`  | 不支持      | `{ deletedCount }`     |

这六个名称是 V1 的唯一规范写法，不再提供语义含糊的 `create()`、`update()`、`delete()`
别名。Agent 仅根据方法名就能判断单条/批量边界，不需要结合参数猜测。

六个写入方法的可运行示例、关系操作、批量安全和返回结果见
[Repository 写入方法示例](./mutation-examples.md)。

- `TRecord`、`TCreate` 和 `TUpdate` 分开建模。数据库生成的主键、创建时间等字段可以只
  出现在 `TRecord` 中；必填创建字段可以放在 `TCreate` 中；可修改字段放在
  `TUpdate` 中。未提供静态类型时，它们分别退化为记录的部分字段。
- `findMany()`、`findOne()`、`count()` 和 `exists()` 直接返回查询结果，不增加 Repository
  envelope。`createOne()` 和 `updateOne()` 返回 `SingleMutationResult`：`record` 是按
  `select` 回读的最终记录，`createdTargets` 是 nested create 的 `clientKey` 到真实唯一键
  引用列表，没有 nested create 时也是空数组；启用 optimistic lock 时返回最新 `version`。
  `select` 只控制 `record`，不裁剪 envelope 的其他字段。
- `createMany()` 接受非空 `values` 列表，只创建根记录的直接标量字段。
  批量记录必须先全部校验，再在同一事务中创建；任一记录失败则整批回滚。
- `createOne()` 和 `updateOne()` 的 `values` 可以按字段使用 Relation Builder 或纯 JSON
  关系操作。
- `updateOne()` 和 `deleteOne()` 的 `filter` 必须恰好匹配一条记录：0 条返回
  `RECORD_NOT_FOUND`，多条返回 `MULTIPLE_RECORDS_MATCHED`。
- `updateOne()` 必须提供非空 `values`。`deleteOne()` 只删除根记录，不在同一输入里混入
  relation mutation；关系限制和级联行为由 Collection metadata 与数据库约束决定。
- `createMany()`、`updateMany()` 和 `deleteMany()` 返回与操作对应的明确计数字段，不使用
  容易混淆的统一 `affectedCount`。V1 的批量方法都不接受关系操作。
- `updateOne()` 和 `updateMany()` 的 `values` 不能是空对象。
- `updateMany()` 和 `deleteMany()` 必须明确提供 `filter`。确实需要作用于整个 Collection
  时，调用方必须显式写 `all: true`；`filter` 和 `all` 互斥。空 group、缺失 filter 或把
  变量解析成空条件都不能被当作全量操作。
- 数据库生成字段、只读字段和未知字段出现在根 `values` 时，应在执行查询前报错。relation
  Field 根据 Collection metadata 归一化为内部 Mutation AST 节点；关系作用域内的目标
  `update/upsert/delete` 已支持，`belongsToMany` through payload 仍不属于 V1。
- 包含关系的 mutation 必须先整体校验，再在一个事务中执行根记录、目标记录和中间关系
  写入。省略 relation Field 表示不修改；to-one 清空使用 `disconnect`，to-many 完整替换
  使用 `set`，包括以空数组清空关系。
- Collection 启用 optimistic lock 后，`ifVersion` 比较和 mutation 必须原子执行；版本不匹配
  返回稳定的 `VERSION_CONFLICT`，记录不存在返回 `RECORD_NOT_FOUND`。成功的
  `updateOne()`（包括仅修改关系）和 `updateMany()` 都递增根版本。`deleteOne()` 可先比较
  `ifVersion` 再删除，但删除后不返回新版本。
- 调用方传入 `ifVersion` 而 Collection 未配置 optimistic lock 时应返回校验错误；未传时仍
  允许写入，由可信调用边界决定是否强制客户端提供。Repository 不猜测版本 Field。

内部 Mutation AST、字段级 Builder、有界嵌套、Agent 工作流和执行边界见
[Mutation AST](./mutation-ast.md)。大表单的前端编译流程见
[表单到 Repository Mutation](./form-mutation.md)。

模型形状 `values`、字段级 Relation Builder 与严格单条 `filter` 的设计取舍见
[Repository 写入 API 改进提案](./prisma-inspired-mutations.md)。

`describeMutation()` 和 `validateMutation()` 是模型形状 mutation 的发现与预校验入口，
因此 V1 的 `operation` 只包含支持字段级关系操作的 `createOne` 和 `updateOne`，不泛化成
六种 CRUD 方法的第二套执行 API。

`context` 是只读变量解析上下文。Repository V1 不把 `context.user` 等值解释为授权信息，
也不在内部注入 policy；HTTP、CLI、service 等调用边界必须在调用 Repository 前完成授权。

示例：

```ts
interface OrderRecord {
  id: string;
  orderNo: string;
  amount: number;
  status: 'pending' | 'paid' | 'completed';
  createdAt: Date;
}

interface CreateOrder {
  orderNo: string;
  amount: number;
  status: OrderRecord['status'];
}

type UpdateOrder = Partial<Pick<CreateOrder, 'amount' | 'status'>>;

const orderRepository = db.repository<OrderRecord, CreateOrder, UpdateOrder>(
  'orders',
);

const orders = await orderRepository.findMany({
  select: {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: ['id', 'orderNo', 'amount', 'createdAt'],
      relations: [
        {
          kind: 'relation',
          field: 'customer',
          select: {
            kind: 'selection',
            fields: ['id', 'name'],
          },
        },
        {
          kind: 'relation',
          field: 'items',
          select: {
            kind: 'selection',
            fields: ['id', 'productName', 'quantity'],
          },
          sort: {
            kind: 'sort',
            version: 1,
            items: [
              {
                by: { kind: 'field', field: 'createdAt' },
                direction: 'desc',
                nulls: 'last',
              },
            ],
          },
        },
      ],
    },
  },
  filter: (filter) =>
    filter.and([
      filter.string('status').eq('paid'),
      filter.number('amount').gte(100),
      filter.date('createdAt').notBefore('2026-01-01'),
    ]),
});
```

`findOne()` 使用同一套 Select AST 和 Sort AST：

```ts
const order = await orderRepository.findOne({
  filter: { orderNo: 'SO-001' },
  select: {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: ['id', 'orderNo'],
      relations: [
        {
          kind: 'relation',
          field: 'customer',
          select: {
            kind: 'selection',
            fields: ['id', 'name'],
          },
        },
      ],
    },
  },
});
```

这里的 `orders`、`orderNo`、`customer`、`items` 都是应用层逻辑名。Repository 根据
Collection metadata 校验三棵 AST，编译数据库查询和批量关系加载计划，再按 Select AST
组装最终结果。

## 和 QueryAdapter 的关系

`db.query()` 仍然保留，用于更接近 SQL 的高级查询：

```ts
const rows = await db
  .query()
  .selectFrom('orders')
  .select(['id', 'orderNo', 'createdAt'])
  .where('status', '=', 'paid')
  .execute();
```

Repository 适合常规业务数据访问：

```ts
const rows = await db.repository('orders').findMany({
  select: {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: ['id', 'orderNo', 'createdAt'],
    },
  },
  filter: { status: 'paid' },
});
```

如果查询必须感知 Collection metadata、关系路径、字段 operator group 或变量，应优先走 Repository，而不是让 `db.query()` 变得更重。

## Repository Filter

简单的直接标量 equality 使用 shorthand：

```ts
await db.repository('users').findMany({
  filter: { enabled: true, tenantId: 'tenant-1' },
});
```

复杂比较、逻辑组合、变量或关系筛选使用 Filter Builder：

```ts
await db.repository('users').findMany({
  filter: (filter) =>
    filter.and([
      filter.string('name').includes('Chen'),
      filter.boolean('enabled').isTrue(),
      filter
        .relation('roles')
        .none((role) =>
          role.or([
            role.string('name').eq('root'),
            role.string('name').eq('admin'),
          ]),
        ),
    ]),
});
```

Filter Builder 的详细设计见 [Filter Builder](./filter-builder.md)，结构化 AST 见 [Filter AST](./filter-ast.md)。
参考 Prisma Next 实现简单 equality JSON shorthand 的方案见
[Repository Filter 输入改进提案](./prisma-inspired-filter-input.md)。

## 关系写入

手写 TypeScript 可以在 `values` 的 relation Field 上使用 Fluent Builder：

```ts
await db.repository('projects').updateOne({
  filter: { id: 'project-1' },
  values: {
    name: 'NocoBase v3',
    owner: (owner) => owner.connect({ id: 'user-owner' }),
    members: (members) =>
      members
        .connect({ id: 'user-new' })
        .disconnect({ id: 'user-old' })
        .create({ name: 'Invited user' }),
    tags: (tags) => tags.set([{ id: 'tag-1' }, { id: 'tag-2' }]),
  },
});
```

Builder 只负责生成字段操作描述，Repository 将它与等价的纯 JSON `values` 归一化为内部
Mutation AST。HTTP、CLI、Agent tool、持久化配置和动态表单直接提交纯 JSON `values`，
不生成 Fluent 代码，也不直接提交内部 AST。大表单通常在前端用 `initialValues`、当前
`values`、`dirty/changeSet` 和字段提交策略编译写入参数；后端不把前端初始快照当作数据库
当前状态。

完整协议见 [Mutation AST](./mutation-ast.md)，表单流程见
[表单到 Repository Mutation](./form-mutation.md)。

## 事务中的 Repository

Repository 实现后，事务内应使用回调参数里的 `connection.repository()`，不要回到外层 `db`：

```ts
await db.transaction(async (connection) => {
  await connection.repository('orders').createOne({
    values: {
      orderNo: 'SO-001',
      amount: 99.5,
      status: 'paid',
    },
  });

  await connection.repository('orders').updateMany({
    filter: { status: 'paid' },
    values: {
      status: 'completed',
    },
  });
});
```

这样 Builder、Query 和 Repository 都共享同一个事务连接上下文。

## 多连接

多连接下推荐先取 connection，再通过 connection 使用 Repository：

```ts
const analytics = db.connection('analytics');

const events = await analytics.repository('events').findMany({
  select: {
    kind: 'select',
    version: 1,
    root: { kind: 'selection', fields: ['id', 'name'] },
  },
});
```

也可以保留 manager 级快捷写法：

```ts
const events = await db.repository('events', 'analytics').findMany({
  select: {
    kind: 'select',
    version: 1,
    root: { kind: 'selection', fields: ['id', 'name'] },
  },
});
```

较长代码更推荐 `db.connection('name').repository('collection')`，这样 connection 上下文更明确。

## V1 边界

Repository V1 当前覆盖常规 CRUD 和 Collection-aware AST：

- 支持 `findMany()`、`findOne()`、`count()`、`exists()`、`createOne()`、`createMany()`、
  `updateOne()`、`updateMany()`、`deleteOne()`、`deleteMany()`。
- `findMany()` 和 `findOne()` 支持 Select AST；列表查询还支持 Filter AST、Sort AST、
  `limit`、`offset` 等常见选项。
- 支持 equality shorthand、Filter Builder 和完整 Filter AST，并统一规范化成 Filter AST。
- 支持通过 `context` 传入变量解析上下文。
- Repository V1 不实现 policy 注入或授权；授权由可信调用边界负责。
- Select AST 支持直接标量字段、嵌套 relation、relation-local filter 和 to-many local
  sort。
- Sort AST 支持直接字段、纯 to-one relation field 和单个终点 to-many relation
  aggregate。
- `createOne()` 和 `updateOne()` 使用模型形状 `values`：标量字段直接写值，relation Field
  可以使用 Builder 或等价纯 JSON。
- relation Field 支持 `create`、`connect`、`disconnect`、`set`、`update`、`upsert` 和
  `delete`；nested create/connect 受深度和节点预算限制，目标 update/delete 自动限制在
  当前 relation scope。
- 内部 Mutation AST 只作为 Repository 的规范化和执行协议，不是 HTTP、CLI、Agent tool
  或表单的主要公开输入。
- Agent 应先使用 `describeMutation()` 发现关系基数、允许 action、唯一约束和预算，再通过
  `validateMutation()` 预校验规范 AST；执行事务仍需重新检查数据库当前状态。
- `createMany()`、`updateMany()` 和 `deleteMany()` 是无关系写入的批量操作；后两者要求
  显式 `filter` 或 `all: true`。
- `createOne()` 和 `updateOne()` 返回 `SingleMutationResult`；读方法直接返回结果，批量写入
  返回各自的 count object，`deleteOne()` 返回 `{ deleted: true }`。
- 支持 Collection 显式配置的 increment optimistic lock；关系 mutation 与根字段 mutation
  共用根版本，V1 不设计独立 relation revision。
- 暂不实现 Model。
- 暂不实现 Transformer。
- 暂不实现 relation-local 分页、aggregate-local filter 和带关系的批量创建。
- 暂不支持批量 relation mutation、`belongsToMany` through payload、隐式 reassign、
  `connectOrCreate` 或调用方定义的任意 mutation graph。
- 暂不把 QueryAdapter 的所有高级 SQL 能力搬进 Repository。
- 暂不提供 raw filter。

复杂 SQL 仍然交给 `db.query()`；业务常规数据访问交给 Repository。

## Agent 注意事项

- 本页 V1 接口已经实现；标为“暂不支持”的能力仍不能生成或执行。
- Agent 写 Repository 代码时，应使用 Collection / Field 逻辑名。
- 返回字段和 relation 使用 Select AST；不要在主代码 API 中使用 `fields` / `appends`
  顶层兼容参数。
- 排序使用 Sort AST；不要使用字符串、tuple 或 object map 简写。
- 简单 equality 筛选使用 shorthand；比较、逻辑组合、变量与关系筛选使用 Filter Builder。
- 根标量与关系写入都放在模型形状 `values` 中；relation Field 使用明确的操作对象，不要
  根据嵌套对象、`null` 或空数组猜测 relation 操作。
- HTTP / CLI / Agent tool / 持久化配置的简单 Filter 使用 shorthand，复杂 Filter 使用完整
  Filter AST；写入使用纯 JSON `values`。字段级 Fluent Builder 只作为手写 TypeScript 的便利
  入口，内部 Mutation AST 不作为主要公开输入。
- 关系 mutation 只用于 `createOne()` 和 `updateOne()`，不要放入 `createMany()` 或
  `updateMany()`。
- 不要让 Agent 猜 relation 能力；先调用 `describeMutation()`，执行前使用
  `validateMutation()`。
- 不要把 `{ amount: { $gte: 100 } }` 这类 Compact Filter 当作已支持能力。
- 不要让 `db.query()` 读取 Collection metadata；这是 Repository 的职责。
