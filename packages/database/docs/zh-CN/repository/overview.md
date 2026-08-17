# Repository 概览

> 状态：规划设计，暂未实现。

`Repository` 是未来的应用层数据访问入口。它和 `db.query()` 的核心区别不是 API 写法，而是所处层级不同：

| API | 层级 | 输入名 | 是否读取 Collection metadata | 当前状态 |
| --- | --- | --- | --- | --- |
| `db.query()` | 数据库查询层 | table / column query identifier | 否 | 已实现 |
| `db.repository()` | 应用数据层 | Collection / Field 逻辑名 | 是 | 规划中 |

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
  -> Filter Builder / Filter AST
  -> QueryAdapter
  -> Database
```

因此，Repository 里的字段名应优先使用 Collection / Field 的逻辑名，而不是数据库物理名。

## 规划接口

第一版 Repository 可以先保持克制，聚焦常规数据访问：

```ts
interface DatabaseManager {
  repository(collectionName: string, connectionName?: string): Repository;
}

interface DatabaseConnection {
  repository(collectionName: string): Repository;
}

interface Repository<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  findMany<TResult = TRecord>(options?: FindManyOptions): Promise<TResult[]>;
  findOne<TResult = TRecord>(options?: FindOneOptions): Promise<TResult | undefined>;
  create<TResult = TRecord>(options: CreateOptions<TRecord>): Promise<TResult>;
  update(options: UpdateOptions<TRecord>): Promise<MutationResult>;
  delete(options?: DeleteOptions): Promise<MutationResult>;
}
```

示例：

```ts
const orders = await db.repository('orders').findMany({
  fields: ['id', 'orderNo', 'amount', 'createdAt'],
  filter: (filter) =>
    filter.and([
      filter.select('status').eq('paid'),
      filter.number('amount').gte(100),
      filter.date('createdAt').notBefore('2026-01-01'),
    ]),
});
```

这里的 `orders`、`orderNo`、`amount`、`createdAt` 都是应用层逻辑名。Repository 负责编译到数据库可执行查询，并把结果映射回应用层字段名。

## 和 QueryAdapter 的关系

`db.query()` 仍然保留，用于更接近 SQL 的高级查询：

```ts
const rows = await db.query()
  .selectFrom('orders')
  .select(['id', 'orderNo', 'createdAt'])
  .where('status', '=', 'paid')
  .execute();
```

Repository 适合常规业务数据访问：

```ts
const rows = await db.repository('orders').findMany({
  fields: ['id', 'orderNo', 'createdAt'],
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
      filter.relation('roles').none((role) =>
        role.or([
          role.string('name').eq('root'),
          role.string('name').eq('admin'),
        ])
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
  fields: ['id', 'name'],
});
```

也可以保留 manager 级快捷写法：

```ts
const events = await db.repository('events', 'analytics').findMany({
  fields: ['id', 'name'],
});
```

较长代码更推荐 `db.connection('name').repository('collection')`，这样 connection 上下文更明确。

## V1 边界

Repository V1 建议先只覆盖常规 CRUD 和 Collection-aware filter：

- 支持 `findMany()`、`findOne()`、`create()`、`update()`、`delete()`。
- 支持 `fields`、`filter`、`sort`、`limit`、`offset` 这类常见选项。
- 支持 Filter Builder 和 Filter AST。
- 支持通过 `context` 传入变量解析上下文。
- 暂不实现 Model。
- 暂不实现 Transformer。
- 暂不把 QueryAdapter 的所有高级 SQL 能力搬进 Repository。
- 暂不提供 raw filter。

复杂 SQL 仍然交给 `db.query()`；业务常规数据访问交给 Repository。

## Agent 注意事项

- 本页接口均为规划接口，当前代码中还没有实现。
- Agent 写未来 Repository 代码时，应使用 Collection / Field 逻辑名。
- 筛选条件优先使用 `filter: (filter) => ...` 的 Filter Builder。
- HTTP / CLI / 持久化配置可以使用 Filter AST，而不是链式回调。
- 不要把旧的 object shorthand 当作 Repository V1 的主 API。
- 不要让 `db.query()` 读取 Collection metadata；这是 Repository 的职责。
