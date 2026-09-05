---
title: Repository 记录写入
description: 使用 Repository 创建、更新、删除和 upsert 记录，掌握 values、批量返回、数值原子更新及执行前校验，并了解唯一条件、返回结构和写入保护。
---

# Repository 记录写入

本页介绍根级写入。关联记录写入见[关系写入](./relation-mutations.md)，并发控制见[事务与乐观锁](./transactions.md)。调用前必须已有 Collection Schema 和元数据；Repository 不创建表。

示例沿用[概览](./overview.md)的模型：`db` 为已配置的 `DatabaseManager`，`projects = db.repository('projects')`。`projects.id` 是调用方提供的字符串主键，`budget` 是 decimal 字段，`version` 已配置为乐观锁字段。各示例独立展示调用，不要求顺序执行。

## 按任务选择方法

主键和唯一键来自实际 Collection 约束，不依赖字段名 id 或 bigint 类型。createOne/updateOne/deleteOne 执行时需要可用于定位、重读的完整非空主键或无条件唯一选择器；nullable unique 的 NULL 不能作为记录标识，条件唯一约束不能当作全表唯一标识。createMany/updateMany/deleteMany 不带 select 的标量路径不要求主键。不要由一次 filter 恰好命中一条推断无唯一标识的单条写入已经支持。

| 方法         | 输入重点                                    | 返回结果                               |
| ------------ | ------------------------------------------- | -------------------------------------- |
| `createOne`  | `values`，可选 `select / context`           | `{ record, createdTargets, version? }` |
| `createMany` | 非空 `values` 数组，可选 `select / context` | `{ createdCount, records? }`           |
| `updateOne`  | 非空 `filter`、`values`                     | `{ record, createdTargets, version? }` |
| `updateMany` | `filter` 或 `all: true`、标量 `values`      | `{ updatedCount, records? }`           |
| `upsertOne`  | 唯一 `filter`、`create`、`update`           | `{ record, createdTargets, version? }` |
| `deleteOne`  | 非空 `filter`                               | `{ deleted: true, record? }`           |
| `deleteMany` | `filter` 或 `all: true`                     | `{ deletedCount, records? }`           |

表中删除和批量结果的 `record`／`records` 仅在传入 `select` 时出现。单条创建、更新和 upsert 始终返回 `record`，不是直接返回记录；`createdTargets` 是使用 `clientKey` 标记的嵌套创建引用，没有标记时通常为空数组。

## Values 变量与字面量

根级 `createOne / updateOne / updateMany` 的 values、`upsertOne` 的 create/update 支持同步 callback，callback 接收 ValuesBuilder 并返回字段对象；`createMany.values` 的 callback 返回非空数组。callback 只构造输入，不直接接收 context。

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: (v) => ({
    name: v.variable('$input.name'),
    budget: (budget) => budget.increment(v.variable('$input.delta')),
  }),
  context: { input: { name: 'Updated project', delta: '10.00' } },
});
```

纯 JSON 可使用 `{ kind: 'variable', path: '$input.name' }`。变量缺失、解析为 undefined、类型不匹配或原子操作数非法时，在执行写入前报错。错误携带值的位置和变量路径。根级 upsert 的两个分支都会预先解析与校验，不只检查最终执行的分支。`validateMutation` 的 createOne/updateOne 分支支持同样的 values callback 和 context。

JSON 字段可以整体引用变量，但不会递归解析普通 JSON 内部的变量标记。需要原样保存字段值边界上的变量标记时，使用 `v.literal(value)`，纯 JSON 为 `{ kind: 'literal', value }`。变量解析得到的数据不会再解释成变量或写入操作。不支持字段名、操作名或整个 mutation 结构的变量替换，也不支持异步 values callback。

变量也支持嵌套 create/update/upsert 的字段值、connect/disconnect/set 的选择器字段值和 through payload。嵌套对象复用外层 ValuesBuilder，不支持嵌套 values 再声明根级 callback；关系字段原有的 callback 仍用于构造关系操作。关系 update/upsert/delete 的 Filter 与根级 Filter、返回 select 共用顶层 context。变量解析不取消关系作用域、唯一选择器和受管理字段限制。

## 创建一条记录

`createOne` 和 `createMany` 均支持可选 `context`，用于显式 values 变量及返回 `select` 中各层关系 Filter 的变量解析。变量路径以 `$` 开头，例如 `filter.variable('$viewerCode')` 对应 `context: { viewerCode: 'user-a' }`。context 不自动填充未引用的 values、不作为事务对象，也不自动应用权限条件；变量缺失或类型不符合字段要求时，在写入前报错。

```ts
const result = await projects.createOne({
  values: {
    id: 'project-1',
    name: 'Repository documentation',
    status: 'draft',
    budget: '1000.00',
  },
  select: (select) => select.fields('id', 'name', 'status'),
});

