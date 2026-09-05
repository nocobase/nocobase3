---
title: Repository 写入方法示例
description: 汇总 Repository 六个写入方法的完整示例，包括关系操作、严格单条筛选、批量安全、上下文变量、乐观锁与返回结果。
---

# Repository 写入方法示例

Repository 提供六个按记录基数区分的写入方法：

```ts
repository.createOne({ values, select });
repository.createMany({ values });

repository.updateOne({ filter, values, ifVersion, select, context });
repository.updateMany({ filter, values, context });

repository.deleteOne({ filter, ifVersion, context });
repository.deleteMany({ filter, context });
```

其中，`createOne()` 和 `updateOne()` 支持关系写入；批量方法不支持关系写入，
`createMany()` / `updateMany()` 的 `values` 只接受标量字段。`updateOne()` 和
`deleteOne()` 的 `filter` 必须恰好匹配一条记录。

以下示例假设存在 `projects`、`users`、`tasks` 和 `tags` Collection，并且 `projects`
配置了自增的 `version` optimistic lock Field。

## 公共 Select 示例

`createOne()` 和 `updateOne()` 可以通过 `select` 指定写入后回读的记录形状：

```ts
import type { SelectBuilder } from '@nocobase/db';

const projectSelect = (select: SelectBuilder) =>
  select
    .fields('id', 'name', 'status', 'version')
    .include('owner', (owner) => owner.fields('id', 'name'))
    .include('tasks', (tasks) => tasks.fields('id', 'title'))
    .include('tags', (tags) => tags.fields('id', 'name'));
```

需要通过 HTTP、CLI 或持久化配置传递时，也可以使用等价的纯 JSON Select AST。

## `createOne()`

创建一条根记录，并可在同一个 `values` 中创建或连接关系目标：

```ts
const projects = db.repository('projects');

const result = await projects.createOne({
  values: {
    name: 'Repository redesign',
    status: 'draft',

    owner: (owner) =>
      owner.connect({
        id: 'user-1',
      }),

    tasks: (tasks) =>
      tasks
        .create(
          {
            title: 'Implement mutation graph',
            assignee: (assignee) =>
              assignee.connect({
                id: 'user-2',
              }),
          },
          { clientKey: 'task-local-1' },
        )
        .connect({
          id: 'task-existing',
        }),

    tags: (tags) =>
      tags.connect({ id: 'tag-database' }).create({ name: 'ORM' }),
  },
  select: projectSelect,
});
```

返回值是 `SingleMutationResult`：

```ts
result.record;
// The final root record and relations requested by select.

result.createdTargets;
// [{ clientKey: 'task-local-1', collection: 'tasks', unique: ... }]

result.version;
// 1 when the Collection enables optimistic locking.
```

关系 Field 也可以使用纯 JSON。下面与不带 `clientKey` 的 Builder 写法等价：

```ts
await projects.createOne({
  values: {
    name: 'Repository redesign',
    status: 'draft',
    owner: {
      connect: { id: 'user-1' },
    },
    tasks: {
      create: [
        {
          title: 'Implement mutation graph',
          assignee: {
            connect: { id: 'user-2' },
          },
        },
      ],
      connect: [{ id: 'task-existing' }],
    },
    tags: {
      connect: [{ id: 'tag-database' }],
      create: [{ name: 'ORM' }],
    },
  },
  select: projectSelect,
});
```

`createOne()` 的 relation Field 只允许 `create` 和 `connect`。因为根记录和嵌套 source 都是
新建记录，不存在需要断开、替换、更新或删除的旧关系。

## `createMany()`

批量创建多条根记录：

```ts
const result = await projects.createMany({
  values: [
    {
      name: 'Project A',
      status: 'draft',
    },
    {
      name: 'Project B',
      status: 'active',
    },
  ],
});

result.createdCount;
// 2
```

`values` 必须是非空数组。所有记录会先完成校验，再在同一个事务中写入；任意一条失败时
整批回滚。

`createMany()` 不接受 relation Field：

```ts
// Unsupported: bulk mutation values must not contain relation Fields.
await projects.createMany({
  values: [
    {
      name: 'Project A',
      owner: { connect: { id: 'user-1' } },
    },
  ],
});
```

需要关系写入时，使用能够明确定位每个 source 的 `createOne()`。

## `updateOne()`

更新恰好一条根记录，并在同一个事务中执行关系操作：

