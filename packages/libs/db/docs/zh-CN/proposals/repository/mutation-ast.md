---
title: Mutation AST 提案
description: Repository 关系写入 V1 协议、Fluent Builder、有界嵌套和 Agent 工作流。
---

# Mutation AST

> **状态：V1 运行时已实现，正在进行多数据库兼容验证。** Relation Mutation Builder/AST、四类关系写入、事务内最终回读、`createdTargets`、有界 nested create、能力描述/校验与 optimistic lock 均可执行。

Mutation AST 是 Repository 关系写入的规范化协议。V1 只解决两类问题：

- 连接、断开或替换关系；
- 创建目标记录并立即连接。

更新或删除目标实体、更新 `belongsToMany` 中间表记录、重新分配关系和 upsert 不属于 V1。
这些操作先通过目标或中间 Collection 的 Repository 显式完成，以控制 Agent 的选择空间。

根记录标量和关系操作始终分开：

```ts
await db.repository('projects').updateOne({
  unique: {
    kind: 'unique',
    fields: ['id'],
    values: { id: 'project-1' },
  },
  values: {
    name: 'NocoBase v3',
  },
  relations: {
    kind: 'relationMutation',
    version: 1,
    items: [
      {
        kind: 'relation',
        field: 'owner',
        action: 'set',
        target: {
          kind: 'connect',
          by: {
            kind: 'unique',
            fields: ['id'],
            values: { id: 'user-1' },
          },
        },
      },
    ],
  },
});
```

`values` 只接受根 Collection 可写的直接标量字段；`relations` 只接受关系操作。不能根据
嵌套对象是否有 `id`、值是否为 `null` 或数组是否为空猜测写入意图。

## 设计目标

- 可序列化：TypeScript、HTTP、CLI、Agent tool 和表单编译使用同一规范结构。
- 选择少：Agent 只需区分 to-one/to-many、existing/new 和 patch/replace。
- 无歧义：清空和省略、断开和删除、增量修改和完整替换具有不同结构。
- 可发现：Agent 可以先查询当前 Collection 允许的 action、唯一约束和预算。
- 可校验：执行前根据 Collection 和数据库当前状态验证整棵 AST。
- 可修复：错误包含稳定 code、AST path 和允许值。
- 适合重试：除 `CreateTarget` 外的 V1 action 使用幂等的目标状态语义。
- 原子执行：根、目标和关系边写入共享同一事务。
- 有界递归：数据结构支持嵌套 create，但执行受深度和节点预算限制。

## V1 词汇

V1 只保留以下 action：

| 作用域  | action    | 语义                                                 |
| ------- | --------- | ---------------------------------------------------- |
| to-one  | `set`     | 设置为已有目标，或创建目标后设置                     |
| to-one  | `clear`   | 解除关系但保留目标记录                               |
| to-many | `patch`   | 增量 connect/create/disconnect，未提到的关系保持不变 |
| to-many | `replace` | 将完整关系集合替换为提交集合                         |

To-many 的子操作只有：

| 子操作       | 语义               |
| ------------ | ------------------ |
| `connect`    | 连接已有目标       |
| `create`     | 创建目标并连接     |
| `disconnect` | 解除关系但保留目标 |

V1 不使用“新增关系数据”“重置关系数据”之类可能混淆目标记录和关系边的术语。

## Repository 入口

关系写入只用于单记录 mutation：

```ts
interface CreateOneOptions<TCreate extends object> {
  values: TCreate;
  relations?: RelationMutationInput;
  select?: SelectAst;
}

type UpdateOneOptions<TUpdate extends object> = {
  unique: UniqueSelector;
  select?: SelectAst;
  ifVersion?: string | number;
} & (
  | {
      values: TUpdate;
      relations?: RelationMutationInput;
    }
  | {
      values?: TUpdate;
      relations: RelationMutationInput;
    }
);

type RelationMutationInput =
  | RelationMutationAst
  | ((relations: RelationMutationBuilder) => RelationMutationBuilder);
```

`createOne()` 和 `updateOne()` 接受规范 AST，也可以接受生成同一 AST 的 Fluent Builder。
HTTP、CLI、Agent tool 和持久化配置只使用 AST。

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
envelope；批量 mutation 继续返回各自的 count object。

