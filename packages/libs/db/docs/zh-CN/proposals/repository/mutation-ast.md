---
title: Mutation AST 提案
description: Repository 关系写入 V1 协议、Fluent Builder、有界嵌套和 Agent 工作流。
---

# Mutation AST

> **状态：运行时已实现。** Relation Mutation Builder/AST、模型形状 `values`、目标
> `update/upsert/delete`、事务内最终回读、`createdTargets`、有界嵌套、能力描述/校验与
> optimistic lock 均可执行。

Mutation AST 是 Repository 关系写入的内部规范化协议，覆盖三类问题：

- 连接、断开或替换关系；
- 创建目标记录并立即连接。
- 在当前关系作用域内更新、upsert 或删除一个目标。

更新 `belongsToMany` 中间表 payload 和隐式重新分配关系仍不属于当前协议。

公开输入把根标量和关系操作放在同一个模型形状的 `values` 中；Repository 内部再归一化为
Relation Mutation AST：

```ts
await db.repository('projects').updateOne({
  filter: (filter) => filter.string('id').eq('project-1'),
  values: {
    name: 'NocoBase v3',
    owner: { connect: { id: 'user-1' } },
  },
});
```

Repository 根据 Collection metadata 区分标量和 relation Field，不根据输入对象形状猜测。
因此标量 JSON Field 中的 `connect` 等同名 key 仍是普通 JSON 数据。

## 设计目标

- 可序列化：HTTP、CLI、Agent tool 和表单编译都可提交模型形状的纯 JSON `values`。
- 选择少：Agent 只需区分 to-one/to-many、existing/new 和字段级操作。
- 无歧义：清空和省略、断开和删除、增量修改和完整替换具有不同结构。
- 可发现：Agent 可以先查询当前 Collection 允许的 action、唯一约束和预算。
- 可校验：执行前根据 Collection 和数据库当前状态验证整棵 AST。
- 可修复：错误包含稳定 code、AST path 和允许值。
- 适合重试：除 `CreateTarget` 外的 V1 action 使用幂等的目标状态语义。
- 原子执行：根、目标和关系边写入共享同一事务。
- 有界递归：数据结构支持嵌套 create，但执行受深度和节点预算限制。

## V1 词汇

V1 只保留以下 action：

| 作用域  | action    | 语义                                                |
| ------- | --------- | --------------------------------------------------- |
| to-one  | `set`     | 设置为已有目标，或创建目标后设置                    |
| to-one  | `clear`   | 解除关系但保留目标记录                              |
| to-many | `patch`   | 增量 connect/create/disconnect/update/upsert/delete |
| to-many | `replace` | 将完整关系集合替换为提交集合                        |
| to-one  | `modify`  | update、upsert 或 delete 当前唯一关系目标           |

To-many 的子操作只有：

| 子操作       | 语义                                   |
| ------------ | -------------------------------------- |
| `connect`    | 连接已有目标                           |
| `create`     | 创建目标并连接                         |
| `disconnect` | 解除关系但保留目标                     |
| `update`     | 更新关系作用域内恰好一个目标           |
| `upsert`     | 唯一目标存在则更新，不存在则创建并连接 |
| `delete`     | 删除关系作用域内恰好一个目标           |

V1 不使用“新增关系数据”“重置关系数据”之类可能混淆目标记录和关系边的术语。

## Repository 入口

关系写入只用于单记录 mutation：

```ts
interface CreateOneOptions<TCreate extends object> {
  values: CreateMutationValues<TCreate>;
  select?: SelectAst;
}

type UpdateOneOptions<TRecord extends object, TUpdate extends object> = {
  filter: RepositoryFilter<TRecord>;
  select?: SelectAst;
  ifVersion?: string | number;
  values: UpdateMutationValues<TUpdate>;
};
```

`createOne()` 和 `updateOne()` 在 `values` 的 relation Field 中使用 Fluent Builder 或纯 JSON
操作对象；两者都会归一化为同一内部 AST。

批量 `createMany()` 和 `updateMany()` 不接受 `relations`。否则同一个 target 应被所有
source 共享还是为每条 source 分别创建、to-one 应关联哪条 source 等行为都不明确。
它们在 V1 只处理根记录的直接标量字段；关系写入必须拆成可明确定位 source 的
`createOne()` 或 `updateOne()`。

