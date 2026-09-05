---
title: Repository 写入 API 改进提案
description: 参考 Prisma 的模型形状输入和 Relation Builder，统一 Repository 的 filter、values、单条与批量写入语义。
---

# Repository 写入 API 改进提案

> **状态：核心写入契约已实现。** `createOne()` / `updateOne()` 的 `values` 支持字段级
> Builder 和纯 JSON，覆盖 `create`、`connect`、`disconnect`、`set`、`update`、`upsert`
> 和 `delete`；`updateOne()` / `deleteOne()` 使用严格基数的根 `filter`。顶层
> `relations`、单条 `unique` 和 `createMany.records` 已完成迁移。单条删除和批量 mutation
> 也已支持通过 `select` 返回记录；当前完整契约以 [Repository 概览](./overview.md) 与
> [Mutation AST](./mutation-ast.md) 为准。

## 背景

当前 Repository 把根标量和关系写入分成两个入口：

```ts
await projects.updateOne({
  unique: unique('id', 'project-1'),
  values: { name: 'Repository redesign' },
  relations: (relations) =>
    relations
      .set('owner', (owner) => owner.connect({ id: 'user-1' }))
      .patch('tasks', (tasks) => tasks.create({ title: 'Implement' })),
});
```

这个接口的规范 AST 很明确，但手写代码需要在 Collection 字段和独立关系树之间切换。
`patch`、`replace`、`set`、`clear` 还引入了一层关系动作分类，调用者不能直接从字段位置
开始表达意图。

本文参考 Prisma 的两个核心设计：

- 写入输入保持模型形状，标量字段和 relation Field 位于同一个对象中；
- Relation Builder 只构造 mutation descriptor，Repository 再把一次写入编译成事务内的
  Mutation Graph。

参考对象是 Prisma ORM 仓库 `main` 分支中的 Prisma Next ORM Client。其当前关系写入主要
覆盖 `create`、`connect` 和 `disconnect`；本文的 relation `set`、`update`、`upsert`、
`delete` 是结合 NocoBase 现有语义提出的候选扩展，不是对 Prisma 当前实现的描述。

本文不照搬 Prisma 的 API 命名和全部行为。NocoBase 继续使用 `filter`、`values`、显式的
`One` / `Many` 方法、Select AST、optimistic lock、结构化错误和动态 JSON AST。

## 目标

- 六个写入方法使用一致、可预测的参数命名；
- `values` 与 Collection 字段结构一致，同时承载标量值和字段级 Relation Builder；
- Relation Builder 与 Filter Builder 使用相同的 callback 心智模型；
- TypeScript Builder 和 JSON 协议归一化到同一个 Mutation Graph；
- 单条方法不静默选择第一条记录，批量方法不因省略 filter 意外作用于全集；
- 保留动态 Collection、HTTP、CLI、Agent、工作流和表单所需的发现、预校验与序列化能力；
- 保留跨数据库事务、optimistic lock、资源预算和稳定错误路径。

## 非目标

- 不把 Prisma 的 `create()`、`update()`、`delete()` 命名直接复制到 Repository；
- 不让 `createMany()` 或 `updateMany()` 执行 relation mutation；
- 不用 Builder callback 取代 JSON 协议；
- 不允许调用方指定 SQL、物理表列名或数据库执行顺序；
- 不在 Repository 内注入授权策略；授权仍由可信调用边界负责。

## 六个写入方法

候选接口统一为：

```ts
repository.createOne({ values, select });
repository.createMany({ values: [values], select });

repository.updateOne({ filter, values, ifVersion, select, context });
repository.updateMany({ filter, values, select, context });

repository.deleteOne({ filter, ifVersion, select, context });
repository.deleteMany({ filter, select, context });
```

全量批量写入必须显式使用 `all: true`：

```ts
repository.updateMany({ all: true, values });
repository.deleteMany({ all: true });
```

