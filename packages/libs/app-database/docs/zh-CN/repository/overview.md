# Repository 概览

> 状态：规划设计，暂未实现。

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
  -> Select AST / Filter AST / Sort AST
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

interface CreateOptions<TCreate extends object> {
  values: TCreate;
  context?: RepositoryContext;
}

type MutationScope<TRecord extends object> =
  | {
      filter: RepositoryFilter<TRecord>;
      all?: never;
    }
  | {
      filter?: never;
      all: true;
    };

type UpdateOptions<
  TRecord extends object,
  TUpdate extends object,
> = MutationScope<TRecord> & {
  values: TUpdate;
  context?: RepositoryContext;
};

type DeleteOptions<TRecord extends object> = MutationScope<TRecord> & {
  context?: RepositoryContext;
};

interface MutationResult {
  affectedCount: number;
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

  create(options: CreateOptions<TCreate>): Promise<TRecord>;
  update(options: UpdateOptions<TRecord, TUpdate>): Promise<MutationResult>;
  delete(options: DeleteOptions<TRecord>): Promise<MutationResult>;
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

- `TRecord`、`TCreate` 和 `TUpdate` 分开建模。数据库生成的主键、创建时间等字段可以只
  出现在 `TRecord` 中；必填创建字段可以放在 `TCreate` 中；可修改字段放在
  `TUpdate` 中。未提供静态类型时，它们分别退化为记录的部分字段。
- `create()` 一次创建一条记录，并返回完成默认值、生成值和逻辑字段名映射后的记录。
  V1 不承诺批量创建，也不承诺关系嵌套创建。
- `update()` 和 `delete()` 都是批量操作，作用于所有匹配记录，返回统一的
  `affectedCount`。方法名不暗示“只修改第一条”。
- 批量写入必须明确提供 `filter`。确实需要作用于整个 Collection 时，调用方必须显式写
  `all: true`；`filter` 和 `all` 互斥。空 group、缺失 filter 或把变量解析成空条件都不能
  被当作全量操作。
- V1 写入值只接受当前 Collection 可写的直接标量字段。数据库生成字段、只读字段、
  relation 字段和未知字段应在执行查询前报错；关系连接、断开和嵌套写入留给单独的关系
  mutation 设计。

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

## 事务中的 Repository

Repository 实现后，事务内应使用回调参数里的 `connection.repository()`，不要回到外层 `db`：

```ts
await db.transaction(async (connection) => {
  await connection.repository('orders').create({
    values: {
      orderNo: 'SO-001',
      amount: 99.5,
      status: 'paid',
    },
  });

  await connection.repository('orders').update({
    filter: (filter) => filter.string('orderNo').eq('SO-001'),
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

- 支持 `findMany()`、`findOne()`、`count()`、`exists()`、`create()`、`update()`、
  `delete()`。
- `findMany()` 和 `findOne()` 支持 Select AST；列表查询还支持 Filter AST、Sort AST、
  `limit`、`offset` 等常见选项。
- 支持 Filter Builder，并把 Builder 结果规范化成 Filter AST。
- 支持通过 `context` 传入变量解析上下文。
- Select AST 支持直接标量字段、嵌套 relation、relation-local filter 和 to-many local
  sort。
- Sort AST 支持直接字段、纯 to-one relation field 和单个终点 to-many relation
  aggregate。
- `update()`、`delete()` 是批量操作，并要求显式 `filter` 或 `all: true`。
- 暂不实现 Model。
- 暂不实现 Transformer。
- 暂不实现 relation-local 分页、aggregate-local filter、关系写入和批量创建。
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
- HTTP / CLI / 持久化配置使用 Select AST、Filter AST 和 Sort AST。
- 不要把旧的 object shorthand 当作 Repository V1 的主 API。
- 不要让 `db.query()` 读取 Collection metadata；这是 Repository 的职责。