`deleteOne()` 和 `deleteMany()` 也不接受 `relations`；删除时的限制和级联行为由 Collection
与数据库约束决定，不通过 Mutation AST 临时指定。

单记录写入统一返回明确的 mutation envelope：

```ts
interface CreatedTargetReference {
  clientKey: string;
  // Logical Collection name; unique also contains logical Field names.
  collection: string;
  unique: UniqueSelector;
}

interface SingleMutationResult<TResult> {
  record: TResult;
  createdTargets: readonly CreatedTargetReference[];
  version?: string | number;
}
```

`createOne()` 和 `updateOne()` 返回 `SingleMutationResult`。`select` 只决定 `record` 的形状；
`createdTargets` 始终存在，没有 nested create 时为空数组；Collection 启用 optimistic lock
时，`version` 返回根记录的最新版本。读方法直接返回记录、数字或布尔值，不使用这个
envelope。

`createdTargets` 只包含显式提供 `clientKey` 的 CreateTarget，并按 AST 深度优先顺序返回。
同一 mutation tree 中的 `clientKey` 必须唯一；每个成功创建的 key 恰好对应一个结果项。
未提供 `clientKey` 的目标仍会创建，但不出现在该数组中。批量 mutation 始终返回各自的
count object；显式提供 `select` 时还返回 `records`，但批量 values 仍不接受 relation
mutation。

## 内部 TypeScript 结构（节选）

```ts
export interface RelationMutationAst {
  kind: 'relationMutation';
  version: 1;
  collection?: string;
  items: readonly RelationMutationNode[];
}

export interface UniqueSelector {
  kind: 'unique';
  fields: readonly string[];
  values: Readonly<Record<string, unknown>>;
}

export type RelationMutationNode =
  | RelationSetNode
  | RelationClearNode
  | RelationPatchNode
  | RelationReplaceNode
  | RelationModifyNode;

export interface RelationSetNode {
  kind: 'relation';
  field: string;
  action: 'set';
  target: ConnectTarget | CreateTarget;
}

export interface RelationClearNode {
  kind: 'relation';
  field: string;
  action: 'clear';
}

export interface RelationPatchNode {
  kind: 'relation';
  field: string;
  action: 'patch';
  connect?: readonly ConnectTarget[];
  create?: readonly CreateTarget[];
  disconnect?: readonly UniqueSelector[];
  update?: readonly RelationUpdateTarget[];
  upsert?: readonly RelationUpsertTarget[];
  delete?: readonly RelationDeleteTarget[];
}

export interface RelationModifyNode {
  kind: 'relation';
  field: string;
  action: 'modify';
  update?: RelationUpdateTarget;
  upsert?: RelationUpsertTarget;
  delete?: RelationDeleteTarget;
}

export interface RelationReplaceNode {
  kind: 'relation';
  field: string;
  action: 'replace';
  targets: readonly (ConnectTarget | CreateTarget)[];
}

export interface ConnectTarget {
  kind: 'connect';
  by: UniqueSelector;
}

export interface CreateTarget {
  kind: 'create';
  clientKey?: string;
  values: Readonly<Record<string, unknown>>;
  relations?: RelationMutationAst;
}

export interface RelationUpdateTarget {
  filter?: FilterAst;
  values: Readonly<Record<string, unknown>>;
  relations?: RelationMutationAst;
}
```

`CreateTarget` 和 `RelationUpdateTarget` 可以继续携带内部 `relations`。公开输入仍在嵌套目标
的模型形状 `values` 中表达关系字段，Repository 递归拆分后生成这些内部节点。这为订单 →
明细 → 产品等大表单保留递归能力，同时避免 V1 成为调用方可任意编排的 mutation graph。

正式类型应根据静态 Collection schema 推导 relation 字段和目标创建类型。动态 Repository
退化为通用记录，并在运行时完成同样的 metadata 校验。

## 唯一选择器与目标 filter

`connect`、`disconnect` 和 `set` 的已有目标通过与主键或唯一约束完全匹配的逻辑 Field 集合
定位，不能把数据库物理 constraint/index name 放进 Repository 输入：

```json
{
  "kind": "unique",
  "fields": ["id"],
  "values": {
    "id": "user-1"
  }
}
```

复合唯一约束必须完整提供全部字段：

