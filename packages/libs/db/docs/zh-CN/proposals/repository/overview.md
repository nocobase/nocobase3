---
title: Repository 提案
description: 尚未实现或导出的 Collection-aware Repository 设计；当前生产代码应使用 QueryAdapter。
---

# Repository 概览

> **状态：提案。运行时可用性：未实现。导出 API：无。** 本页只用于设计讨论，不要据此生成生产代码。当前数据访问使用 [QueryAdapter](../../query/overview.md)。

`Repository` 是未来的应用层数据访问入口。它和 `db.query()` 的核心区别不是 API 写法，而是所处层级不同：

| API               | 层级         | 输入名                          | 是否读取 Collection metadata | 当前状态 |
| ----------------- | ------------ | ------------------------------- | ---------------------------- | -------- |
| `db.query()`      | 数据库查询层 | table / column query identifier | 否                           | 已实现   |
| `db.repository()` | 应用数据层   | Collection / Field 逻辑名       | 是                           | 规划中   |

Repository 会面向 Collection 工作，理解字段类型、关系、命名策略、权限上下文、应用层元信息和未来的数据转换规则。它适合承载常规 CRUD、关系筛选、权限过滤、HTTP / CLI 数据访问，以及 Agent 需要理解业务数据模型的场景。

## 为什么需要 Repository

`QueryAdapter` 的职责是提供跨数据库的基础查询能力。它不读取 Collection metadata，因此不会知道：

- `collection.name` 对应哪个物理表。
- `field.name` 对应哪个物理列。
- 某个字段属于 string、number、date、select 还是 relation。
- 某个 relation 是 to-one 还是 to-many。
- 某个筛选条件应该使用哪个 NocoBase filter operator group。

Repository 则工作在应用层：

```text
Repository
  -> Collection metadata
  -> Select AST / Filter AST / Sort AST / Mutation AST
  -> QueryAdapter
  -> Database
```

因此，Repository 里的字段名应优先使用 Collection / Field 的逻辑名，而不是数据库物理名。

## 规划接口

Repository 可以先保持克制，但接口必须把结果选择、筛选、排序、分页、
变量上下文和写入作用域表达完整。下面的类型是 V1 的目标契约，不是当前实现：

```ts
type RepositoryRecord = Record<string, unknown>;

type RepositoryContext = Readonly<Record<string, unknown>>;

type RepositoryFilter<TRecord extends object> =
  FilterAst | ((filter: FilterBuilder<TRecord>) => FilterNode);

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
  values: TCreate;
  relations?: RelationMutationInput;
  select?: SelectAst;
  context?: RepositoryContext;
}

interface CreateManyOptions<TCreate extends object> {
  records: readonly [TCreate, ...TCreate[]];
  context?: RepositoryContext;
}

type UpdateOneOptions<TUpdate extends object> = {
  unique: UniqueSelector;
  select?: SelectAst;
  ifVersion?: string | number;
  context?: RepositoryContext;
} & (
  | {
      values: TUpdate;
      relations?: RelationMutationInput;
    }
  | {
      values?: TUpdate;
      relations: RelationMutationInput;
    }
);

type RelationMutationInput =
  | RelationMutationAst
  | ((relations: RelationMutationBuilder) => RelationMutationBuilder);

interface DescribeMutationOptions {
  operation: 'createOne' | 'updateOne';
  context?: RepositoryContext;
}

type ValidateMutationOptions<TCreate extends object, TUpdate extends object> =
  | {
      operation: 'createOne';
      values: TCreate;
      relations?: RelationMutationAst;
      context?: RepositoryContext;
    }
  | ({
      operation: 'updateOne';
      unique: UniqueSelector;
      ifVersion?: string | number;
      context?: RepositoryContext;
    } & (
      | {
          values: TUpdate;
          relations?: RelationMutationAst;
        }
      | {
          values?: TUpdate;
          relations: RelationMutationAst;
        }
    ));

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

interface DeleteOneOptions {
  unique: UniqueSelector;
  ifVersion?: string | number;
  context?: RepositoryContext;
}

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
    options: ValidateMutationOptions<TCreate, TUpdate>,
  ): Promise<MutationValidationResult>;

  createOne(options: CreateOneOptions<TCreate>): Promise<TRecord>;
  createMany(options: CreateManyOptions<TCreate>): Promise<CreateManyResult>;
  updateOne(options: UpdateOneOptions<TUpdate>): Promise<TRecord>;
  updateMany(
    options: UpdateManyOptions<TRecord, TUpdate>,
  ): Promise<UpdateManyResult>;
  deleteOne(options: DeleteOneOptions): Promise<DeleteOneResult>;
  deleteMany(options: DeleteManyOptions<TRecord>): Promise<DeleteManyResult>;
}
```

这里用 `RepositoryRecord` 简化表示 Select AST 产生的动态结果。正式 TypeScript API
实现时，返回结构应由 Collection 类型信息和 `select` 常量推导，不能提供
`findMany<TResult>()` 让调用方任意断言结果类型。无论有没有静态类型，Repository 都
必须在运行时根据 Collection metadata 校验 Select、Filter、Sort 和写入值。

