---
title: Repository Distinct：选择每组代表记录
description: 使用 distinct 字段数组保留每组完整代表行，说明排序、分页执行顺序、关系局部去重和限制。
---

# Repository Distinct：选择每组代表记录

示例沿用[概览](./overview.md)模型；distinct 是 findMany/stream 或关系选择的选项，不是独立 Repository 方法。

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

空数组、重复字段、不稳定或不支持的排序报 INVALID_DISTINCT 或字段能力错误。cursor 组合还需满足[分页规则](./pagination.md)。测试应验证相同字段组合只保留一条完整记录、代表行选取、每父记录独立去重，以及 backward 不改变代表行。

验证依据：[scalar.test.ts](../../../tests/integration/repository/scalar.test.ts)、[identity-features.test.ts](../../../tests/integration/repository/identity-features.test.ts)。