console.log(result.record.id);
console.log(result.createdTargets);
console.log(result.version);
```

不要直接访问 `result.id`。主键若不是数据库自增或已配置的生成字段，就必须在 `values` 中提供。版本字段由 Repository 管理，不在 `values` 中手动赋值。

`createOne` 支持关系 `create` 和 `connect`，不接受关系 update、delete 或数值原子更新。

## 批量创建

```ts
const result = await projects.createMany({
  values: [
    { id: 'project-2', name: 'API guide', status: 'draft' },
    { id: 'project-3', name: 'Agent guide', status: 'draft' },
  ],
  select: (select) => select.fields('id', 'name'),
});

console.log(result.createdCount);
console.log(result.records);
```

- `values` 至少包含一条记录，只接受标量值，不支持嵌套关系写入。
- 不传 `select` 时只返回 `{ createdCount }`，不返回 records。
- 当前没有 `skipDuplicates`；不要将唯一约束冲突当作自动忽略。

## 更新一条记录

```ts
const result = await projects.updateOne({
  filter: (filter) => filter.string('id').eq('project-1'),
  values: { name: 'Repository usage guide', status: 'active' },
  ifVersion: 1,
  select: (select) => select.fields('id', 'name', 'status', 'version'),
});

console.log(result.record);
console.log(result.version);
```

`filter` 可以是等值简写、Builder 或完整 Filter AST，见 [Filter](./filter.md)。它不一定必须是唯一键条件，但执行时必须恰好命中一条：

- 零条：`RECORD_NOT_FOUND`。
- 多条：`MULTIPLE_RECORDS_MATCHED`，不会更新第一条后返回。
- 版本不一致：`VERSION_CONFLICT`。

`values` 中省略的字段不修改；显式 `null` 表示写入空值，是否允许由字段和数据库约束决定。`context` 可提供 Filter 变量，不用于传递事务，也不是自动写入的字段集合。

## 批量更新

```ts
const result = await projects.updateMany({
  filter: { status: 'draft' },
  values: { status: 'active', budget: { increment: '100.00' } },
  select: (select) => select.fields('id', 'status', 'budget'),
});

console.log(result.updatedCount);
console.log(result.records);
```

批量更新只接受标量赋值和数值原子更新，不支持嵌套关系操作，也不接受逐条 `ifVersion`。没有匹配时返回 `updatedCount: 0`；传入 select 时同时返回空 records 数组。

全表更新必须显式表达意图：

```ts
await projects.updateMany({
  all: true,
  values: { status: 'archived' },
});
```

`filter` 与 `all` 互斥；省略两者或使用空 filter 会报 `INVALID_FILTER`。此保护不替代业务权限和租户范围过滤。

## 按唯一条件创建或更新

```ts
const result = await projects.upsertOne({
  filter: { id: 'project-imported' },
  create: {
    id: 'project-imported',
    name: 'Imported project',
    status: 'draft',
  },
  update: { name: 'Updated imported project' },
  select: (select) => select.fields('id', 'name', 'version'),
});

console.log(result.record);
```

根级 upsert 的参数是 `create` 和 `update`，不是 `values`：

- `filter` 必须能解析为一个完整主键或唯一约束的等值条件，包括复合唯一键。
- `create` 必须显式包含与 filter 相同的唯一键值。
- `update` 不能把用于定位的唯一键改成其他值。
- 两个分支都支持各自允许的嵌套关系写入；两者都会在执行前校验。
- `ifVersion` 只约束更新分支；没有记录时仍可创建。
- 返回结果不包含 `created: boolean` 这样的分支标识。

## 删除记录并取得删除前的数据

```ts
const result = await projects.deleteOne({
  filter: { id: 'project-1' },
  ifVersion: 2,
  select: (select) => select.fields('id', 'name'),
});