### 查询语义

- `select` 省略时返回根 Collection 默认允许读取的标量字段，不自动加载 relation。
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

Select AST 的结果形状、relation filter/sort、批量加载、权限和兼容转换见
[Select AST](./select-ast.md)。Sort AST 的直接字段、关系字段、关系聚合、NULL 和稳定排序
语义见 [Sort AST](./sort-ast.md)。

### 写入语义与安全边界

写入方法按记录基数对称命名，方法名本身即表达选择方式、关系能力和结果形态：

| 方法           | 根记录作用域                        | V1 关系写入 | 结果                |
| -------------- | ----------------------------------- | ----------- | ------------------- |
| `createOne()`  | 一个新根记录                        | 支持        | 创建后的记录        |
| `createMany()` | 一个非空的根记录列表                | 不支持      | `{ createdCount }`  |
| `updateOne()`  | `UniqueSelector` 唯一定位的一条记录 | 支持        | 更新并回读后的记录  |
| `updateMany()` | 显式 `filter` 或 `all: true`        | 不支持      | `{ updatedCount }`  |
| `deleteOne()`  | `UniqueSelector` 唯一定位的一条记录 | 不支持      | `{ deleted: true }` |
| `deleteMany()` | 显式 `filter` 或 `all: true`        | 不支持      | `{ deletedCount }`  |

这六个名称是 V1 的唯一规范写法，不再提供语义含糊的 `create()`、`update()`、`delete()`
别名。Agent 仅根据方法名就能判断单条/批量边界，不需要结合参数猜测。

- `TRecord`、`TCreate` 和 `TUpdate` 分开建模。数据库生成的主键、创建时间等字段可以只
  出现在 `TRecord` 中；必填创建字段可以放在 `TCreate` 中；可修改字段放在
  `TUpdate` 中。未提供静态类型时，它们分别退化为记录的部分字段。
- `createOne()` 返回完成默认值、生成值和逻辑字段名映射后的记录。`createMany()` 接受非空
  `records`，V1 只创建根记录的直接标量字段，不接受 `relations`。批量记录必须先全部
  校验，再在同一事务中创建；任一记录失败则整批回滚。
- `createOne()` 和 `updateOne()` 可以通过 Mutation AST 或等价 Fluent Builder 写入关系；
  根 `values` 仍只接受当前 Collection 可写的直接标量字段。
- `updateOne()` 和 `deleteOne()` 通过主键或命名唯一约束定位一条记录；一般 Filter AST
  不能替代唯一选择器。没有匹配记录时返回结构化 `RECORD_NOT_FOUND` 错误，而不是
  `undefined` 或成功计数 `0`。
- `updateOne()` 必须至少提供 `values` 或 `relations`。`deleteOne()` 只删除根记录，不在同一
  输入里混入 relation mutation；关系限制和级联行为由 Collection metadata、policy 与
  数据库约束决定。
- `createMany()`、`updateMany()` 和 `deleteMany()` 返回与操作对应的明确计数字段，不使用
  容易混淆的统一 `affectedCount`。V1 的批量方法都不接受关系操作。
- `updateOne()` 和 `updateMany()` 的 `values` 不能是空对象；只有 `updateOne()` 可以省略
  `values`，且此时必须存在非空 `relations`。
- `updateMany()` 和 `deleteMany()` 必须明确提供 `filter`。确实需要作用于整个 Collection
  时，调用方必须显式写 `all: true`；`filter` 和 `all` 互斥。空 group、缺失 filter 或把
  变量解析成空条件都不能被当作全量操作。
- 数据库生成字段、只读字段、relation 字段和未知字段出现在根 `values` 时，应在执行查询
  前报错。连接、创建目标、断开和替换关系使用独立的 Mutation AST 节点；目标实体或中间
  记录更新不属于 V1。
- 包含关系的 mutation 必须先整体校验，再在一个事务中执行根记录、目标记录和中间关系
  写入。省略 relation 节点表示不修改，清空必须使用显式 `clear` 或空 `replace`。

Mutation AST 的节点、唯一选择器、Fluent Builder、有界嵌套、Agent 工作流和执行边界见
[Mutation AST](./mutation-ast.md)。大表单的前端编译流程见
[表单到 Mutation AST](./form-mutation.md)。

`describeMutation()` 和 `validateMutation()` 是关系 Mutation AST 的发现与预校验入口，
因此 V1 的 `operation` 只包含支持 `relations` 的 `createOne` 和 `updateOne`，不泛化成六种
CRUD 方法的第二套执行 API。