```json
{
  "kind": "unique",
  "fields": ["tenantId", "email"],
  "values": {
    "tenantId": "tenant-1",
    "email": "alice@example.com"
  }
}
```

`fields` 和 `values` 的 key 必须完全一致，并且该 Field 集合必须与 Collection 中一个主键
或唯一约束完全匹配。Repository 按 Collection constraint 中的 Field 顺序规范化 `fields`，
但不暴露该约束的物理名称。规范 AST 不接受裸 ID；静态 Fluent Builder 可以把
`connect({ id })` 规范化成主键 selector。

目标 `update/delete` 使用 Filter AST，并要求在当前 relation scope 内恰好匹配一条；to-many
必须显式提供 filter，to-one 可以省略。`upsert.filter` 还必须等价于一个主键或唯一约束，
其 `create` 分支必须携带相同的唯一字段值。

## Action 语义

### To-one：`set` 和 `clear`

连接已有目标：

```json
{
  "kind": "relation",
  "field": "customer",
  "action": "set",
  "target": {
    "kind": "connect",
    "by": {
      "kind": "unique",
      "fields": ["id"],
      "values": { "id": "customer-1" }
    }
  }
}
```

创建目标并设置关系：

```json
{
  "kind": "relation",
  "field": "customer",
  "action": "set",
  "target": {
    "kind": "create",
    "clientKey": "new-customer-1",
    "values": {
      "name": "Alice"
    }
  }
}
```

无论原来为空、指向其他目标还是已经指向该目标，`set` 都声明同一个最终状态。

清空使用显式 action：

```json
{
  "kind": "relation",
  "field": "customer",
  "action": "clear"
}
```

省略节点表示不修改。`clear` 表示解除关系，不删除 customer；不可空关系应在执行前报错。

### To-many：`patch`

`patch` 表示增量修改：

```json
{
  "kind": "relation",
  "field": "tags",
  "action": "patch",
  "connect": [
    {
      "kind": "connect",
      "by": {
        "kind": "unique",
        "fields": ["id"],
        "values": { "id": "tag-new" }
      }
    }
  ],
  "create": [
    {
      "kind": "create",
      "clientKey": "new-tag-1",
      "values": { "name": "New tag" }
    }
  ],
  "disconnect": [
    {
      "kind": "unique",
      "fields": ["id"],
      "values": { "id": "tag-old" }
    }
  ]
}
```

没有提到的现有关系保持不变。`disconnect` 只删除关系边，不删除目标记录。

### To-many：`replace`

`replace` 表示提交完整最终集合：

```json
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
      "kind": "create",
      "clientKey": "new-tag-1",
      "values": { "name": "New tag" }
    }
  ]
}
```

未列出的已有关系会被解除。清空全部关系必须显式提交空集合：

```json
{
  "kind": "relation",
  "field": "tags",
  "action": "replace",
  "targets": []
}
```

公开输入中，大表单的完整多选器生成字段级 `set`，Repository 将其规范化为内部 `replace`；
“添加一个标签”或“移除一个成员”等局部动作生成字段级 `connect/disconnect`，再规范化为
内部 `patch`。

## 有界嵌套关系

AST 结构支持在新建目标内继续创建或连接关系：

```json
{
  "kind": "relation",
  "field": "items",
  "action": "patch",
  "create": [
    {
      "kind": "create",
      "clientKey": "item-local-1",
      "values": {
        "quantity": 2
      },
      "relations": {
        "kind": "relationMutation",
        "version": 1,
        "items": [
          {
            "kind": "relation",
            "field": "product",
            "action": "set",
            "target": {
              "kind": "connect",
              "by": {
                "kind": "unique",
                "fields": ["id"],
                "values": { "id": "product-1" }
              }
            }
          }
        ]
      }
    }
  ]
}
```

每层内部 `relations` 都相对于当前新建目标的 Collection 解析，不使用 `items.product` 之类
的 dot path。新建 source 的嵌套节点只使用 create 场景能力：

- to-one `set.connect` / `set.create`；
- to-many `patch.connect` / `patch.create`。

新建 source 的嵌套中不允许 `clear`、`disconnect`、`replace`、update 或 delete，因为它没有
旧关系；关系目标 `update/upsert` 的 `values` 则按 update 场景递归规范化。默认预算为
`maxDepth: 3`、`maxNodes: 100`，实际值由服务端配置。Planner 必须检测循环和预算超限。