| 方法           | 根记录范围                | Relation Builder | 建议结果                         |
| -------------- | ------------------------- | ---------------- | -------------------------------- |
| `createOne()`  | 一个新根记录              | `create/connect` | `SingleMutationResult`           |
| `createMany()` | 非空 `values` 列表        | 不支持           | `{ createdCount, records? }`     |
| `updateOne()`  | `filter` 恰好匹配一条     | 完整单条关系能力 | `SingleMutationResult`           |
| `updateMany()` | `filter` 全部匹配或 `all` | 不支持           | `{ updatedCount, records? }`     |
| `deleteOne()`  | `filter` 恰好匹配一条     | 不支持           | 删除前记录和 `{ deleted: true }` |
| `deleteMany()` | `filter` 全部匹配或 `all` | 不支持           | `{ deletedCount, records? }`     |

六个方法的完整调用示例见 [Repository 写入方法示例](./mutation-examples.md)。

### 参数词汇

| 参数        | 含义                                                           |
| ----------- | -------------------------------------------------------------- |
| `filter`    | 根记录或关系目标的匹配范围，使用 Filter AST 或 Filter Builder  |
| `values`    | 要写入的 Collection 字段，包括标量值和 relation Field callback |
| `select`    | mutation 完成后返回的根记录形状                                |
| `ifVersion` | 根记录 optimistic lock 条件                                    |
| `context`   | Filter AST 中变量的只读解析上下文，不代表已授权                |
| `all`       | 显式确认批量 mutation 作用于整个 Collection                    |

不再使用单独的顶层 `relations`。内部仍会根据 Collection metadata 把 `values` 拆成
`scalarValues` 和 `relationMutations`。

## `values` 的模型形状

`values` 中每个 key 都是当前 Collection 的逻辑 Field 名：

```ts
await projects.updateOne({
  filter: (filter) => filter.string('id').eq('project-1'),
  values: {
    name: 'Repository redesign',
    owner: (owner) => owner.connect({ id: 'user-1' }),
    tasks: (tasks) => tasks.create({ title: 'Implement' }),
  },
});
```

其中：

```text
values
├── name   -> scalar value
├── owner  -> to-one Relation Builder callback
└── tasks  -> to-many Relation Builder callback
```

Repository 必须从 resolved `CollectionDefinition` 判断 Field 是标量还是 relation，不能根据
值是否为函数、对象或数组猜测字段类型。未知字段、只读字段、生成字段和不支持的关系动作都
必须在执行查询前报错。

## `createOne()`

`createOne()` 建立一棵新记录和新关系树。根 `values` 允许可写标量以及 relation Field 的
`create` / `connect`：

```ts
const result = await projects.createOne({
  values: {
    name: 'Repository redesign',
    status: 'draft',

    owner: (owner) => owner.connect({ id: 'user-1' }),

    profile: (profile) =>
      profile.create({
        summary: 'Repository redesign project',
      }),

    tasks: (tasks) =>
      tasks
        .create({
          title: 'Analyze Prisma',
          status: 'pending',
          assignee: (assignee) => assignee.connect({ id: 'user-2' }),
          checklistItems: (items) =>
            items.create([
              { title: 'Analyze create input', completed: false },
              { title: 'Analyze mutation graph', completed: false },
            ]),
        })
        .create({
          title: 'Write proposal',
          status: 'pending',
        })
        .connect({ id: 'task-existing' }),

    tags: (tags) => tags.connect([{ id: 'tag-database' }, { id: 'tag-orm' }]),
  },
  select: projectSelect,
});
```

to-one 的 `create` / `connect` 只接受一个目标；to-many 可以接收一个目标、数组或多个链式
调用。它们都归一化为目标列表，Builder 调用顺序不代表数据库语句顺序。

`createOne()` 不提供 `disconnect`、`set`、`update`、`upsert` 或 `delete`。新根记录没有
既有关系范围，这些动作要么没有意义，要么会让创建操作隐式修改或删除外部记录。

