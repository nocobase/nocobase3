---
title: Repository Context：变量解析上下文
description: 说明 context 在 Filter、根级与嵌套 Values 和返回 Select 中的使用、路径规则、预校验和嵌套关系支持边界。
---

# Repository Context：变量解析上下文

context 是当前调用的变量数据，类型为只读键值对象。Repository 不把它解释为事务、请求对象或自动授权规则。

## 同一次调用的 Filter、Values 与 Select

下例假定[示例模型](./overview.md#本组文档的示例模型)中 project-1 已存在：

```ts
const result = await db.repository('projects').updateOne({
  filter: (f) => f.string('id').eq(f.variable('$input.code')),
  values: (v) => ({ name: v.variable('$input.name') }),
  select: (s) =>
    s
      .fields('id', 'name')
      .include('tasks', (tasks) =>
        tasks
          .fields('id', 'title')
          .filter((f) => f.string('status').eq(f.variable('$taskStatus'))),
      ),
  context: {
    input: { code: 'project-1', name: 'Updated' },
    taskStatus: 'open',
  },
});
```

根 Filter 定位项目，Values 修改 name，Select 中的 Filter 只限制返回 tasks。context 中未引用的值不会自动写入或成为筛选条件。

## 方法覆盖

| 方法                                 | 用途                                             |
| ------------------------------------ | ------------------------------------------------ |
| findOne/findMany/count/exists/stream | 查询条件及适用的返回关系 Filter                  |
| aggregate/groupBy                    | 根 Filter、适用的 having                         |
| createOne/createMany                 | Values 变量和返回 Select 的关系 Filter           |
| updateOne/updateMany/upsertOne       | 根级与嵌套 Filter、Values／分支变量、返回 Select |
| deleteOne/deleteMany                 | 根 Filter 和返回 Select                          |
| validateMutation                     | createOne/updateOne 输入预校验                   |
| describeMutation                     | 不接收 context，描述元数据能力                   |

关系 mutation 内部的 Filter、嵌套 values／selector／through 变量与返回 Select 的多层关系 Filter 共用顶层 context。createMany/updateMany 仍不支持嵌套关系写入；变量能力不扩大各方法允许的操作范围。

## 路径与 JSON

```json
{
  "kind": "variable",
  "path": "$actor.accountCode"
}
```

上面节点对应 `context: { actor: { accountCode: 'USER-A' } }`。路径按点分段读取自有属性，不执行 JavaScript、模板或表达式，不访问原型链。不要传整个 request 或把客户端提供的 actor 当成可信身份；调用层负责认证和授权。

- Filter 使用 `f.variable(path)`，Values 使用 `v.variable(path)`；两者 JSON 节点相同。
- Values 的缺失／undefined 变量报 VARIABLE_NOT_FOUND，非法路径报 INVALID_CONTEXT，字段类型不符报 INVALID_MUTATION；Filter 值仍按自身规则报 INVALID_FILTER 等错误。
- JSON 数据内部不递归插值；Values 的字面量消歧见 [Values](./values.md#变量与-literal)。
- 每次调用显式传 context，不继承上一次调用的值；同一输入模板可在不同 context 下复用。
- 不支持变量替换字段名、操作名或整个 mutation 结构。

## 事务

```ts
await db.transaction(async (connection) => {
  await connection.repository('projects').createOne({
    values: (v) => ({ id: 'context-created', name: v.variable('$name') }),
    context: { name: 'Created in transaction' },
  });
});
```

事务来自回调 Connection；context 仍仅提供变量。失败传播规则见[事务](./transactions.md)。

验证依据：[创建返回上下文](../../../tests/integration/repository/create-context.test.ts)、[Values 变量](../../../tests/integration/repository/values-variables.test.ts)。
