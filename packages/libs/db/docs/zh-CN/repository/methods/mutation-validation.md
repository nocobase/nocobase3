---
title: Mutation 能力描述与输入预校验
description: 集中说明 describeMutation 和 validateMutation 的参数、关系能力描述、values 变量校验与不检查数据库实时状态的边界。
---

# Mutation 能力描述与输入预校验

示例沿用[概览的模型](../overview.md#本组文档的示例模型)，假设 `db` 已配置且 Collection 已存在。每个示例独立运行，写入前请按说明准备数据；方法不会创建 Schema。

## 参数与返回

| 方法                     | 输入                                              | 返回                                     |
| ------------------------ | ------------------------------------------------- | ---------------------------------------- |
| describeMutation         | operation: createOne 或 updateOne                 | collection、operation、relations、limits |
| validateMutation（创建） | operation、values，可选 context                   | valid、errors                            |
| validateMutation（更新） | operation、filter、values，可选 ifVersion/context | valid、errors                            |

两者没有 select 参数。describeMutation 没有 context，描述的是元数据能力；未改名为 describeMutationCapabilities 或 validateMutationInput。

```ts
const projects = db.repository('projects');
```

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

## 创建输入变量预校验

```ts
const result = await db.repository('projects').validateMutation({
  operation: 'createOne',
  values: (v) => ({ id: 'validated-1', name: v.variable('$input.name') }),
  context: { input: { name: 'Validated' } },
});
// result: { valid: true, errors: [] }; no record is created.
```

缺失变量时 valid 为 false，errors 包含 VARIABLE_NOT_FOUND 和变量路径。根级与嵌套关系输入使用相同的变量解析规则，见 [Values](../values.md)。预校验可用于生成输入时的反馈，不要求每次执行前都额外调用；执行仍会校验。

## 验证依据

行为覆盖见 [values-variables.test.ts](../../../../tests/integration/repository/values-variables.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