V1 将新记录关系限制为一棵树。`clientKey` 只用于错误和结果映射，不能从其他分支引用刚
创建的节点；因此不会形成调用方定义的任意有向图。

## Fluent Builder

手写 TypeScript 可以用 Fluent Builder 构造同一 AST：

```ts
await db.repository('orders').createOne({
  values: {
    orderNo: 'SO-001',
    customer: (customer) => customer.connect({ id: 'customer-1' }),
    items: (items) =>
      items.create(
        {
          quantity: 2,
          product: (product) => product.connect({ id: 'product-1' }),
        },
        { clientKey: 'item-local-1' },
      ),
    tags: (tags) => tags.connect({ id: 'tag-1' }).create({ name: 'New tag' }),
  },
});
```

`updateOne()` 可以使用：

```ts
await db.repository('projects').updateOne({
  filter: (filter) => filter.string('id').eq('project-1'),
  values: {
    owner: (owner) => owner.connect({ id: 'user-owner' }),
    reviewer: (reviewer) => reviewer.disconnect(),
    members: (members) =>
      members.connect({ id: 'user-new' }).disconnect({ id: 'user-old' }),
    tags: (tags) => tags.set([{ id: 'tag-1' }, { id: 'tag-2' }]),
  },
});
```

Builder 只构造字段操作描述，不执行查询，也不能提供内部 AST 中不存在的另一套关系语义：

```text
model-shaped values + field Builder/JSON -> RelationMutationAst -> validation -> mutation plan
```

## 大表单编译

动态大表单不生成 Fluent 代码。前端 Form Mutation Compiler 直接生成模型形状的纯 JSON
`values`：

```text
服务端 `SingleMutationResult.record` + `version`
  -> 前端 initialValues
  -> 用户编辑得到 values 和 changeSet
  -> Form Mutation Compiler
  -> { filter, values, ifVersion }
  -> Repository validate/execute
  -> 返回 SingleMutationResult
```

基本映射：

| 表单字段              | 编译结果                                          |
| --------------------- | ------------------------------------------------- |
| dirty 标量            | 根 `values`                                       |
| dirty to-one selector | 生成字段级 `connect`，清空生成 `disconnect: true` |
| 完整 to-many selector | 用当前完整值生成字段级 `set`                      |
| 新建关联子表行        | 字段级 `create`，行内 relation 可递归编译         |
| 新加入的已有目标      | 字段级 `connect`                                  |
| 被明确移除的目标      | 字段级 `disconnect`                               |
| 未 dirty 字段         | 不生成 mutation                                   |

`initialValues` 和当前 `values` 通常都留在前端。`initialValues` 只用于编译用户意图，默认
不提交给后端，也不能作为并发依据。后端只接收 mutation 和可选 `ifVersion`，并根据
数据库当前状态重新校验。

只有完整加载的关系集合才能生成字段级 `set`。分页、懒加载或调用边界裁剪后的部分列表只能
根据显式行级 changeSet 生成 `connect/disconnect/create/update/upsert/delete`。更完整的
表单流程见 [表单到 Repository Mutation](./form-mutation.md)。

## Agent 工作流

只提供 AST 结构不足以让 Agent 稳定写入。Repository 边界还应提供发现和预校验能力：

```text
describeMutation -> build model-shaped values -> validateMutation -> execute -> verify result
```

概念接口为：

```ts
interface DescribeMutationOptions {
  operation: 'createOne' | 'updateOne';
}

type ValidateMutationOptions =
  | {
      operation: 'createOne';
      values: CreateMutationValues;
    }
  | {
      operation: 'updateOne';
      filter: RepositoryFilter;
      ifVersion?: string | number;
      context?: RepositoryContext;
      values: UpdateMutationValues;
    };

interface MutationValidationResult {
  valid: boolean;
  errors: readonly MutationValidationError[];
}
```

`describeMutation()` 的 capability 结果由当前 Collection、数据库能力和服务端资源预算
决定。Repository V1 不根据调用者 policy 改写 capability。

`describeMutation({ operation: 'updateOne' })` 至少返回：