console.log(result.deleted);
console.log(result.record);
```

`deleteOne` 的匹配与版本规则和 `updateOne` 相同。select 返回删除前的快照；不传 select 时只返回 `{ deleted: true }`。外键如何阻止或级联删除由 Schema 约束决定，Repository 不隐式忽略约束。

```ts
const result = await projects.deleteMany({
  filter: { status: 'archived' },
  select: (select) => select.fields('id', 'name'),
});

console.log(result.deletedCount);
console.log(result.records);
```

`deleteMany` 沿用批量范围保护；全表删除必须使用 `all: true`。未命中返回零，不报 `RECORD_NOT_FOUND`。

## 批量 select 的契约

三个批量方法都可以使用 [Select](./select.md)，读取创建／更新后的数据或删除前快照。

- Collection 必须有主键，否则 `select` 会报 `INVALID_MUTATION`；仅有普通唯一键不足以启用批量返回。
- 返回记录需要稳定标识可重读；建议不在批量更新中改变主键。
- `createMany` 的 records 保持输入顺序；update／delete 不提供自定义结果排序选项，调用方不要把它们当分页查询。
- 当前批量 returning 可能需要事务、多条 SQL 和回读，不应假设底层只有一条原生 `RETURNING`。
- select 可读取关系，不代表批量 values 也支持关系写入。

## 数值原子更新

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: { budget: (value) => value.increment('100.25') },
});

await db.repository('tasks').updateOne({
  filter: { id: 'task-1' },
  values: { points: { decrement: 1 } },
});
```

| 操作 | JSON 输入          | Builder                         |
| ---- | ------------------ | ------------------------------- |
| 加   | `{ increment: 2 }` | `(value) => value.increment(2)` |
| 减   | `{ decrement: 2 }` | `(value) => value.decrement(2)` |
| 乘   | `{ multiply: 2 }`  | `(value) => value.multiply(2)`  |
| 除   | `{ divide: 2 }`    | `(value) => value.divide(2)`    |

运算在数据库中执行，避免应用端“先读后写”覆盖并发结果。每个字段每次只能选择一个运算，支持 integer、bigInt、decimal、float、double 的更新分支，包括批量和嵌套更新。

边界必须保留：

- 不用于 create；不修改主键、唯一键、生成字段或版本字段。
- 操作数是有限 number、bigint 或数值字符串；整数列要求精确整数，避免不安全的 JavaScript number。
- 除数不能为零；NULL 参与运算仍为 NULL，不会自动当作零。
- 除法、舍入、精度与溢出按数据库列类型执行，不保证各数据库整数除法完全一致。
- JSON 字段里的 `{ increment: 1 }` 是普通 JSON 数据，不是运算。
- bigint 不是原生 JSON 可序列化值；需要 JSON 传输时使用合法数值字符串。

## 描述能力与执行前校验

```ts
const description = await projects.describeMutation({ operation: 'updateOne' });
console.log(description.relations);
console.log(description.limits);

const validation = await projects.validateMutation({
  operation: 'updateOne',
  filter: { id: 'project-1' },
  values: { budget: { increment: '10.00' } },
  ifVersion: 2,
});

if (!validation.valid) {
  console.log(validation.errors);
}
```

这两个方法当前只接受 `operation: 'createOne' | 'updateOne'`。description 提供关系 cardinality、允许的规范化 action、唯一键、through 可写字段与嵌套限制，不是整个 Collection 的字段 Schema。其 `allowedActions` 使用内部规范化名称 `set / clear / patch / replace / modify`，不要直接作为 values 属性；例如 to-many 的 replace 对应公开 `set`。

validateMutation 返回 `{ valid, errors }`，当前一次返回首个 Repository 校验错误及其 code、path 等定位信息。它不会写数据库，但也不检查记录是否存在、实际命中数量、当前版本或全部数据库约束，不能视为执行成功保证。它不是权限校验接口。

## 实施验证清单

- 检查参数和[真实返回结构](../reference/repository-api.md)，特别是 `record` 与 `records`。
- 覆盖未命中、多条命中、唯一冲突、版本冲突和空批量输入。
- 对嵌套写入和批量 returning 验证失败回滚。
- 对 decimal／bigInt 在目标数据库验证结果类型和精度，不硬编码所有驱动都返回 number。