如需“存在则连接，不存在则创建”，应在后续单独设计 `connectOrCreate`；它不是关系
`upsert`。

## `createMany()`

`createMany()` 使用统一的 `values` 名称并只接受非空标量列表：

```ts
const result = await projects.createMany({
  values: [
    { name: 'Project A', status: 'draft' },
    { name: 'Project B', status: 'active' },
  ],
  select: (select) => select.fields('id', 'name'),
});
```

```ts
expect(result).toEqual({
  createdCount: 2,
  records: [
    { id: 'project-a', name: 'Project A' },
    { id: 'project-b', name: 'Project B' },
  ],
});
```

所有记录必须先完成校验，再在同一事务中创建；任一记录失败则整批回滚。本提案的
`createMany()` 不接受 Relation Builder，因为共享目标、逐根创建、错误映射和返回规模都
需要另一套明确契约。

## `updateOne()`

`updateOne()` 使用 `filter` 定位根记录，`values` 同时表达标量变化和关系动作：

```ts
const result = await projects.updateOne({
  filter: (filter) => filter.string('id').eq('project-1'),
  values: {
    name: 'New repository design',
    status: 'active',

    owner: (owner) => owner.connect({ id: 'user-3' }),
    reviewer: (reviewer) => reviewer.disconnect(),

    tasks: (tasks) =>
      tasks
        .create({
          title: 'Implement mutation graph',
          status: 'pending',
        })
        .connect({ id: 'task-existing' })
        .disconnect({ id: 'task-old' })
        .update({
          filter: (filter) => filter.string('id').eq('task-update'),
          values: {
            title: 'Updated task title',
            status: 'in-progress',
            assignee: (assignee) => assignee.connect({ id: 'user-4' }),
          },
        })
        .upsert({
          filter: (filter) => filter.string('externalId').eq('external-task-1'),
          create: {
            externalId: 'external-task-1',
            title: 'Imported task',
            status: 'pending',
          },
          update: {
            title: 'Imported task updated',
            status: 'in-progress',
          },
        })
        .delete({
          filter: (filter) => filter.string('id').eq('task-delete'),
        }),

    tags: (tags) => tags.set([{ id: 'tag-database' }, { id: 'tag-orm' }]),
  },
  ifVersion: 2,
  select: projectSelect,
});
```

只包含 relation mutation、没有根标量变化的 `updateOne()` 仍然合法。Collection 启用
optimistic lock 时，任何成功的根标量或关系 mutation 都必须推进根版本。

### 单条匹配规则

`updateOne()` 不采用“更新 filter 匹配的第一条”语义：

| filter 结果 | 行为                       |
| ----------- | -------------------------- |
| 0 条        | `RECORD_NOT_FOUND`         |
| 1 条        | 执行 mutation              |
| 多于 1 条   | `MULTIPLE_RECORDS_MATCHED` |

Planner 可以识别与主键或唯一约束等价的 filter 并走单语句快速路径；不能静态证明唯一时，
必须在事务内完成有界探测、锁定和写入，不能通过 `LIMIT 1` 静默改变语义。

## Relation Builder

### 能力矩阵

| 操作         | create to-one | create to-many | update to-one   | update to-many  |
| ------------ | ------------- | -------------- | --------------- | --------------- |
| `create`     | 是            | 是             | 是              | 是              |
| `connect`    | 是            | 是             | 是              | 是              |
| `disconnect` | 否            | 否             | 是，无 selector | 是，有 selector |
| `set`        | 否            | 否             | 不提供          | 是              |
| `update`     | 否            | 否             | 是              | 是              |
| `upsert`     | 否            | 否             | 是              | 是              |
| `delete`     | 否            | 否             | 是              | 是              |

实际能力还要由 relation cardinality、nullable、外键归属、through Collection、数据库能力、
服务端预算和调用边界共同缩小。`describeMutation()` 必须只返回当前 relation 真正允许的动作。