```ts
const result = await projects.updateOne({
  filter: { id: 'project-1' },

  values: {
    name: 'New repository design',
    status: 'active',

    owner: (owner) =>
      owner.connect({
        id: 'user-3',
      }),

    reviewer: (reviewer) => reviewer.disconnect(),

    tasks: (tasks) =>
      tasks
        .create({
          title: 'Implement mutation graph',
        })
        .connect({
          id: 'task-existing',
        })
        .disconnect({
          id: 'task-old',
        })
        .update({
          filter: { id: 'task-update' },
          values: {
            title: 'Updated title',
          },
        })
        .upsert({
          filter: { externalId: 'external-1' },
          create: {
            externalId: 'external-1',
            title: 'Created title',
          },
          update: {
            title: 'Updated title',
          },
        })
        .delete({
          filter: { id: 'task-delete' },
        }),

    tags: (tags) => tags.set([{ id: 'tag-database' }, { id: 'tag-orm' }]),
  },

  ifVersion: 2,
  select: projectSelect,
});

result.record;
// The record after the mutation completes.

result.version;
// 3
```

关系操作的含义：

| 操作         | 含义                                                   |
| ------------ | ------------------------------------------------------ |
| `create`     | 创建目标记录并连接                                     |
| `connect`    | 连接已有目标                                           |
| `disconnect` | 解除关系，但不删除目标记录                             |
| `set`        | 把 to-many 关系完整替换为给定目标集合                  |
| `update`     | 更新当前 relation scope 内恰好一个目标                 |
| `upsert`     | 唯一目标存在时更新，不存在时创建并连接                 |
| `delete`     | 删除当前 relation scope 内恰好一个目标，而不仅解除关系 |

`set` 是完整状态操作，不能与同一个 relation Field 上的增量操作混用：

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    tags: (tags) => tags.set([]),
  },
});
```

上例会清空 `tags` 关系，但不会删除 tag 目标记录。

### 纯 JSON 写法

HTTP、CLI、Agent tool 和动态表单可以提交等价的纯 JSON `values`：

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    name: 'New repository design',
    owner: {
      connect: { id: 'user-3' },
    },
    reviewer: {
      disconnect: true,
    },
    tasks: {
      create: [{ title: 'Implement mutation graph' }],
      connect: [{ id: 'task-existing' }],
      disconnect: [{ id: 'task-old' }],
      update: [
        {
          filter: { id: 'task-update' },
          values: { title: 'Updated title' },
        },
      ],
      upsert: [
        {
          filter: { externalId: 'external-1' },
          create: {
            externalId: 'external-1',
            title: 'Created title',
          },
          update: { title: 'Updated title' },
        },
      ],
      delete: [{ filter: { id: 'task-delete' } }],
    },
    tags: {
      set: [{ id: 'tag-database' }, { id: 'tag-orm' }],
    },
  },
  ifVersion: 2,
  select: projectSelect,
});
```

这里的根 Filter 和 target Filter 都是 equality shorthand。JSON 边界的复杂条件仍使用完整
Filter AST，不提交 Builder callback，也不直接提交 Repository 内部 Relation Mutation AST。

### `filter` 的严格单条语义

`filter` 不要求必须写成主键条件，但执行时必须恰好匹配一条：

```ts
await projects.updateOne({
  filter: { slug: 'repository-redesign' },
  values: {
    status: 'active',
  },
});
```

- 匹配 0 条：抛出 `RECORD_NOT_FOUND`；
- 匹配 1 条：执行更新；
- 匹配多条：抛出 `MULTIPLE_RECORDS_MATCHED`。

Repository 不会通过 `LIMIT 1` 静默更新第一条记录。

### `context` 和变量

`context` 为 Filter Builder 或 Filter AST 中的变量提供只读值：

```ts
await projects.updateOne({
  filter: (filter) =>
    filter.and([
      filter.string('tenantId').eq(filter.variable('$tenantId')),
      filter.string('id').eq(filter.variable('$projectId')),
    ]),
  context: {
    tenantId: 'tenant-1',
    projectId: 'project-1',
  },
  values: {
    status: 'active',
  },
});
```

`context` 只负责变量解析，不表示调用方已经完成授权。访问控制仍由调用 Repository 的可信
边界负责。

### `ifVersion` 乐观锁

