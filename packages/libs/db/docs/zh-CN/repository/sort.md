---
title: Repository Sort
description: 使用 Repository Sort Builder 和 JSON AST 按字段、to-one 关系路径或 to-many 聚合排序，明确 NULL 顺序、主键决胜项及分页和去重的组合限制。
---

# Repository Sort

`sort` 决定结果顺序，接受 Builder 回调或 Sort AST。字段名是 Collection 逻辑名称，不是数据库列名。示例沿用 [Overview](./overview.md) 模型，假定 `db` 已配置。

## 单字段与多字段

```ts
const records = await db.repository('projects').findMany({
  sort: (sort) => [
    sort.field('status').asc(),
    sort.field('name').desc().nullsLast(),
    sort.field('id').asc(),
  ],
  select: (select) => select.fields('id', 'name', 'status'),
});
```

数组从前到后确定排序优先级。单个表达式可以直接返回 `sort.field('id').asc()`。方向必须调用 `.asc()` 或 `.desc()`；NULL 位置在方向后调用 `.nullsFirst()`／`.nullsLast()`。

当前没有 `sort: { name: 'asc' }`、`sort: ['name']` 或 `'-name'` 简写，也不需要 `.build()`。

## JSON AST

```ts
import type { SortAst } from '@nocobase/db';

const sort: SortAst = {
  kind: 'sort',
  version: 1,
  collection: 'projects',
  items: [
    { kind: 'field', path: ['status'], direction: 'asc' },
    { kind: 'field', path: ['name'], direction: 'desc', nulls: 'last' },
    { kind: 'field', path: ['id'], direction: 'asc' },
  ],
};
const records = await db.repository('projects').findMany({ sort });
```

`collection` 可省略；提供时必须匹配当前 Repository。`nulls` 使用 `'first' | 'last'`，不是 `nullsLast: true`。重复排序同一个字段或同一个关系聚合会报 `INVALID_SORT`，即使方向不同也不能重复。

## 关系字段与聚合排序

```ts
const records = await db.repository('projects').findMany({
  sort: (sort) => [
    sort.field('owner.name').asc().nullsLast(),
    sort.relation('tasks').count().desc(),
    sort.relation('tasks').max('priority').desc().nullsLast(),
    sort.field('id').asc(),
  ],
});
```

- `.field('owner.name')` 或 `.field(['owner', 'name'])` 只能沿 belongsTo／hasOne 路径访问最终标量字段。
- 不支持 `.field('tasks.priority')` 直接穿过 to-many。需显式使用 `.relation('tasks').max('priority')` 等聚合。
- 关系聚合支持 `count / sum / avg / min / max`；`count()` 不接受字段，sum／avg 要求数值字段，min／max 要求可排序字段。
- 聚合关系路径可先经过若干 to-one 关系，最后必须是一个 to-many 关系。
- 排序不会自动把关系或聚合值加入返回结果。需要返回这些数据时，另配 [Select](./select.md) 或[关系聚合](./aggregates.md)。
- 当前关系聚合 Sort 没有局部 Filter 参数；不要认为 include 分支中的 Filter 会改变根排序聚合范围。

对应聚合 AST 节点：

```ts
import type { SortAst } from '@nocobase/db';

const sort: SortAst = {
  kind: 'sort',
  version: 1,
  items: [
    {
      kind: 'aggregate',
      relation: ['tasks'],
      aggregate: 'max',
      field: 'priority',
      direction: 'desc',
      nulls: 'last',
    },
    { kind: 'field', path: ['id'], direction: 'asc' },
  ],
};
const records = await db.repository('projects').findMany({ sort });
```

count 节点使用 `aggregate: 'count'` 且省略 `field`。

## 默认排序、NULL 与稳定性

有主键时，省略 sort 默认使用所有主键字段升序。提供 sort 但直接字段未包含一组完整主键／唯一约束时，Repository 会追加缺失主键字段升序，使同值记录具备稳定顺序。若 Collection 没有相应约束，不能凭空保证唯一排序。

未指定 `nulls` 时沿用数据库默认规则；需要跨数据库一致的 NULL 位置，应显式指定。`nullsLast()` 只控制位置，不会让 nullable 字段变成合法 Cursor 轴。

可排序标量包括数值、string、uuid、boolean、date、datetime、time；当前 text 和 JSON 不可排序，违反字段能力报 `FIELD_CAPABILITY_NOT_SUPPORTED`。

## 与其他能力组合

| 使用位置                   | 约束                                                  |
| -------------------------- | ----------------------------------------------------- |
| 普通 `findMany`／`findOne` | 支持字段、关系路径、关系聚合排序                      |
| to-many include            | 在目标 Collection 上解析局部 sort，不改变父记录顺序   |
| to-one include             | 不接受关系局部非空 sort                               |
| Cursor                     | 仅非空、不可空的直接标量字段排序，须有唯一决胜项      |
| Distinct                   | 仅直接标量排序，须有唯一决胜项；不接受关系路径／聚合  |
| GroupBy                    | 使用自己的分组结果排序输入，见[聚合](./aggregates.md) |

Cursor 和 Distinct 的完整规则见[分页与去重](./pagination.md)。

## 验证清单

- 构造相同排序值，验证主键决胜顺序。
- 构造 NULL、无 owner、零条 tasks，验证显式 NULL 位置。
- 验证关系聚合排序和返回聚合分别配置，互不隐式影响。
- 覆盖非法 to-many 字段路径、重复目标和不支持的字段类型。