### `create`

创建目标并连接到当前 source。创建值可以递归包含 create-safe Relation Builder：

```ts
tasks: (tasks) =>
  tasks.create({
    title: 'Implement',
    assignee: (assignee) => assignee.connect({ id: 'user-2' }),
  });
```

### `connect`

连接已存在的目标，不修改目标标量：

```ts
tags: (tags) => tags.connect([{ id: 'tag-database' }, { id: 'tag-orm' }]);
```

`connect` 输入必须完整匹配目标 Collection 的主键或唯一约束。它不是一般 Filter AST。

### `disconnect`

只解除关系，不删除目标记录：

```ts
reviewer: (reviewer) => reviewer.disconnect();
tasks: (tasks) => tasks.disconnect({ id: 'task-old' });
```

to-one 当前最多有一个目标，因此不需要 selector；to-many 必须提供一个或多个唯一 selector。
不可空关系必须在执行前拒绝 `disconnect`。

### `set`

`set` 只用于 to-many，声明关系集合的完整最终状态：

```ts
tags: (tags) => tags.set([{ id: 'tag-database' }, { id: 'tag-orm' }]);
```

空数组表示清空全部关系：

```ts
tags: (tags) => tags.set([]);
```

`set` 只连接或断开关系，不删除目标。它必须与同一 Builder 中的 `create`、`connect`、
`disconnect`、`update`、`upsert` 和 `delete` 互斥，避免完整状态与增量命令冲突。

### `update`

更新当前 relation 范围内的目标记录：

```ts
tasks: (tasks) =>
  tasks.update({
    filter: (filter) => filter.string('id').eq('task-1'),
    values: { title: 'Updated title' },
  });
```

目标 filter 必须自动叠加当前 source 的关系范围：

```text
root 满足根 filter
AND target 当前属于 root.relation
AND target 满足 relation update filter
```

to-one 的 `update` 可以省略 filter；to-many 的 `update` 必须恰好匹配一个关系目标。0 条和
多条分别返回 `RELATION_TARGET_NOT_FOUND` 与 `MULTIPLE_RELATION_TARGETS_MATCHED`。

### `upsert`

在当前 relation 范围中查找目标，找到则更新，找不到则创建并连接：

```ts
tasks: (tasks) =>
  tasks.upsert({
    filter: (filter) => filter.string('externalId').eq('external-task-1'),
    create: {
      externalId: 'external-task-1',
      title: 'Imported task',
    },
    update: {
      title: 'Imported task updated',
    },
  });
```

为了保证并发下可以确定地执行，`upsert.filter` 必须等价于目标 Collection 的主键或唯一
约束；普通 filter 不能用于 upsert。若全局唯一目标已存在但不属于当前 relation，不能把它
隐式当作 update 或 connect，应返回 `RELATION_UPSERT_TARGET_OUTSIDE_SCOPE`。需要“全局存在
则连接”的场景应使用未来独立的 `connectOrCreate`。

### `delete`

删除当前 relation 范围内的目标记录：

```ts
tasks: (tasks) =>
  tasks.delete({
    filter: (filter) => filter.string('id').eq('task-delete'),
  });
```

`delete` 与 `disconnect` 不同：前者删除目标实体，后者只解除关系。to-one 可以省略 filter；
to-many 必须恰好匹配一个关系目标。是否允许目标删除还要由 relation capability、数据库约束
和调用边界共同决定。

## `updateMany()`

`updateMany()` 更新全部匹配的根记录，只接受根标量值：

```ts
const result = await projects.updateMany({
  filter: (filter) => filter.string('status').eq('draft'),
  values: {
    status: 'archived',
    archivedAt: new Date(),
  },
  select: (select) => select.fields('id', 'status'),
});
```

```ts
expect(result.updatedCount).toBe(12);
expect(result.records).toHaveLength(12);
```

省略 filter 不能表示全集；全集更新必须写成：