当 Collection 配置 optimistic lock 时，可以要求数据库当前版本必须等于客户端读到的版本：

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  ifVersion: 2,
  values: {
    status: 'active',
  },
});
```

版本不一致时抛出 `VERSION_CONFLICT`。成功的根字段更新或关系更新都会推进根记录版本。

## `updateMany()`

批量更新所有匹配记录：

```ts
const result = await projects.updateMany({
  filter: (filter) =>
    filter.and([
      filter.string('tenantId').eq(filter.variable('$tenantId')),
      filter.string('status').eq('draft'),
    ]),
  context: {
    tenantId: 'tenant-1',
  },
  values: {
    status: 'archived',
  },
});

result.updatedCount;
// The number of updated records.
```

确实需要更新整个 Collection 时，必须显式使用 `all: true`：

```ts
await projects.updateMany({
  all: true,
  values: {
    status: 'archived',
  },
});
```

`filter` 和 `all` 互斥，不能同时提供。`values` 必须是非空对象，并且只能包含直接标量
Field；`updateMany()` 不支持 relation mutation、`select` 或 `ifVersion`。

## `deleteOne()`

删除恰好一条记录：

```ts
const result = await projects.deleteOne({
  filter: (filter) =>
    filter.and([
      filter.string('tenantId').eq(filter.variable('$tenantId')),
      filter.string('id').eq('project-1'),
    ]),
  context: {
    tenantId: 'tenant-1',
  },
  ifVersion: 3,
});

result;
// { deleted: true }
```

`deleteOne()` 与 `updateOne()` 使用相同的严格单条 `filter` 语义。提供 `ifVersion` 时，版本
比较和删除在同一个事务中完成。

`deleteOne()` 当前不接受 `select`，也不返回删除前记录。关系限制、外键约束和级联行为由
Collection metadata 与数据库约束决定。

## `deleteMany()`

删除所有匹配记录：

```ts
const result = await projects.deleteMany({
  filter: (filter) =>
    filter.and([
      filter.string('tenantId').eq(filter.variable('$tenantId')),
      filter.string('status').eq('archived'),
    ]),
  context: {
    tenantId: 'tenant-1',
  },
});

result.deletedCount;
// The number of deleted records.
```

删除整个 Collection 也必须显式确认：

```ts
await projects.deleteMany({
  all: true,
});
```

`deleteMany()` 不支持 relation mutation、`select` 或 `ifVersion`。省略 `filter` 且没有
`all: true` 会被拒绝，不会被解释为删除全部记录。

## 方法对照

| 方法           | `values`         | 根记录范围                | 关系写入 | 返回值                 |
| -------------- | ---------------- | ------------------------- | -------- | ---------------------- |
| `createOne()`  | 模型形状         | 一条新记录                | 支持     | `SingleMutationResult` |
| `createMany()` | 非空标量记录数组 | 多条新记录                | 不支持   | `{ createdCount }`     |
| `updateOne()`  | 非空模型形状     | `filter` 恰好匹配一条     | 支持     | `SingleMutationResult` |
| `updateMany()` | 非空标量对象     | `filter` 全部匹配或 `all` | 不支持   | `{ updatedCount }`     |
| `deleteOne()`  | 无               | `filter` 恰好匹配一条     | 不支持   | `{ deleted: true }`    |
| `deleteMany()` | 无               | `filter` 全部匹配或 `all` | 不支持   | `{ deletedCount }`     |

## 使用规则

- Repository 输入始终使用 Collection 和 Field 逻辑名，不使用物理表名或列名；
- `createOne()` 关系字段只允许 `create/connect`；
- `updateOne()` 支持 `create/connect/disconnect/set/update/upsert/delete`；
- `set` 表示完整集合，不能和同一 Field 的增量操作混用；
- `disconnect` 只解除关系，`delete` 才删除目标记录；
- to-many target `update/delete` 必须提供 filter，且在当前 relation scope 内恰好匹配一条；
- `upsert.filter` 必须等价于主键或唯一约束，`create` 必须携带相同的唯一字段值；
- 批量方法不支持关系写入；全量更新或删除必须显式提供 `all: true`；
- `context` 只解析 Filter 变量，不承担授权；
- 简单 equality Filter 使用 shorthand；比较、逻辑组合、变量或关系筛选使用 Builder 或完整 AST；
- Builder 和纯 JSON `values` 共享相同语义，并归一化为 Repository 内部执行协议。

更深入的设计与内部执行说明见：

- [Repository 概览](./overview.md)
- [Repository 写入 API 改进提案](./prisma-inspired-mutations.md)
- [Mutation AST](./mutation-ast.md)
- [Filter Builder](./filter-builder.md)
- [表单到 Repository Mutation](./form-mutation.md)
