---
title: upsertOne：按唯一条件创建或更新
description: 用完整唯一等值条件选择 upsert 分支，说明 create/update、上下文变量、乐观锁与分支预校验。
---

# upsertOne：按唯一条件创建或更新

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

- 必填：`filter / create / update`。
- 可选：`ifVersion / select / context`。
- 返回：`{ record, createdTargets, version? }`，不包含 created 分支标记。

## 按唯一条件创建或更新

```ts
const projects = db.repository('projects');
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

## 两个分支的变量

```ts
const result = await db.repository('projects').upsertOne({
  filter: (f) => f.string('id').eq(f.variable('$input.code')),
  create: (v) => ({
    id: v.variable('$input.code'),
    name: v.variable('$input.name'),
  }),
  update: (v) => ({ name: v.variable('$input.name') }),
  context: { input: { code: 'project-upsert', name: 'Imported' } },
  select: (s) => s.fields('id', 'name'),
});
// result.record: { id: 'project-upsert', name: 'Imported' }
```

该键不存在时创建，存在时更新。两个分支的输入和变量都预先解析校验；不能在未执行分支放入缺失变量。ifVersion 仅约束更新分支。

唯一条件必须完整对应一个主键或唯一约束；复合唯一键须包含全部字段。当前不支持把任意额外条件与唯一条件混合当作 Prisma WhereUniqueInput 使用。不存在 upsertMany，也不承诺遇到并发唯一冲突时自动重试。

## 验证依据

行为覆盖见 [scalar.test.ts](../../../../tests/integration/repository/scalar.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