```ts
await projects.updateMany({
  all: true,
  values: { status: 'archived' },
});
```

`filter` 与 `all` 互斥。`updateMany()` 不接受 Relation Builder，也不允许空 `values`。
Collection 启用 optimistic lock 时，每条成功更新的根记录都必须推进版本，但批量方法不接收
单个 `ifVersion`。提供 `select` 时，`records` 是更新后结果，并按 mutation 前主键升序排列。

## `deleteOne()`

`deleteOne()` 使用与 `updateOne()` 相同的严格单条 filter 语义，并已支持通过 `select` 返回
删除前快照：

```ts
const result = await projects.deleteOne({
  filter: (filter) => filter.string('id').eq('project-1'),
  ifVersion: 3,
  select: {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: ['id', 'name', 'status'],
    },
  },
});
```

```ts
expect(result).toEqual({
  record: {
    id: 'project-1',
    name: 'Repository redesign',
    status: 'archived',
  },
  deleted: true,
});
```

Repository 必须在同一事务中定位并锁定记录、校验匹配基数和 `ifVersion`、读取快照、删除并
返回结果。`deleteOne()` 不接受 Relation Builder；restrict、cascade 和 set-null 行为来自
Collection metadata 与数据库约束。

## `deleteMany()`

```ts
const result = await projects.deleteMany({
  filter: (filter) => filter.string('status').eq('archived'),
  select: (select) => select.fields('id', 'name'),
});
```

```ts
expect(result.deletedCount).toBe(12);
expect(result.records).toHaveLength(12);
```

全集删除必须显式确认：

```ts
await projects.deleteMany({ all: true });
```

`deleteMany({})`、空 filter group、变量解析成空条件，以及同时提供 `filter` 和 `all` 都必须
在执行前拒绝。提供 `select` 时，`records` 是删除前快照，并按 mutation 前主键升序排列。
批量 `select` 可以 include relation；省略 `select` 时不返回 `records`。批量 returning 要求
Collection 定义主键。

## TypeScript 类型轮廓

以下类型只表达候选接口的边界，不要求动态 Repository 在编译期得到完整 Collection schema：

```ts
interface CreateOneOptions<TCreateValues extends object> {
  readonly values: TCreateValues;
  readonly select?: SelectAst;
}

interface CreateManyOptions<TCreateScalarValues extends object> {
  readonly values: readonly [TCreateScalarValues, ...TCreateScalarValues[]];
}

interface UpdateOneOptions<
  TRecord extends object,
  TUpdateValues extends object,
> {
  readonly filter: RepositoryFilter<TRecord>;
  readonly values: TUpdateValues;
  readonly ifVersion?: string | number;
  readonly select?: SelectAst;
  readonly context?: RepositoryContext;
}

type MutationManyScope<TRecord extends object> =
  | {
      readonly filter: RepositoryFilter<TRecord>;
      readonly all?: never;
    }
  | {
      readonly filter?: never;
      readonly all: true;
    };

type UpdateManyOptions<
  TRecord extends object,
  TUpdateScalarValues extends object,
> = MutationManyScope<TRecord> & {
  readonly values: TUpdateScalarValues;
  readonly context?: RepositoryContext;
};

interface DeleteOneOptions<TRecord extends object> {
  readonly filter: RepositoryFilter<TRecord>;
  readonly ifVersion?: string | number;
  readonly select?: RepositorySelect<TRecord>;
  readonly context?: RepositoryContext;
}

type DeleteManyOptions<TRecord extends object> = MutationManyScope<TRecord> & {
  readonly context?: RepositoryContext;
};
```

静态 Collection schema 应分别派生四种写入类型：

```ts
type CreateValues<TCollection> = CreateScalarValues<TCollection> &
  CreateRelationFields<TCollection>;

type CreateManyValues<TCollection> = CreateScalarValues<TCollection>;

type UpdateValues<TCollection> = UpdateScalarValues<TCollection> &
  UpdateRelationFields<TCollection>;

type UpdateManyValues<TCollection> = UpdateScalarValues<TCollection>;
```

