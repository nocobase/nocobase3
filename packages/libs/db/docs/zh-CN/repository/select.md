---
title: Repository Select：字段与关系选择
description: 使用 Select Builder 或 JSON AST 选择标量和嵌套关系，了解 include 的返回形态、局部查询条件、不可变关系分支和 TypeScript 类型推导边界。
---

# Repository Select：字段与关系选择

`select` 控制返回哪些标量字段、关系记录或关系聚合。示例的 db 和模型前提见[概览](./overview.md)。

## 标量与关系

```ts
const rows = await db.repository('projects').findMany({
  select: (select) =>
    select
      .fields('id', 'name')
      .include('owner', (owner) => owner.fields('id', 'name'))
      .include('tasks', (tasks) =>
        tasks
          .fields('id', 'title')
          .filter({ status: 'open' })
          .sort((sort) => sort.field('id').asc())
          .limit(10),
      ),
});
```

返回形状为 `{ id, name, owner: { id, name } | null, tasks: Array<{ id, title }> }[]`。to-one 未命中为 null，to-many 未命中为 `[]`。查询使用逻辑字段名，不暴露为关联加载而选取的内部辅助列。

- 不传 select，默认返回全部标量字段，不自动展开关系。
- 未调用 fields，也选择全部标量字段；`.fields()` 显式选择零个标量，可仅返回 includes。
- 多次 fields 调用累加字段，重复字段或重复 include 同一关系会报 `INVALID_SELECT`。
- include 回调必须返回关系 Builder 或关系选择表达式，不能返回任意对象。

## 对应 JSON AST

```ts
import type { SelectAst } from '@nocobase/db';

const select: SelectAst = {
  kind: 'select',
  version: 1,
  root: {
    kind: 'selection',
    fields: ['id', 'name'],
    includes: [
      {
        kind: 'include',
        relation: 'owner',
        select: { kind: 'selection', fields: ['id', 'name'] },
      },
    ],
  },
};
const rows = await db.repository('projects').findMany({ select });
```

AST 的 collection 可省略；提供时必须与当前 Repository 一致。includes 中的 select 描述目标 Collection，而非根 Collection。

## 关系局部条件与嵌套

支持四种关系以及递归 include，前提是每一级 Relation Metadata 都存在。局部 filter 只影响该关系返回内容，不会过滤掉根记录；要过滤根记录，使用[关系 Filter](./filter.md)。

to-many 支持局部 filter、sort、limit、cursor、direction、distinct；to-one 不支持局部排序、分页或聚合。局部分页按每个父记录分别生效，详见[分页](./pagination.md)。关系加载按关系分支批量执行，不是每个父记录一次查询；记录分支的局部 limit 不保证数据库只读取该数量的子记录。

关系 Builder 是不可变的：保留或返回链式调用结果，不依赖原对象被修改。根 Select Builder 回调则必须返回传入的根 Builder。通过同一关系返回记录及统计使用[combine](#关系聚合与独立分支)，不是重复 include。

## 类型推导

```ts
interface ProjectRecord {
  id: string;
  name: string;
  status: string;
}
const rows = await db.repository<ProjectRecord>('projects').findMany({
  select: (select) => select.fields('id', 'name'),
});
// rows: Array<Pick<ProjectRecord, 'id' | 'name'>>
```

显式提供泛型有助于字段检查，但不替代运行时 Collection 校验。Builder 标量选择也用于单条和批量 mutation returning 的类型推导。

关系 aggregate/combine 的名称和结果可推导；普通关系记录 include 尚未完整推导嵌套结构，可能回退到 TRecord。JSON AST 不提供 Builder 同等的精确推导；不要把 fallback 类型理解为运行时一定返回所有字段。

## 限制与验证

选择图最多 200 个校验节点、深度 20；combine 每个最多 32 个分支，复杂组合可能更早耗尽校验预算。未知字段、错误 relation、重复字段和不支持的局部选项会拒绝执行。Streaming 不允许任何 include。

验证应覆盖：未关联父记录的 null/[]、过滤后空关系、根记录不被局部 filter 移除、未请求字段不泄漏、嵌套路径与 Builder/AST 结果一致。

继续阅读：[查询](./methods/find-many.md)、[聚合](./methods/aggregate.md)、[写入返回值](./values.md)。

## 关系聚合与独立分支

```ts
const rows = await db.repository('projects').findMany({
  select: (select) =>
    select.fields('id').include('tasks', (tasks) =>
      tasks.filter({ status: 'open' }).combine({
        records: tasks
          .fields('id', 'title')
          .sort((sort) => sort.field('id').asc())
          .limit(10),
        count: tasks.count(),
        total: tasks.sum('points'),
      }),
    ),
});
```

每条父记录的 tasks 返回 `{ records: [...], count, total }`。公共 filter 应用于所有分支；分支 filter 再与公共条件 AND。分支局部 sort/limit/cursor/direction/distinct 覆盖对应公共选项，省略则继承。

关系 Builder 是不可变快照；不要写 `tasks.limit(10); return tasks.count()` 并期待 limit 生效。上面的 records 只有前十条，但 count 和 total 统计整个公共过滤范围。单个统计可以直接 `.include('tasks', tasks => tasks.count())`，结果 tasks 是 number。

只允许 hasMany/belongsToMany 聚合。聚合分支不能同时 fields/include；需要记录时用 combine 的独立记录分支。分页聚合在该父记录的过滤、distinct、cursor 和 limit 之后计算，分页聚合要求直接标量字段排序。详见[分页](./pagination.md)。

## combine 对应 JSON

```ts
import type { SelectAst } from '@nocobase/db';
const select: SelectAst = {
  kind: 'select',
  version: 1,
  root: {
    kind: 'selection',
    fields: ['id'],
    includes: [
      {
        kind: 'include',
        relation: 'tasks',
        select: { kind: 'selection' },
        result: {
          kind: 'combine',
          branches: {
            records: { select: { kind: 'selection', fields: ['id', 'title'] } },
            count: { select: { kind: 'selection' }, result: { kind: 'count' } },
            total: {
              select: { kind: 'selection' },
              result: { kind: 'sum', field: 'points' },
            },
          },
        },
      },
    ],
  },
};
const rows = await db.repository('projects').findMany({ select });
```

记录分支省略 result；聚合分支保留空的 selection，并用 result 指定聚合。branch 可带自己的 filter/sort/limit/cursor/direction/distinct。combine 名称不能为 `__proto__`、`constructor` 或 `prototype`；分支数量 1–32，受全局 Select 深度和节点预算限制。

聚合在 SQL 内计算，按分支批量查询而不是按父记录逐次查询。多个分支可能由多条 SQL 完成，不保证天然同一快照；需要一致视图时使用符合业务隔离要求的[事务](./transactions.md)。

## 写入返回选择

三个批量方法都可以使用 [Select](./select.md)，读取创建／更新后的数据或删除前快照。

- Collection 必须有主键，否则 `select` 会报 `INVALID_MUTATION`；仅有普通唯一键不足以启用批量返回。
- 返回记录需要稳定标识可重读；建议不在批量更新中改变主键。
- `createMany` 的 records 保持输入顺序；update／delete 不提供自定义结果排序选项，调用方不要把它们当分页查询。
- 当前批量 returning 可能需要事务、多条 SQL 和回读，不应假设底层只有一条原生 `RETURNING`。
- select 可读取关系，不代表批量 values 也支持关系写入。

单条 create/update/upsert 返回 record 包装；deleteOne 仅带 select 时返回 record，且为删除前快照。context 在返回关系 Filter 中的规则见 [Context](./context.md)。