```json
{
  "collection": "projects",
  "operation": "updateOne",
  "relations": [
    {
      "field": "owner",
      "cardinality": "one",
      "targetCollection": "users",
      "allowedActions": ["set", "clear", "modify"],
      "modifyOperations": ["update", "upsert", "delete"],
      "uniqueFieldSets": [{ "fields": ["id"], "primary": true }]
    },
    {
      "field": "members",
      "cardinality": "many",
      "targetCollection": "users",
      "allowedActions": ["patch", "replace"],
      "patchOperations": [
        "connect",
        "create",
        "disconnect",
        "update",
        "upsert",
        "delete"
      ]
    }
  ],
  "limits": {
    "maxDepth": 3,
    "maxNodes": 100
  }
}
```

`validateMutation()` 可以检查结构、Collection、唯一约束、冲突和预算，但不能承诺
执行一定成功。目标存在性、当前关系和并发状态仍需在执行事务中重新检查。

错误应包含稳定 code、输入 path、逻辑名称和修复信息：

```json
{
  "code": "RELATION_ACTION_NOT_ALLOWED",
  "path": ["values", "owner", "delete"],
  "collection": "projects",
  "relation": "owner",
  "received": "delete",
  "allowed": ["create", "connect", "disconnect", "update", "upsert"],
  "retryable": false
}
```

## 规范化规则

- 同一 `items` 数组中，每个 relation Field 最多出现一次。
- `patch` 至少包含一个非空操作数组。
- 同一 target 不能同时出现在 `connect` 和 `disconnect`。
- 同一数组中的重复 selector 是输入错误，不能静默去重。
- `replace` 和 `patch` 不能同时作用于同一 relation。
- `connect` 已连接目标、`disconnect` 未连接目标和 `set` 已是目标状态时视为 no-op。
- `replace` 完成后，关系集合必须恰好等于 `targets`。
- 数组顺序不表示数据库执行顺序；Planner 根据依赖生成执行计划。
- 省略 relation 表示不修改；清空必须使用 `clear` 或 `replace.targets: []`。

`hasOne` 或 `hasMany` 目标已经属于其他 source 时，普通 `connect` 返回
`RELATION_REASSIGNMENT_REQUIRED`，不能静默移动目标。

关系的 metadata 也可能进一步缩小 action：不可空外键不能 `clear` / `disconnect`；带有
无默认值必填业务字段的 through Collection 不能使用不携带 edge values 的 V1 `connect`。
这类 `belongsToMany` 应通过 through Collection Repository 创建中间记录，直到后续版本显式
增加 edge mutation。`describeMutation()` 必须只返回当前关系真正可执行的 action。

## 校验与事务执行

```text
values + RelationMutationAst
  -> validate kind/version and operation capabilities
  -> resolve root Collection and relation Fields
  -> validate unique selectors and writable values
  -> validate conflicts, recursion and budgets
  -> build dependency-aware mutation plan
  -> start/reuse one DatabaseConnection transaction
  -> resolve existing targets
  -> execute root, nested target and edge writes
  -> optionally reload through Select AST
  -> commit and return result
```

Repository 的 AST 和逻辑 mutation plan 只保留 Collection、Field 和 Constraint 逻辑名，
不会解析、保存或向下传递物理 identifier。绑定 connection 的数据库 adapter 根据 relation
定义完成 source/target 外键或 through Collection 的物理映射和 quoting。调用方不能提交
物理表列或 through 两侧外键。

Repository V1 不注入或执行 policy。授权必须由可信调用边界在调用 Repository 前完成；
Mutation options 不接受授权上下文。

### Optimistic lock 与 `replace`

需要 optimistic lock 的 Collection 必须显式配置一个直接、非空的 `integer` 或 `bigInt`
Field，并使用 `increment` strategy。Repository 不猜测 `version`、`_version` 或 `updatedAt`。
版本 Field 由 Repository 管理：创建时初始化为 `1`，不能通过普通 `values` 提供或修改；每次成功
的根更新都递增，包括仅包含 relation mutation 的 `updateOne()`。`updateMany()` 也应逐条
递增版本，以使旧客户端失效。V1 不引入独立 relation revision。

`ifVersion` 是可选条件：提供时，Collection 必须启用 optimistic lock；比较必须与 mutation
原子执行。版本不匹配返回稳定的 `VERSION_CONFLICT`，根记录不存在返回
`RECORD_NOT_FOUND`。`deleteOne(ifVersion)` 在删除前比较版本，成功删除后没有新版本。

