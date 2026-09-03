---
title: 表单到 Mutation AST 提案
description: 尚未实现的前端大表单编译流程；将 initialValues、values 和 changeSet 转换为 Repository mutation。
---

# 表单到 Mutation AST

> **状态：提案。运行时可用性：未实现。导出 API：无。** 本页只描述动态表单如何生成 [Mutation AST](./mutation-ast.md)。

动态大表单不生成 Fluent 代码，也不把原始表单对象直接交给 Repository。前端 Form
Mutation Compiler 根据字段提交策略生成单记录写入参数：

```text
新建表单 -> CreateOneOptions -> repository.createOne(...)
编辑表单 -> UpdateOneOptions -> repository.updateOne(...)
```

两者的核心输出都是 `{ values, relations: RelationMutationAst }`；编辑表单另外携带
`unique` 和可选 `ifVersion`。`createMany()` 是标量批量创建入口，不承载一张大表单里的
关系树。

## 流程

```text
1. 服务端返回表单 schema、mutation capability；编辑场景直接读取 record，并包含
   Collection 配置的 optimistic lock Field
2. 前端保存 initialValues，并初始化 values；新建场景的 initialValues 是表单默认值
3. 用户编辑，表单记录 dirty/changeSet
4. Form Mutation Compiler 按字段策略生成 CreateOneOptions 或 UpdateOneOptions
5. 前端调用 createOne 或 updateOne，不提交 initialValues
6. 后端按 describe/validate 规则复核，并在事务中按当前数据库状态执行
7. 后端返回 `SingleMutationResult`
8. 前端用 `result.record` 重置 initialValues、values 和 changeSet，并使用
   `result.createdTargets` 回填新建目标 identity
```

`initialValues` 与 `values` 都来自前端，但 `initialValues` 只帮助推导用户意图。它不是后端
可信状态，也不能替代 `ifVersion` 或事务内校验。

新建和编辑不能使用完全相同的 diff 规则：

| 表单模式 | 根 `values`                                                              | relation 编译                                                  |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 新建     | 从当前 `values` 提取所有应提交的标量，包括用户未修改但需要持久化的默认值 | 从当前关系值和显式新建行生成 create-safe 的 `set` / `patch`    |
| 编辑     | 根据 `initialValues`、当前 `values` 和 changeSet 只提取实际变化的标量    | 完整字段生成 `set` / `clear` / `replace`，局部动作生成 `patch` |

因此，“比较 `initialValues` 和 `values`”主要是编辑表单的语义。新建表单如果只提交 diff，
可能漏掉已经显示在表单里、但用户没有手动触碰的默认值。

## 字段提交策略

表单 schema 必须声明字段语义，编译器不能只靠值的形状猜测：

| 字段类型              | 提交策略   | AST                                           |
| --------------------- | ---------- | --------------------------------------------- |
| 普通标量              | 按表单模式 | 新建提交应保存值；编辑只提交实际变化          |
| to-one selector       | `set`      | identity 改变生成 `set`，主动清空生成 `clear` |
| 完整 to-many selector | `replace`  | 当前完整列表生成 `replace.targets`            |
| 局部 relation action  | `patch`    | 显式生成 connect/create/disconnect            |
| 新建关联子表行        | `create`   | `patch.create`，行内关系可以递归编译          |

编辑场景中未 dirty 字段不产生 mutation；新建场景则按表单提交策略保留应持久化的默认值。
显示名称、头像、计算值和 UI 临时状态不参与 relation identity 比较。

## 示例

初始快照：

```ts
const initialValues = {
  title: 'Old title',
  customer: { id: 'customer-1', name: 'Alice' },
  tags: [
    { id: 'tag-1', name: 'Backend' },
    { id: 'tag-2', name: 'Old tag' },
  ],
};
```

当前值和 changeSet：

```ts
const values = {
  title: 'New title',
  customer: { id: 'customer-2', name: 'Bob' },
  tags: [
    { id: 'tag-1', name: 'Backend' },
    { id: 'tag-3', name: 'Database' },
  ],
};

const changeSet = {
  dirtyFields: ['title', 'customer', 'tags'],
  completeRelations: ['tags'],
};
```