`createdTargets` 只包含显式提供 `clientKey` 的 CreateTarget，并按 AST 深度优先顺序返回。
同一 mutation tree 中的 `clientKey` 必须唯一；每个成功创建的 key 恰好对应一个结果项。
未提供 `clientKey` 的目标仍会创建，但不出现在该数组中。

## TypeScript 草案

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
  RelationSetNode | RelationClearNode | RelationPatchNode | RelationReplaceNode;

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
```

只有 `CreateTarget` 可以继续携带 `relations`。这为订单 → 明细 → 产品等大表单保留递归
能力，同时避免 V1 成为可在任意节点更新或删除数据的通用 mutation graph。

正式类型应根据静态 Collection schema 推导 relation 字段和目标创建类型。动态 Repository
退化为通用记录，并在运行时完成同样的 metadata 校验。

## 唯一选择器

已有记录只能通过与主键或唯一约束完全匹配的逻辑 Field 集合定位，不能使用一般 Filter
AST，也不能把数据库物理 constraint/index name 放进 Repository 输入：

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

大表单中的完整多选器通常生成 `replace`；“添加一个标签”或“移除一个成员”等局部动作
生成 `patch`。

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

每层 `relations` 都相对于当前新建目标的 Collection 解析，不使用 `items.product` 之类的
dot path。V1 的嵌套节点仍只能使用 create 场景能力：

- to-one `set.connect` / `set.create`；
- to-many `patch.connect` / `patch.create`。

嵌套中不允许 `clear`、`disconnect`、`replace`、update 或 delete，因为刚创建的 source
没有旧关系。默认预算建议为 `maxDepth: 3`、`maxNodes: 100`，实际值由服务端配置。Planner
必须检测循环和预算超限。

V1 将新记录关系限制为一棵树。`clientKey` 只用于错误和结果映射，不能从其他分支引用刚
创建的节点；因此不会形成调用方定义的任意有向图。

## Fluent Builder

手写 TypeScript 可以用 Fluent Builder 构造同一 AST：

```ts
await db.repository('orders').createOne({
  values: {
    orderNo: 'SO-001',
  },
  relations: (relations) =>
    relations
      .set('customer', (customer) => customer.connect({ id: 'customer-1' }))
      .patch('items', (items) =>
        items.create(
          { quantity: 2 },
          {
            relations: (relations) =>
              relations.set('product', (product) =>
                product.connect({ id: 'product-1' }),
              ),
          },
        ),
      )
      .patch('tags', (tags) =>
        tags.connect({ id: 'tag-1' }).create({ name: 'New tag' }),
      ),
});
```

`updateOne()` 可以使用：

```ts
relations
  .set('owner', (owner) => owner.connect({ id: 'user-owner' }))
  .clear('reviewer')
  .patch('members', (members) =>
    members.connect({ id: 'user-new' }).disconnect({ id: 'user-old' }),
  )
  .replace('tags', (tags) =>
    tags.connect({ id: 'tag-1' }).connect({ id: 'tag-2' }),
  );
```

非主键唯一 Field 集合使用 `connectBy(fields, values)`。Builder 只构造 AST，不执行查询，也
不能提供 AST 中不存在的另一套关系语义：

```text
Fluent Builder -> RelationMutationAst -> validation -> mutation plan
```

## 大表单编译

动态大表单不生成 Fluent 代码。前端 Form Mutation Compiler 直接生成规范 AST：

```text
服务端 `SingleMutationResult.record` + `version`
  -> 前端 initialValues
  -> 用户编辑得到 values 和 changeSet
  -> Form Mutation Compiler
  -> { values, relations: RelationMutationAst, ifVersion }
  -> Repository validate/execute
  -> 返回 SingleMutationResult