`replace` 的事务顺序固定为：

```text
start/reuse one bound-connection transaction
  -> lock root/source record with adapter-equivalent semantics
  -> validate ifVersion when provided
  -> read current relation set
  -> compute relation diff
  -> apply target and edge changes
  -> increment root version when optimistic lock is enabled
  -> reload selected record
  -> commit
  -> return SingleMutationResult with the new version
```

根记录锁防止两个 relation mutation 交错执行，optimistic version 用于发现客户端基于旧状态
提交的覆盖；两者目的不同，不能互相替代。具体行锁由 adapter 实现；SQLite 等不支持同等
行锁语义的数据库使用等价的串行化写事务。任何成功的 relation mutation 都推进根版本。
调用方提供 `ifVersion` 时，并发 `replace` 不会静默覆盖旧状态；未提供时仍保证原子和不交错，
但允许串行化后的 last-write-wins。

`createOne()` 和 `updateOne()` 可以接受 Select AST，并在提交事务前重新读取最终记录到
`SingleMutationResult.record`。含 `clientKey` 的 nested create 在 `createdTargets` 中返回
目标 Collection 与真实 `UniqueSelector`，供表单错误和结果回填。
`clientKey` 本身不是幂等键；Agent-facing HTTP 或 workflow 执行入口应为包含 `create` 的
mutation 提供请求级幂等键，避免响应丢失后的重试创建重复记录。

## V1 边界

V1 支持：

- `createOne()` / `updateOne()` 的模型形状 `values` 与字段级 Builder/JSON 双输入；
- `createOne()` 的 relation Field `connect/create`；
- `updateOne()` 的 relation Field `create/connect/disconnect/set/update/upsert/delete`；
- 主键与唯一 Field 集合 selector；
- 只包含 connect/create 的有界 nested create；
- scoped target update/upsert/delete，以及目标 `values` 中的嵌套关系更新；
- 字段级 Builder/JSON 到内部规范 AST 的转换；
- `describeMutation()`、`validateMutation()` 和结构化错误；
- Collection、冲突、并发和资源预算校验；
- 根、嵌套目标和关系边的单事务执行；
- 可选 Select AST 回读和稳定的 `SingleMutationResult`。

V1 暂不支持：

- 批量 `createMany()` / `updateMany()` 的 relation mutation；
- `belongsToMany` edge values/update；中间记录更新使用 through Collection Repository；
- 隐式 reassign / move；
- `connectOrCreate` 或调用方定义的任意 mutation graph；
- 跨 DatabaseConnection 的 relation；
- raw SQL、物理名称或调用方指定执行顺序；
- 把 `null`、空数组、是否有 `id` 等数据形状当作隐式操作。
- Repository policy 注入或授权；授权由可信调用边界负责。

这些限制不封死长期扩展：后续可以增加 `updateEdge`、显式 move 和 connect-or-create，但应
作为独立、可发现的 capability，而不是改变 V1 action 的含义。

## Agent 注意事项

- 本页 V1 接口已实现；标为“暂不支持”的能力仍不能生成或执行。
- 根标量和 relation Field 都放在模型形状 `values` 中。
- To-one 使用 `connect` / `disconnect`，to-many 增量操作使用
  `create/connect/disconnect/update/upsert/delete`，完整状态使用 `set`。
- `connect/disconnect/set` 的已有目标只用与主键或唯一约束匹配的逻辑 Field 集合 selector；
  target update/delete 使用当前关系作用域内必须恰好匹配一条的 `filter`。
- `disconnect` 只解除关系，`delete` 才删除目标。
- Nested create 只允许 connect/create；target update/upsert 的 `values` 可以继续递归关系操作。
- 先调用 `describeMutation`，执行前调用 `validateMutation`，不能猜 relation capability。
- HTTP、CLI、Agent tool 和动态表单使用纯 JSON `values`；字段级 Fluent Builder 只用于手写
  TypeScript，Relation Mutation AST 是 Repository 内部协议。
- 大表单在前端编译 Repository mutation，默认不提交 `initialValues`。
- 不在 AST 中放 raw SQL、物理名称、through 外键或执行顺序。