编译结果：

```json
{
  "values": {
    "title": "New title"
  },
  "relations": {
    "kind": "relationMutation",
    "version": 1,
    "items": [
      {
        "kind": "relation",
        "field": "customer",
        "action": "set",
        "target": {
          "kind": "connect",
          "by": {
            "kind": "unique",
            "fields": ["id"],
            "values": { "id": "customer-2" }
          }
        }
      },
      {
        "kind": "relation",
        "field": "tags",
        "action": "replace",
        "targets": [
          {
            "kind": "connect",
            "by": {
              "kind": "unique",
              "fields": ["id"],
              "values": { "id": "tag-1" }
            }
          },
          {
            "kind": "connect",
            "by": {
              "kind": "unique",
              "fields": ["id"],
              "values": { "id": "tag-3" }
            }
          }
        ]
      }
    ]
  }
}
```

多选字段生成 `replace`，让 Repository 在事务内相对于数据库当前集合计算真实差异；前端
不需要把初始 `[tag-1, tag-2]` 自行换算成 connect/disconnect。

## 新建子表和多层关系

新建订单明细可以包含下一层产品关系：

```ts
{
  state: 'new',
  clientKey: 'item-local-1',
  values: {
    quantity: 2,
    product: { id: 'product-1', name: 'Keyboard' },
  },
}
```

编译器生成 `patch.create`，再把 `product` 编译到该 CreateTarget 的嵌套 `relations`。持久化
记录只通过唯一 selector 识别；新行必须使用稳定 `clientKey`，不能使用数组下标。

V1 不把已有子表行的字段变化编译成嵌套 target update。目标记录更新应单独调用目标
Collection Repository；如果大表单必须原子更新多个已有实体，应在扩展 V1 前单独设计
compound mutation，而不是把行为隐藏进 relation connect。

## 完整性与并发

只有完整加载的关系列表才能生成 `replace`。如果列表分页、懒加载或被调用边界裁剪，必须
标记为不完整，并且只根据显式 changeSet 生成 `patch`。编译器不能把当前可见的部分列表
当作最终全集。

前端提交的 `ifVersion` 用于检测根记录并发变化。Collection 必须显式配置 increment
optimistic lock；Repository 不猜测版本 Field。`replace` 在一个事务中锁定根记录、比较
`ifVersion`、读取当前关系、计算并应用差异，然后递增根版本并回读结果。任何成功的关系
mutation 都推进根版本，因此 V1 不需要独立 relation revision。版本冲突返回
`VERSION_CONFLICT`，记录不存在返回 `RECORD_NOT_FOUND`。

编辑页初次加载使用普通 read 方法，因此没有额外 read envelope；调用边界应在 Select AST
中包含 Collection 配置的版本 Field，并把该值作为下一次 mutation 的 `ifVersion`。成功写入
后则直接使用 `SingleMutationResult.version` 更新基线版本。

Repository V1 不执行 policy。可信调用边界必须在调用 Repository 前完成授权；后端仍需在
事务中根据数据库当前状态重新确认 source、target 和当前关系。

## 错误映射

Form Mutation Compiler 应保存表单 path 到 AST path 的 source map。例如：

```text
form: items[item-local-1].product
AST:  relations.items[1].create[0].relations.items[0].target.by
```

后端返回结构化 AST 错误后，前端使用该映射把错误定位到具体字段或子表行。创建成功后，
Repository 返回 `SingleMutationResult`；前端用 `result.createdTargets` 中的 `clientKey`、
目标 Collection 和 `UniqueSelector` 回填新行，再用 `result.record` 重置表单基线，并保存
`result.version` 供下一次编辑提交。

## Agent 注意事项

- 表单 compiler 和 Repository 是两个边界；Repository 不理解 dirty、控件或 UI 展示值。
- `initialValues` 默认留在前端，只提交编译后的 mutation 和版本。
- 完整状态字段使用 `replace`，局部动作使用 `patch`。
- 未 dirty 字段不生成 mutation；空值不能自动解释为清空。
- 部分加载列表不得生成 `replace`。
- V1 只递归编译新建行中的 connect/create，不递归更新或删除已有目标。
