---
title: Repository 关系写入
description: 通过 Repository values 的 Builder 或 JSON 创建、连接、解除、替换和修改关联记录，掌握嵌套事务、关系范围、多对多 through payload 及操作限制。
---

# Repository 关系写入

## 在关系写入中引用 context

根级 values callback 的 `v.variable()` 可用于嵌套字段、关系选择器和 through payload。以下假设 projects 的 owner 关系目标以 accountCode 唯一定位，tasks 支持嵌套创建；实际字段和关系键必须以 Collection 定义为准。

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: (v) => ({
    owner: (owner) => owner.connect({ accountCode: v.variable('$ownerCode') }),
    tasks: (tasks) =>
      tasks.create({
        title: v.variable('$taskTitle'),
      }),
  }),
  context: { ownerCode: 'USER-A', taskTitle: 'Implement variables' },
});
```

嵌套 update/upsert/delete 的 Filter 也使用这份 context，仍受当前父记录的关系作用域约束。预校验使用相同的变量解析规则，数据库执行阶段的失败仍按事务回滚。JSON payload 的变量消歧规则见[Values 变量与字面量](./mutations.md#values-变量与字面量)。

关系操作放在 `values` 的关系字段内，可使用 Builder、纯 JSON 或混合输入。字段和关系必须已定义；不能凭字段名推断关系，也不能照搬其他 ORM 的 `where` 或 `connectOrCreate`。

示例沿用[概览](./overview.md)：`projects = db.repository('projects')`；owner 是指向 users 的可空 belongsTo，tasks 是通过可空 `tasks.projectId` 建立的 hasMany，tags 是经 projectTags 的 belongsToMany。所有字符串主键由调用方提供；被 connect 的目标必须已存在。各片段独立展示操作。

## 先选对操作

| 操作         | 对目标记录的影响               | 适用范围                    |
| ------------ | ------------------------------ | --------------------------- |
| `create`     | 创建目标并建立关系             | to-one、to-many             |
| `connect`    | 关联已有目标，不创建目标       | to-one、to-many             |
| `disconnect` | 解除关系，不删除目标           | to-one、to-many，需可解除   |
| `set`        | 以给定目标集合替换当前关系集合 | 仅 to-many                  |
| `update`     | 修改当前关系范围内的一条目标   | to-one、to-many             |
| `upsert`     | 在当前关系范围内更新或创建目标 | to-one、to-many             |
| `delete`     | 删除目标记录，不仅是解除关系   | to-one、to-many，受约束限制 |

`belongsTo / hasOne` 是 to-one；`hasMany / belongsToMany` 是 to-many。

- `createOne` 的关系输入只允许 create／connect。
- `updateOne` 和 upsert 的 update 分支支持符合元数据约束的七类操作。
- `createMany / updateMany` 不接受嵌套关系写入；多父记录的关系变更需显式事务和单条调用。

## 创建记录并同时建立关系

```ts
const result = await projects.createOne({
  values: {
    id: 'project-1',
    name: 'Repository guide',
    status: 'draft',
    owner: (owner) => owner.connect({ id: 'user-1' }),
    tasks: (tasks) =>
      tasks.create(
        { id: 'task-new', title: 'Write examples', status: 'open' },
        { clientKey: 'first-task' },
      ),
    tags: { connect: [{ id: 'tag-db' }, { id: 'tag-docs' }] },
  },
  select: (select) =>
    select
      .fields('id', 'name')
      .include('tasks', (tasks) => tasks.fields('id', 'title')),
});

console.log(result.record);
console.log(result.createdTargets);
```

`clientKey` 是本次 mutation 内非空且唯一的标签，用于从 `createdTargets` 找到新建记录的唯一标识；它不是数据库字段，也不是另一条 connect 可引用的占位符。

关系与外键由 Repository 维护。例如上述 tasks.create 不需要自行填 `projectId`。不要同时通过关系操作和标量外键表达相互冲突的赋值。

## 增量更新多个关系

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    owner: (owner) => owner.connect({ id: 'user-2' }),
    tasks: (tasks) =>
      tasks
        .create({ id: 'task-created', title: 'New task', status: 'open' })
        .connect({ id: 'task-existing' })
        .disconnect({ id: 'task-detached' })
        .update({
          filter: { id: 'task-edit' },
          values: { title: 'Edited task', points: { increment: 1 } },
        })
        .upsert({
          filter: { id: 'task-imported' },
          create: {
            id: 'task-imported',
            title: 'Imported task',
            status: 'open',
          },
          update: { title: 'Updated imported task' },
        })
        .delete({ filter: { id: 'task-obsolete' } }),
  },
  select: (select) =>
    select
      .fields('id')
      .include('tasks', (tasks) => tasks.fields('id', 'title')),
});
```

相应的纯 JSON 输入放在相同的 values 位置：

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    owner: { connect: { id: 'user-2' } },
    tasks: {
      create: { id: 'task-created', title: 'New task', status: 'open' },
      connect: { id: 'task-existing' },
      disconnect: { id: 'task-detached' },
      update: {
        filter: { id: 'task-edit' },
        values: { title: 'Edited task', points: { increment: 1 } },
      },
      upsert: {
        filter: { id: 'task-imported' },
        create: { id: 'task-imported', title: 'Imported task', status: 'open' },
        update: { title: 'Updated imported task' },
      },
      delete: { filter: { id: 'task-obsolete' } },
    },
  },
});
```

JSON 的 create、connect 和 to-many disconnect 可接受单项或数组；update／upsert／delete 可接受操作对象或数组。Builder 用重复调用表达多项。Builder 链声明的是待执行的 mutation，不是每调用一个方法立即发出 SQL；不要依赖链式书写顺序把同一目标安排成多个相互依赖的操作。

## 替换集合与解除关系

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    tags: (tags) => tags.set([{ id: 'tag-db' }, { id: 'tag-orm' }]),
    owner: (owner) => owner.disconnect(),
  },
});
```