`context` 是只读的变量解析上下文，也可以供后续服务端策略使用。仅仅传入
`context: { user: ... }` 不等于已经执行权限校验；授权系统追加的约束必须来自可信的
Repository policy 阶段，并与调用方 filter 使用 `and` 合并，调用方不能通过 context
覆盖或删除它。

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
      filter.select('status').eq('paid'),
      filter.number('amount').gte(100),
      filter.date('createdAt').notBefore('2026-01-01'),
    ]),
});
```

`findOne()` 使用同一套 Select AST 和 Sort AST：

```ts
const order = await orderRepository.findOne({
  filter: (filter) => filter.string('orderNo').eq('SO-001'),
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
  filter: (filter) => filter.select('status').eq('paid'),
});
```

如果查询必须感知 Collection metadata、关系路径、字段 operator group、权限上下文或变量，应优先走 Repository，而不是让 `db.query()` 变得更重。

## Filter Builder

Repository 的筛选条件不推荐继续以旧的 object filter 形态作为主要代码 API，而是使用 Agent 友好的 Filter Builder：

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

## 关系写入

手写 TypeScript 可以使用 Fluent Builder：

```ts
await db.repository('projects').updateOne({
  unique: {
    kind: 'unique',
    constraint: 'primary',
    values: { id: 'project-1' },
  },
  values: {
    name: 'NocoBase v3',
  },
  relations: (relations) =>
    relations
      .set('owner', (owner) => owner.connect({ id: 'user-owner' }))
      .patch('members', (members) =>
        members
          .connect({ id: 'user-new' })
          .disconnect({ id: 'user-old' })
          .create({ name: 'Invited user' }),
      )
      .replace('tags', (tags) =>
        tags.connect({ id: 'tag-1' }).connect({ id: 'tag-2' }),
      ),
});
```

Builder 只负责生成规范 Mutation AST。HTTP、CLI、Agent tool、持久化配置和动态表单直接
提交 AST，不生成 Fluent 代码。大表单通常在前端用 `initialValues`、当前 `values`、
`dirty/changeSet` 和字段提交策略编译 AST；后端不把前端初始快照当作数据库当前状态。

完整协议见 [Mutation AST](./mutation-ast.md)，表单流程见
[表单到 Mutation AST](./form-mutation.md)。

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
    filter: (filter) => filter.select('status').eq('paid'),
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

Repository V1 建议先只覆盖常规 CRUD 和 Collection-aware AST：

- 支持 `findMany()`、`findOne()`、`count()`、`exists()`、`createOne()`、`createMany()`、
  `updateOne()`、`updateMany()`、`deleteOne()`、`deleteMany()`。
- `findMany()` 和 `findOne()` 支持 Select AST；列表查询还支持 Filter AST、Sort AST、
  `limit`、`offset` 等常见选项。
- 支持 Filter Builder，并把 Builder 结果规范化成 Filter AST。
- 支持通过 `context` 传入变量解析上下文。
- Select AST 支持直接标量字段、嵌套 relation、relation-local filter 和 to-many local
  sort。
- Sort AST 支持直接字段、纯 to-one relation field 和单个终点 to-many relation
  aggregate。
- Mutation AST 支持单记录 `createOne()` 和 `updateOne()` 的显式关系写入，并提供生成同一
  AST 的 Fluent Builder。
- Mutation AST V1 支持 `set`、`clear`、`patch`、`replace`，以及仅包含 connect/create 的
  有界 nested create；目标和 `belongsToMany` edge 的更新先使用对应 Collection
  Repository。V1 不支持 target delete、隐式 reassign、connect-or-create 或任意 mutation
  graph。
- Agent 应先使用 `describeMutation()` 发现关系基数、允许 action、唯一约束和预算，再通过
  `validateMutation()` 预校验规范 AST；执行事务仍需重新检查数据库当前状态。
- `createMany()`、`updateMany()` 和 `deleteMany()` 是无关系写入的批量操作；后两者要求
  显式 `filter` 或 `all: true`。
- 暂不实现 Model。
- 暂不实现 Transformer。
- 暂不实现 relation-local 分页、aggregate-local filter 和带关系的批量创建。
- 暂不把 QueryAdapter 的所有高级 SQL 能力搬进 Repository。
- 暂不提供 raw filter。

复杂 SQL 仍然交给 `db.query()`；业务常规数据访问交给 Repository。

## Agent 注意事项

- 本页接口均为规划接口，当前代码中还没有实现。
- Agent 写未来 Repository 代码时，应使用 Collection / Field 逻辑名。
- 返回字段和 relation 使用 Select AST；不要在主代码 API 中使用 `fields` / `appends`
  顶层兼容参数。
- 排序使用 Sort AST；不要使用字符串、tuple 或 object map 简写。
- 筛选条件优先使用 `filter: (filter) => ...` 的 Filter Builder。
- 根标量写入放 `values`，关系写入使用 Mutation AST；不要根据嵌套对象、`null` 或空数组
  猜测 relation 操作。
- HTTP / CLI / Agent tool / 持久化配置使用 Select AST、Filter AST、Sort AST 和
  Mutation AST；Fluent Builder 只作为手写 TypeScript 的便利入口。
- 关系 mutation 只用于 `createOne()` 和 `updateOne()`，不要放入 `createMany()` 或
  `updateMany()`。
- 不要让 Agent 猜 relation 能力；先调用 `describeMutation()`，执行前使用
  `validateMutation()`。
- 不要把旧的 object shorthand 当作 Repository V1 的主 API。
- 不要让 `db.query()` 读取 Collection metadata；这是 Repository 的职责。
