---
title: Repository 分页与去重
description: 使用 limit、offset、双向 Cursor 和 distinct 分页读取 Repository 记录，明确稳定排序、排他边界、关系局部页面及去重代表行的选择规则。
---

# Repository 分页与去重

根查询使用 `findMany()` 的分页选项；to-many 关系使用 Select 的局部选项。两者返回普通记录数组，没有自动的 `pageInfo / total / nextCursor` 包装。

示例沿用 [Overview](./overview.md) 模型。Cursor 示例要求 `projects.id`、`tasks.id` 在字段定义中明确 `nullable: false`，`db` 已配置。

## limit 与 offset

```ts
const records = await db.repository('projects').findMany({
  sort: (sort) => sort.field('id').asc(),
  limit: 20,
  offset: 40,
});
```

`limit`、`offset` 必须是非负安全整数，`limit: 0` 返回空数组。offset 需要非空排序；有主键时默认排序可满足此要求，示例仍建议显式列出排序。

offset 表示跳过多少条，不是页码。并发增删可能导致跨页重复或遗漏；按排序边界继续读取时使用 Cursor。

## Cursor 是排序值边界，不是记录定位器

```ts
const records = await db.repository('projects').findMany({
  sort: (sort) => sort.field('id').asc(),
  cursor: { id: 'project-100' },
  limit: 20,
});
```

默认方向为 forward。Cursor 是排他边界，以上返回 `id` 排序在 `project-100` 之后的记录，不包含边界值。它按给定值构造排序比较，不要求边界对应的记录仍存在。

当前规则：

- 必须显式提供非空 `sort`；不能只依靠默认排序。
- 排序只允许当前 Collection 的直接标量字段，不支持关系路径、关系聚合。
- 每个排序字段必须在元数据中明确 `nullable: false`，即使此次查询没有 NULL 数据也不能放宽。
- 排序必须包含一组完整主键或唯一约束作为决胜项。普通排序会自动追加主键；cursor 必须包含追加后的每个字段。
- Cursor 键必须恰好对应最终排序字段，不能缺失、多余或包含 null／undefined。
- Cursor 与 offset 互斥，可与 filter、select、limit、distinct 组合。

例如显式按 `name` 排序但缺少唯一键时，最终排序可能是 `name ASC, id ASC`；此时只传 `{ name: 'Repository' }` 不够。建议直接把 `id` 写入 sort，并从返回记录取完整边界值。name 若可空，则不能用于 Cursor。

## 反向分页

```ts
const records = await db.repository('projects').findMany({
  sort: (sort) => sort.field('id').asc(),
  cursor: { id: 'project-100' },
  direction: 'backward',
  limit: 20,
});
```

backward 取边界之前最近的一页，**返回数组仍保持调用者原来的 sort 顺序**。它不是简单把最终结果倒序。

以升序序列 A、B、C、D、E、F，cursor 为 D、limit 为 2：

| direction        | 返回 |
| ---------------- | ---- |
| 省略或 `forward` | E、F |
| `backward`       | B、C |

继续向前取下一页通常使用当前页最后一条；向后取上一页通常使用当前页第一条。只提取 sort 轴，不要把含其他字段的整条记录当 cursor。无更多记录时返回 `[]`；如需判断还有一页，可请求页面大小加一，并自行截取，注意 backward 时应保留靠近边界的记录。

显式 `direction` 必须伴随 cursor，第一页省略两者。Streaming 不支持 backward，见 [Streaming](./streaming.md)。

## 关系局部分页

```ts
const records = await db.repository('projects').findMany({
  select: (select) =>
    select.fields('id', 'name').include('tasks', (tasks) =>
      tasks
        .fields('id', 'title')
        .filter({ status: 'open' })
        .sort((sort) => sort.field('id').asc())
        .cursor({ id: 'task-100' })
        .direction('backward')
        .limit(10),
    ),
});
```

每个项目最多返回 10 条满足条件的 tasks，而不是所有项目共享 10 条。根列表分页和关系分页互不替代。

- 仅 hasMany／belongsToMany 支持局部 limit、cursor；belongsTo／hasOne 会拒绝。
- 局部 Cursor 沿用完整排序轴、不可空字段和唯一顺序规则。
- 一个固定 Cursor 应用于所有父记录；当前没有 `cursorByParent` 或关系局部 offset。
- 关系仍按父记录集合批量加载，普通记录 include 当前会在批量查询后按父记录切分 limit。因此不能把 `limit(10)` 理解为数据库一定只读取每父记录 10 行；大关系集应评估内存和数据量。
- `combine()` 每个分支独立分页，见[聚合](./aggregates.md)。

## distinct：每组保留一条记录

```ts
const records = await db.repository('projects').findMany({
  distinct: ['country', 'role'],
  sort: (sort) => sort.field('id').asc(),
  select: (select) => select.fields('id', 'country', 'role', 'name'),
  limit: 20,
});
```

具有相同 country、role 组合的记录只保留一条，按 sort 选中的第一条作为代表。本例选择每组 id 最小的记录，仍可读取 name 等不在 distinct 中的字段。它不是仅返回 distinct 字段的投影，也不是 groupBy。

处理语义是：**Filter → 按 distinct 分组并按原 sort 选代表行 → Cursor → 排序和分页 → 返回所选数据**。反向分页只改变翻页方向，不改变每组的代表行。

约束：

- distinct 为非空、无重复的根级字段数组，字段必须具备可排序标量能力；不支持 JSON、text、关系路径。
- sort 只允许直接标量字段，并包含一组完整主键／唯一约束。有主键时，默认排序可用于去重；建议显式填写以表达代表行选择意图。
- distinct 字段不要求与 select 或 sort 完全一致。
- distinct 可与 offset 或 Cursor 分别组合；Cursor 仍有更严格的不可空要求。
- 不支持 PostgreSQL 专属 `distinctOn`，也不支持 `count({ distinct: ... })`。

关系局部去重使用同一写法的 Builder 方法：

```ts
const records = await db.repository('projects').findMany({
  select: (select) =>
    select.fields('id').include('tasks', (tasks) =>
      tasks
        .fields('id', 'status', 'title')
        .sort((sort) => sort.field('id').asc())
        .distinct(['status'])
        .limit(5),
    ),
});
```

每个项目分别去重，再应用该父记录的局部页面；不是跨所有项目去重。

## 错误与验证

| 错误                             | 优先检查                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `INVALID_PAGINATION`             | 负数／非整数、缺 sort、nullable Cursor 轴、cursor 键不完整、cursor 与 offset 同用、to-one 分页 |
| `INVALID_DISTINCT`               | 空数组、重复字段、不稳定排序、关系排序                                                         |
| `FIELD_CAPABILITY_NOT_SUPPORTED` | 不支持排序或去重的字段类型                                                                     |

测试应覆盖首尾页、空页、重复排序值、已删除的边界记录、forward／backward 相邻页、每父记录独立 limit，以及 distinct 代表行在翻页前后保持一致。分页本身不提供跨请求快照；如果排序字段在分页过程中被修改，仍可能出现结果移动。

参见 [Sort](./sort.md)、[Select](./select.md) 和 [API reference](../reference/repository-api.md)。