因此必填创建 Field、默认值、generated/readonly Field、relation cardinality、target create
类型和唯一 selector 都来自同一个 Collection schema。动态 Repository 则退化为通用记录，
并执行等价的 runtime metadata 校验。

## Builder 与 JSON 协议

Builder 是手写 TypeScript 的输入形式，不是规范传输协议：

```ts
tasks: (tasks) =>
  tasks
    .create({ title: 'New task' })
    .connect({ id: 'task-existing' })
    .disconnect({ id: 'task-old' });
```

HTTP、CLI、Agent、工作流和持久化配置可以直接使用模型形状的纯 JSON `values`：

```json
{
  "name": "New repository design",
  "owner": {
    "connect": {
      "id": "user-3"
    }
  },
  "tasks": {
    "create": [{ "title": "New task" }],
    "connect": [{ "id": "task-existing" }],
    "disconnect": [{ "id": "task-old" }]
  },
  "tags": {
    "set": [{ "id": "tag-database" }, { "id": "tag-orm" }]
  }
}
```

Repository 根据 Collection metadata 区分标量 JSON Field 和 relation Field，因此标量 JSON
值即使含有 `connect` 等同名 key，也不会被误判为关系操作。Builder 和 JSON 可以在同一
个 `values` 中按字段混用，并归一化到现有 Relation Mutation AST。后续是否公开新的规范
Mutation AST 版本另行设计。无论入口是 Builder 还是 JSON，都必须经过同一条路径：

```text
Builder callback or JSON AST
  -> normalize logical Field nodes
  -> validate Collection capabilities and budgets
  -> build dependency-aware Mutation Graph
  -> execute in one bound-connection transaction
  -> reload through Select AST
  -> return stable result envelope
```

## Mutation Graph 与事务

Planner 不能按对象字段顺序或 Builder 调用顺序直接执行。它应根据外键和 through relation
的所有权建立依赖：

```text
parent-owned relation
  -> create or resolve target
  -> propagate target key into root scalar values

root mutation
  -> create, update or lock root
  -> obtain root identity

child-owned relation
  -> propagate root key into child
  -> create, connect, update, upsert, disconnect or delete child

through-owned relation
  -> create, retain or delete relation edge

final select reload
  -> assemble logical result
```

含 relation mutation、非唯一单条 filter 探测、无原生 returning 的回读，以及 delete snapshot
的操作都可能需要多个数据库语句。它们必须复用 Repository 绑定的 connection，并在一个
事务中执行。Adapter 可以根据 capability 选择单语句或多语句策略，但不能改变公开语义。

## 结果契约

`createOne()` 和 `updateOne()` 继续使用现有 envelope：

```ts
interface SingleMutationResult<TResult> {
  readonly record: TResult;
  readonly createdTargets: readonly CreatedTargetReference[];
  readonly version?: string | number;
}
```

- `select` 只裁剪 `record`，不裁剪 `createdTargets` 或 `version`；
- `createdTargets` 继续映射显式 `clientKey` 的 nested create；
- `version` 是根记录 mutation 后的最新 optimistic lock 版本；
- 批量方法始终返回明确的 `createdCount`、`updatedCount` 或 `deletedCount`；显式提供
  `select` 时还返回 `records`。

`deleteOne()` 使用独立 envelope；省略 `select` 时不包含 `record`：

```ts
type DeleteOneResult<TResult = never> = [TResult] extends [never]
  ? { readonly deleted: true }
  : {
      readonly record: TResult;
      readonly deleted: true;
    };
```

## 校验与错误

当前实现包含以下稳定错误：

