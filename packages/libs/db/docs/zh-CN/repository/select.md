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

关系 Builder 是不可变的：保留或返回链式调用结果，不依赖原对象被修改。根 Select Builder 回调则必须返回传入的根 Builder。通过同一关系返回记录及统计使用[combine](./aggregates.md)，不是重复 include。

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

继续阅读：[查询](./queries.md)、[聚合](./aggregates.md)、[写入返回值](./mutations.md)。