```

基本映射：

| 表单字段              | 编译结果                                  |
| --------------------- | ----------------------------------------- |
| dirty 标量            | 根 `values`                               |
| dirty to-one selector | identity 改变生成 `set`，清空生成 `clear` |
| 完整 to-many selector | 用当前完整值生成 `replace`                |
| 新建关联子表行        | `patch.create`，行内 relation 可递归编译  |
| 新加入的已有目标      | `patch.connect`                           |
| 被明确移除的目标      | `patch.disconnect`                        |
| 未 dirty 字段         | 不生成 mutation                           |

`initialValues` 和当前 `values` 通常都留在前端。`initialValues` 只用于编译用户意图，默认
不提交给后端，也不能作为并发依据。后端只接收 mutation 和可选 `ifVersion`，并根据
数据库当前状态重新校验。

只有完整加载的关系集合才能生成 `replace`。分页、懒加载或调用边界裁剪后的部分列表只能根据
显式行级 changeSet 生成 `patch`。更完整的表单流程见
[表单到 Mutation AST](./form-mutation.md)。

## Agent 工作流

只提供 AST 结构不足以让 Agent 稳定写入。Repository 边界还应提供发现和预校验能力：

```text
describeMutation -> build AST -> validateMutation -> execute -> verify result
```

概念接口为：

```ts
interface DescribeMutationOptions {
  operation: 'createOne' | 'updateOne';
}

type ValidateMutationOptions =
  | {
      operation: 'createOne';
      values: Readonly<Record<string, unknown>>;
      relations?: RelationMutationAst;
    }
  | ({
      operation: 'updateOne';
      unique: UniqueSelector;
      ifVersion?: string | number;
    } & (
      | {
          values: Readonly<Record<string, unknown>>;
          relations?: RelationMutationAst;
        }
      | {
          values?: Readonly<Record<string, unknown>>;
          relations: RelationMutationAst;
        }
    ));

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
      "allowedActions": ["set", "clear"],
      "uniqueFieldSets": [{ "fields": ["id"], "primary": true }]
    },
    {
      "field": "members",
      "cardinality": "many",
      "targetCollection": "users",
      "allowedActions": ["patch", "replace"],
      "patchOperations": ["connect", "create", "disconnect"]
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

错误应包含稳定 code、AST path、逻辑名称和修复信息：

```json
{
  "code": "RELATION_ACTION_NOT_ALLOWED",
  "path": ["relations", "items", 1, "action"],
  "collection": "projects",
  "relation": "owner",
  "received": "patch",
  "allowed": ["set", "clear"],
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

- `createOne()` 的 to-one `set.connect` / `set.create`；
- `createOne()` 的 to-many `patch.connect` / `patch.create`；
- `updateOne()` 的 `set`、`clear`、`patch` 和 `replace`；
- 主键与唯一 Field 集合 selector；
- 只包含 connect/create 的有界 nested create；
- Fluent Builder 到规范 AST 的转换；
- `describeMutation()`、`validateMutation()` 和结构化错误；
- Collection、冲突、并发和资源预算校验；
- 根、嵌套目标和关系边的单事务执行；
- 可选 Select AST 回读和稳定的 `SingleMutationResult`。

V1 暂不支持：

- 批量 `createMany()` / `updateMany()` 的 relation mutation；
- 更新或删除已关联目标；目标更新使用目标 Collection Repository；
- `belongsToMany` edge values/update；中间记录更新使用 through Collection Repository；
- 一般 Filter AST 作为 source 或 target selector；
- 隐式 reassign / move；
- `connectOrCreate`、upsert 或调用方定义的任意 mutation graph；
- 跨 DatabaseConnection 的 relation；
- raw SQL、物理名称或调用方指定执行顺序；
- 把 `null`、空数组、是否有 `id` 等数据形状当作隐式操作。
- Repository policy 注入或授权；授权由可信调用边界负责。

这些限制不封死长期扩展：后续可以增加 `updateTarget`、`updateEdge`、显式 move 和
connect-or-create，但应作为独立、可发现的 capability，而不是改变 V1 action 的含义。

## Agent 注意事项

- 本页 V1 接口已实现；标为“暂不支持”的能力仍不能生成或执行。
- 根标量放 `values`，relation 写入放 `relations`。
- To-one 使用 `set` / `clear`；to-many 增量操作使用 `patch`，完整状态使用 `replace`。
- 已有目标只用与主键或唯一约束匹配的逻辑 Field 集合 selector；新目标只用 `create`。
- `disconnect` 只解除关系，不更新或删除目标。
- Nested relations 只出现在 `CreateTarget`，并且仍只允许 connect/create。
- 先调用 `describeMutation`，执行前调用 `validateMutation`，不能猜 relation capability。
- HTTP、CLI、Agent tool 和动态表单使用规范 AST；Fluent 只用于手写 TypeScript。
- 大表单在前端编译 AST，默认不提交 `initialValues`。
- 不在 AST 中放 raw SQL、物理名称、through 外键或执行顺序。