| code                                   | 含义                                    |
| -------------------------------------- | --------------------------------------- |
| `MULTIPLE_RECORDS_MATCHED`             | 单条根 filter 匹配超过一条              |
| `RELATION_TARGET_NOT_FOUND`            | 关系范围内没有匹配目标                  |
| `MULTIPLE_RELATION_TARGETS_MATCHED`    | 单目标关系动作匹配超过一条              |
| `RELATION_OPERATION_CONFLICT`          | 同一 relation 混用 `set` 与增量动作     |
| `RELATION_UPSERT_FILTER_NOT_UNIQUE`    | upsert filter 不等价于唯一约束          |
| `RELATION_UPSERT_TARGET_OUTSIDE_SCOPE` | 全局唯一目标存在，但不属于当前 relation |
| `RELATION_TARGET_DELETE_NOT_ALLOWED`   | 当前 relation 或调用边界不允许删除目标  |

错误 path 应直接对应模型形状输入，例如：

```text
values.tasks.operations[3].values.assignee
```

而不是要求调用者把错误重新映射回独立的顶层 `relations.items`。

## 与 Prisma 的取舍

| 设计点                        | Prisma Next                     | 本提案                             |
| ----------------------------- | ------------------------------- | ---------------------------------- |
| 单条方法命名                  | `create/update/delete`          | `createOne/updateOne/deleteOne`    |
| 批量方法命名                  | `createAll/updateAll/deleteAll` | `createMany/updateMany/deleteMany` |
| 根筛选                        | 链式 `.where(...)`              | `filter` + Filter Builder          |
| 写入对象                      | 直接模型字段对象                | `{ values: 模型字段对象 }`         |
| Relation Builder              | 字段 callback                   | 字段 callback                      |
| 单条普通 filter               | 更新第一条或返回 `null`         | 必须恰好匹配一条                   |
| 关系目标 update/upsert/delete | 当前实现未开放                  | capability 限制的已实现能力        |
| 批量 relation mutation        | 不支持                          | 不支持                             |
| 动态 JSON 协议                | 不是主要公开入口                | 必须支持                           |
| optimistic lock               | 没有同等 Repository 契约        | 保留 `ifVersion` 与 `version`      |
| nested create 结果映射        | 没有同等公开 envelope           | 保留 `createdTargets`              |
| 全集写入确认                  | 依赖链式状态                    | 显式 `all: true`                   |

本提案借鉴的是 Prisma 的模型形状写入、字段级 Relation Builder、标量快速路径和 Mutation
Graph，而不是复制其方法名或“第一条匹配记录”语义。

## 与当前 V1 的迁移

迁移前接口：

```ts
await projects.updateOne({
  unique: unique('id', 'project-1'),
  values: { name: 'Repository redesign' },
  relations: (relations) =>
    relations
      .set('owner', (owner) => owner.connect({ id: 'user-1' }))
      .patch('tasks', (tasks) => tasks.create({ title: 'Implement' })),
});
```

当前接口：

```ts
await projects.updateOne({
  filter: (filter) => filter.string('id').eq('project-1'),
  values: {
    name: 'Repository redesign',
    owner: (owner) => owner.connect({ id: 'user-1' }),
    tasks: (tasks) => tasks.create({ title: 'Implement' }),
  },
});
```

实现阶段：

1. 已完成：字段形状 `values`、Builder/JSON 双输入及 `create/connect/disconnect/set`；
2. 已完成：严格基数的根 `filter`；
3. 已完成：relation target `update/upsert/delete`；
4. 已完成：收口 Form Mutation Compiler 的文档契约，使表单生成字段形状的规范 JSON；仓库
   当前没有独立 compiler 实现，后续引入时遵循该契约；
5. 已完成：移除顶层 `relations`、单条 `unique` 和 `createMany.records`。

## 后续问题

- `belongsToMany` through payload 是否继续强制通过 through Collection Repository 修改；
- Mutation AST V2 是否保留 `operations` 数组，或按操作名分组以方便表单生成与 JSON Schema。

本文的核心写入示例对应当前实现；上述后续问题不属于当前稳定契约。