纯 JSON 对应 `tags: { set: [{ id: 'tag-db' }, { id: 'tag-orm' }] }` 和 `owner: { disconnect: true }`。

- `set` 的目标是已有记录的唯一 selector；`set: []` 清空集合。
- 同一关系的 set 不能与 create、connect、disconnect、update、upsert、delete 混用。
- to-one 解除使用 `.disconnect()` 或 `{ disconnect: true }`，不能带 selector。
- to-many 解除必须指定 selector；`.disconnect()` 或 `disconnect: true` 不表示清空集合。
- belongsTo／hasOne／hasMany 能否解除取决于外键是否可空；belongsToMany 解除删除中间表记录。
- 不允许隐式抢占已属于其他父记录的 hasOne／hasMany 目标；这类操作会报 `RELATION_REASSIGNMENT_REQUIRED`，需要业务显式安排解除与重新关联。

## to-one 修改与关系范围

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    owner: (owner) => owner.update({ values: { name: 'Updated owner' } }),
  },
});
```

to-one 的 update／upsert／delete 可省略目标 filter，作用于当前关联对象；同一关系一次只接受一个操作。删除可写为 `.delete()` 或 `{ delete: true }`。非空 belongsTo 不允许直接删除其目标。

to-many 的 update／upsert／delete 必须提供非空 filter；每项是单条目标操作，不是关系内 updateMany：

- 查询范围始终限制在当前父记录已关联的目标中。
- update／delete 未命中报 `RELATION_TARGET_NOT_FOUND`，命中多条报 `MULTIPLE_RELATION_TARGETS_MATCHED`。
- to-many upsert 必须有目标唯一键等值条件；create 需要相同唯一值。建议 update 保持定位字段不变，避免改变后续同步任务使用的身份。
- 若该唯一目标存在但不在当前关系中，upsert 报 `RELATION_UPSERT_TARGET_OUTSIDE_SCOPE`，不会自动 connect 或跨范围更新。
- belongsToMany 的 update 修改目标表；delete 删除目标记录，而不是只删当前中间表关系。共享目标的删除影响需要业务确认，并受数据库外键约束限制。

## 多层嵌套

嵌套 create 的 values 可以继续包含 create／connect；嵌套 update 的 values 可以继续包含合法关系操作。例如 users 已定义反向 projects 关系时，可以在 users.createOne 的 projects.create 内再创建 tasks。实际关系字段必须存在，不能仅凭示例臆造反向关系。

当前 mutation 限制为 `maxDepth: 3`、`maxNodes: 100`，以 `describeMutation().limits` 为准。超限会拒绝，不自动拆批。大批关系写入应显式拆分并决定事务范围。

## belongsToMany 的 through payload

payload 修改的是中间表额外字段，不是目标字段。这里 `projectTags.role` 记录标签在当前项目中的用途。

### Builder

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    tags: (tags) =>
      tags
        .connect({ id: 'tag-db' }, { through: { role: 'primary' } })
        .create(
          { id: 'tag-new', label: 'New tag' },
          { through: { role: 'secondary' } },
        ),
  },
});
```

### JSON

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    tags: {
      connect: { where: { id: 'tag-db' }, through: { role: 'primary' } },
      create: {
        values: { id: 'tag-new', label: 'New tag' },
        through: { role: 'secondary' },
      },
    },
  },
});
```

这里的 `where` 仅是 through connect 包装内的目标唯一 selector，根级与关系 update 仍使用 `filter`。

set 也支持 payload；Builder 的 `.set()` 接受相同的目标数组：

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: {
    tags: {
      set: [
        { where: { id: 'tag-db' }, through: { role: 'primary' } },
        { id: 'tag-docs' },
      ],
    },
  },
});
```

payload 语义：

- 新关系插入显式字段；无默认值的非空 through 字段必须提供。
- 已有关系只更新显式提供的字段；省略 payload 保留原值，包括 set 中保留的关系。
- 关系外键、主键、生成字段、版本字段由 Repository 管理，不接受 payload 赋值。
- 只支持 connect／create／set，不支持通过 relation update 修改中间表。
- payload 是标量写入对象，不支持嵌套关系或数值原子运算；JSON 字段仍可存普通 JSON 数据。
- 没有独立 through `ifVersion` 参数；如需独立校验和更新中间表，请使用中间表自己的 Repository，并显式安排事务。

## 验证与故障处理

先通过 [describeMutation／validateMutation](./mutations.md#描述能力与执行前校验)核对允许操作、目标唯一键及 through 必填字段。单次根 mutation 的关联写入属于同一事务；在已有事务内调用时复用外层事务，错误必须传播才能整体回滚，见[事务](./transactions.md)。

至少测试：目标不存在、重复 selector、越过关系范围、不可空外键解除、through 必填缺失、多层失败回滚。新增关系操作后用 [Select](./select.md) 验证目标数据和关系；对 disconnect／delete 还需独立查询目标表，确认二者语义没有混淆。
