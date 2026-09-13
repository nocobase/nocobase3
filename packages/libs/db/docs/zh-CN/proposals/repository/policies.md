---
title: Repository Policy：行范围与读写形状
description: 重构 Repository 权限模型，用 read/create/update/delete 四个节点统一表达行范围与字段关系白名单，定义三条不变量、越权语义与 upsert 例外。
---

# Repository Policy：行范围与读写形状

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：提案，尚未实现。** 现有 `writePolicy` 的结构会被这份设计取代，不保留兼容层。现行实现见 [Write policy](../../repository/write-policy.md)。

## 这套文档怎么读

本篇只讲**规则是什么、为什么这么定**。具体怎么写、怎么实现、分几步做，在另外四篇：

| 文档                                       | 回答什么                                             |
| ------------------------------------------ | ---------------------------------------------------- |
| **本篇**                                   | 设计决策与理由：三条不变量、结构、各项规则的取舍     |
| [Policy 示例说明](./policies-examples.md)  | 从没有 Policy 的现状出发，逐层加入每个概念           |
| [Policy 参考](./policies-reference.md)     | 四个节点的每个参数、scope 的完整语法、绑定的每种写法 |
| [Policy 执行细节](./policies-internals.md) | 在现有 Knex 适配器上挂在哪、出什么 SQL               |
| [Policy 实施清单](./policies-roadmap.md)   | 分阶段任务、前置决策、验收标准、迁移面               |

建议顺序：先读本篇建立心智模型，再读示例说明走一遍，配置时查参考，实现时看执行细节。分期与待决决策只在实施清单里维护一份。

## 要解决的问题

现有 `writePolicy` 只回答**形状**问题：一次 mutation 里调用方能提交哪些字段和关系操作。它不回答**行**的问题：这次操作允许碰哪些记录。多租户隔离、数据归属、可见范围全部落在后一个问题上，今天没有任何支撑，只能靠每个调用点自己记得把 `tenantId` 写进 `filter`——漏一处就是整张表对所有人可见。

同时现有结构本身也需要整理：`createOne`/`updateOne` 收扁平对象、`upsertOne` 收 `{ create, update }`、批量方法只收 `fields`，三种形状描述的是同一件事。

## 三条不变量

整个设计只有三条规则，其余全是它们的推论：

1. **scope 与调用方条件取交集，永不放宽。** 有效范围 = 调用方 `filter` AND policy `scope`，且必须下推进 SQL。
2. **写入后的记录必须仍满足本次操作的 scope，否则在同一事务内回滚。** 现有适配器是「先锁、再改、最后回读」，前像在第一步就已读入内存，所以常规路径下这条判定不产生额外查询；见[执行细节](./policies-internals.md)。
3. **scope 不匹配与记录不存在不可区分。**

第 2 条是唯一的写入侧规则。它单独就挡住了转移归属、越租户创建这类提权，不需要"scope 字段不可写"之类的附加开关——松紧完全由 scope 本身决定。

跨操作的范围逃逸不归 Policy 管。把 `status` 从 `draft` 改成 `published` 从而离开 `delete.scope`，是状态机问题，由字段与记录级 validation 负责。Policy 回答"谁能碰哪些行、哪些字段"，不回答"这个状态转换合不合法"。

## 结构

```ts
interface RepositoryPolicy {
  readonly read: true | false | ReadNode;
  readonly create: true | false | CreateNode;
  readonly update: true | false | WriteNode;
  readonly delete: true | false | DeleteNode;
}

interface ReadNode {
  readonly scope: true | Scope;
  readonly fields?: false | readonly string[];
  readonly relations?: false | Readonly<Record<string, ReadNode | PolicyRef>>;
}

interface WriteNode {
  readonly scope: true | Scope;
  readonly fields?: false | readonly string[];
  readonly relations?: false | Readonly<Record<string, RelationWriteNode>>;
}

interface CreateNode extends WriteNode {
  /** 服务端赋值：调用方未提供该字段时应用。仅 create 有。 */
  readonly defaults?: Readonly<Record<string, ScalarValue>>;
}

interface DeleteNode {
  readonly scope: true | Scope;
}

interface RelationWriteNode {
  /** 能定位到哪些既有目标。约束 connect/disconnect/set/delete 与关系的 update/upsert。 */
  readonly scope?: true | Scope;
  readonly create?: RelationCreateNode;
  readonly update?: RelationShapeNode;
  readonly upsert?: {
    readonly create: RelationShapeNode;
    readonly update: RelationShapeNode;
  };
  readonly connect?: ThroughNode;
  readonly disconnect?: Readonly<Record<string, never>>;
  readonly set?: ThroughNode;
  readonly delete?: Readonly<Record<string, never>>;
}

/** 关系子节点：只管形状，行范围由所属 RelationWriteNode.scope 统一约束。 */
interface RelationShapeNode {
  readonly fields?: false | readonly string[];
  readonly relations?: false | Readonly<Record<string, RelationWriteNode>>;
}

interface RelationCreateNode extends RelationShapeNode, ThroughNode {}

/** 多对多中间表的 payload 白名单，仅用于 create / connect / set。 */
interface ThroughNode {
  readonly through?: false | { readonly fields?: false | readonly string[] };
}

/** 引用另一个 Collection 的 read 节点，在编译阶段展开并检测环。 */
interface PolicyRef {
  readonly kind: 'policyRef';
  readonly target: string;
}
declare function ref(target: string): PolicyRef;

/** scope 与 defaults 的值位置接受的标量。沿用写入侧既有的标量类型。 */
type ScalarValue = string | number | boolean | null | Date;

/**
 * 简写对象（根级标量等值、隐式 AND）或完整 FilterAst。
 * 不接受 Builder 回调、关系节点、变量节点、JSON 操作符。
 */
type Scope = Readonly<Record<string, ScalarValue>> | FilterAst;

/** narrow 的入参：节点可省、节点内每个成员也可省。 */
type PartialRepositoryPolicy = {
  readonly [K in keyof RepositoryPolicy]?:
    true | false | Partial<NonNullable<Extract<RepositoryPolicy[K], object>>>;
};
```

`RelationShapeNode` 是关系子节点专用的形状类型——它没有 `scope`，因为关系操作的行范围由所属 `RelationWriteNode.scope` 统一约束；也没有 `defaults`，嵌套目标的赋值由关系键和数据库默认值负责。

`RelationWriteNode.scope` 可选，省略表示不限定目标行。顶层四个节点的 `scope` 必填，那条规则只作用于顶层——关系目标已经被关系键约束在父记录范围内，再强制声明是噪音；而顶层漏配是跨租户风险。

`fields` 和 `relations` 是白名单，省略表示空白名单，也就是不允许任何字段或关系。它们在 TypeScript 类型上可选，是为了让“禁止全部”可以用省略表达；这不表示省略后放开权限。需要授权时必须显式列出字段或关系，`false` / `[]` 是表达同一空白结果的显式写法。

`ref(target)` 解析到**同一个 `withPolicies` map 的键**，不是目标 Collection 全局的 policy。这是唯一一个多个 Collection 的 policy 处于同一作用域的地方，也让"跨路径不自动继承"仍然成立——引用是显式写出来的。

### 关系写入的目标也要有 scope

根记录的 scope 只约束根记录。关系操作中的目标是按选择器直接从目标表定位的（`resolveMutationTarget`），不经过任何范围判断：

```ts
update: {
  scope: { tenantId: 'T1' },
  relations: { tasks: { connect: {} } },   // 若 connect 不受约束
}

await projects.updateOne({
  filter: { id: 'p1' },
  values: { tasks: { connect: [{ id: 't4' }] } },  // t4 属于别的租户
});
```

根 scope 挡住了 `p1` 以外的 project，却挡不住 `t4`——别家的记录被挂进了自己的数据里。`disconnect` / `set` / `delete` 以及关系的 `update` / `upsert` 全部同理。

所以 `RelationWriteNode` 带 `scope`，语义与 `ReadNode.scope` 对称：**能定位到哪些既有目标**。`create` 不在其列——新建目标的归属由关系键决定，必然落在发起方下面。

与之配套的一条规则，读侧已经写过而写侧此前漏了：**关系写入的授权完全由发起方的 `relations` 节点决定，目标 Collection 自己的 Policy 不参与。** 调用方手上只有发起方这一个实例，没有第二份 policy 可用；所以给 `relations.tasks` 授权，就是在替 `tasks` 表做授权决定，配置的人必须清楚这一点。写侧比读侧更要紧，因为它改数据而不只是泄漏。

### 四个节点必填，节点内的 scope 必填

注意上面没有一个 `?`：调用 `withPolicy` 就必须把四个节点都写出来，写成对象就必须给 `scope`。缺一个是 TypeScript 编译错误，而不是运行时的宽松默认。

这一条不是为了严格而严格。权限配置里最危险的形态是**半句话**——看起来配过了，review 时容易放过，而漏掉的那半句默认全开：

```ts
// 若允许省略，这行就是一个删除接口完全敞开的 Repository
withPolicy({ read: { scope: { tenantId } } });
```

所以规则是：**一旦表达了"我要配权限"的意图，就必须把话说完。** 不想限制就显式写出来：

```ts
withPolicy({
  read: { scope: tenant, fields: ['id', 'title'] },
  create: { scope: tenant, defaults: tenant, fields: ['title'] },
  update: { scope: mine, fields: ['title'] },
  delete: false, // 显式禁止删除
});
```

`fields` 与 `relations` 虽然在类型上可选，但省略表示空白名单，即不允许任何字段或关系。它们与 `scope` 的安全默认值一致：一旦调用 `withPolicy`，没有显式列出的内容就不会被授权。需要放开某个字段或关系时，必须把它写进白名单；需要明确表达“一个都不允许”时，可以写 `false` 或 `[]`。

完全不配权限是合法的——不调用 `withPolicy` 即可，这是内部代码的常态。收紧它是 Collection 上 `requireScope` 的职责，不是靠让 `withPolicy` 接受半句话。

- 四个操作节点各自独立，互不继承。`read` 可读不蕴含 `update` 可改。
- 四个节点都有 `scope`，但 `create.scope` 的执行方式不同：它不是 WHERE，而是「新记录必须落在这个范围内」，靠 `create.defaults` 赋值与写入后重判实现，见下。
- `upsertOne` 不需要独立节点，它同时使用 `create` 与 `update`，行范围取 `update.scope`。这取代了现有的 `UpsertWritePolicyInput`。
- `createMany` / `updateMany` 使用同样的节点，关系操作在批量方法上照旧不被支持——那是 Repository 的能力边界，不是 Policy 的。
- `RelationWriteNode` 沿用现行的 `create / update / upsert / connect / disconnect / set / delete` 逐项声明，以及 `through` 控制中间表 payload。这部分现有设计是对的，只是换了挂载位置。

### 三态

节点值为 `true` 表示该操作不增加任何限制；`false` 拒绝整个操作；对象是规则。节点内的 `fields` 写成 `false` 或 `[]` 是空白名单——调用方一个字段都不能提交，但仍可触发数据库默认值，与拒绝整个操作的 `false` 不同。

未调用 `withPolicy` 的 Repository 等同于四个节点全为 `true`；HTTP 层则相反，未声明 policy 的 action 一律拒绝。

## scope

### 交集且下推

```text
有效范围 = 调用方 filter AND policy scope
```

绝不允许先查出来再在内存里筛。`all: true` 不绕过 scope，它表示"scope 范围内的全部记录"。分页、游标、`distinct`、聚合、`groupBy`、关系局部 filter 全部在收窄后的范围上计算。

### 复杂度上限由反向操作决定

| 用途           | 需要的反向能力               | 上限                           |
| -------------- | ---------------------------- | ------------------------------ |
| `read.scope`   | 无，只需下推                 | 全部 21 个操作符，含 `or` 分组 |
| `delete.scope` | 无                           | 同上                           |
| `update.scope` | 对写入后的行求值（不变量 2） | 同上                           |

非等值条件都可以用。scope 任何情况下都不产生值——create 的字段赋值由 `create.defaults` 负责，与 scope 的语法形状无关。

注意 scope 只接受**简写对象**和 **`FilterAst`** 两种形式，不接受 Builder 回调（回调无法序列化，也就无法被 `explainPolicy()` 检视或存库）。而简写**只能表达根级标量等值**——`{ budget: { $gt: 100000 } }`、`{ $or: [...] }`、`$in` 在整个 Repository 里都不是有效语法，非等值条件一律走 AST。完整的操作符表、按字段类型的可用范围、NULL 三值语义与索引义务见 [Policy 参考](./policies-reference.md)。

**不支持关系路径与关系量词**（`owner.tenantId`、`tasks.some(...)`）。理由是递归歧义（关系目标自己的 Policy 是否生效，两个答案都不好）、隐式 join（每次查询都多一个 EXISTS 且调用方看不见）、以及并发下写后重判需要回查关联表。这是分期决定：`read.scope` 不需要任何反向操作，可以在后续阶段单独开放。当前的替代做法是把归属物化到本表，或在 service 层拆成两段查询。

**不支持 context 变量**（`$actor.id`）。`context` 是每次调用可传的参数，让 scope 取值依赖它，等于把范围交给调用方控制：

```ts
const scope = { ownerId: '$actor.id' };

repo.findMany({ context: { actor: { id: '别人的 id' } } }); // 自己改自己的范围
```

拒绝的是**这个通道**，不是延迟绑定本身。Policy 需要先于身份存在的场景（路由在启动时声明）由 [绑定](#绑定) 一节的函数重载覆盖，取值来自认证中间件解析出的 principal 而非调用参数。

### 越权与不存在返回相同结果

| 操作                            | 行存在但不在 scope 内          |
| ------------------------------- | ------------------------------ |
| `findOne`                       | `null`                         |
| `findMany` / `count` / `exists` | 不包含该行                     |
| `updateOne` / `deleteOne`       | `RECORD_NOT_FOUND`（HTTP 404） |
| `updateMany` / `deleteMany`     | 计入 0，不报错                 |

不新增越权错误码。任何可区分的越权信号都是存在性预言机：拿 ID 逐个试，403 与 404 的差别就足以枚举出别的租户有哪些记录。

`ifVersion` 与 scope 同时不满足时先判 scope，返回 `RECORD_NOT_FOUND` 而不是 `VERSION_CONFLICT`，否则版本号本身成为存在性信号。

调试代价用诊断通道补偿：命中 0 行且 scope 参与收窄时向 logger 输出 collection、操作与生效 scope，**不进入返回值，不进入 HTTP 响应体**。

### upsert 是唯一例外

`upsertOne` 的 `filter` 必须恰好等于一个主键或无条件唯一字段集，scope **不并入**该 selector，否则唯一性判定被破坏。执行顺序：

1. 按 unique selector 锁定目标行。
2. 不存在 → 走 `create`：应用 `create.defaults` → 插入 → 按 `create.scope` 重判。
3. 存在且满足 `update.scope` → 走 `update`。
4. 存在但不满足 `update.scope` → 抛 `RECORD_OUTSIDE_SCOPE`（409），**不退化成插入**。

第 4 步有意违反不变量 3，因为这里没有新增泄漏面：退化成插入必然撞唯一约束报 duplicate key，"该键已被占用"照样泄漏，只是换成一个误导性的错误。需要隐藏"键已占用"的场景不要用 upsert。

## create.scope 与 defaults

create 没有既有行可以 WHERE，但它仍然需要一个范围：不变量 2 要求写入后重判，总得有个东西可判。所以 `create.scope` 是一句独立的话——**新记录必须落在这个范围内**——而不是从 `read.scope` 或 `update.scope` 借来的。

借用行不通。`update.scope` 里的 `status: 'draft'` 说的是「能修改草稿状态的记录」，不是「新建的记录必须是草稿」；把它当成初始值会静默强制每条新记录的状态。两个来源冲突时（例如 `read` 写 `T1` 而 `update` 误写 `T2`）也没有定义良好的结果。

### scope 判定，defaults 赋值

这是两件事，分两个字段写：

```ts
const tenant = { tenantId: actor.tenantId };

create: {
  scope: tenant,       // 判定：新记录必须满足
  defaults: tenant,    // 赋值：调用方没提供就填这个
  fields: ['title'],
}
```

早先的设计让 `create.scope` 兼做赋值来源——自动把顶层 AND 的等值条件注入新记录。那是把判定当成了赋值，而且只对一种语法形状有效：scope 稍微复杂一点，注入就静默失效。一个依赖条件语法形状、失效时不报错的机制，会产出「我测的时候是好的」。

拆开之后：

- **`defaults` 不依赖 `scope` 的形状。** scope 写多复杂都行，赋值照常工作。
- **`defaults` 能设 scope 里没有的字段**，例如 `createdBy`、`source`——反推永远做不到。
- 重复一个值的代价，抽个变量就没了。

### defaults 与 fields 的组合

`defaults` 在**调用方未提供该字段时**应用；调用方能不能提供由 `fields` 决定。两者组合出四种行为，都有用：

| `defaults` | 在 `fields` 里 | 效果                                                |
| ---------- | -------------- | --------------------------------------------------- |
| 有         | 否             | **强制赋值**，调用方无法覆盖——`tenantId` 的典型用法 |
| 有         | 是             | **真正的默认值**，调用方可覆盖，覆盖后受 scope 重判 |
| 无         | 是             | 调用方自己提供，否则走数据库默认值                  |
| 无         | 否             | 完全由数据库默认值决定                              |

第一行才是租户隔离要的，它本质上是服务端赋值而不是默认值；第二行是名副其实的默认值。一个字段配合 `fields` 表达两种语义是组合而非歧义。

`defaults` 只在 `create` 上有。`update` 是 patch，省略字段是刻意的，不存在「没给就填」。

`defaults` 的值必须是标量常量，与 scope 的值位置同一套要求；它与调用方提交的值一视同仁，同样经过字段级 validation 和数据库约束。

### 可满足性检查

拆开之后这条规则变得很简单，而且能在**配置阶段**执行：

> `create.scope` 引用的每个字段，必须满足以下之一，否则 `INVALID_POLICY`：
>
> 1. 出现在 `create.defaults` 里
> 2. 出现在 `create.fields` 里
> 3. Collection 上该字段有字面量默认值，且该默认值满足 scope 中对它的条件

`or` 分组按「存在一条分支的全部字段都满足上述之一」判定——有一条路走得通即可。

不加这条会怎样：

```ts
create: {
  scope: <AST: status $ne 'archived'>,
  fields: ['title'],      // status 不在里面，也没有 defaults
}
```

`status` 赋不到值、提交不了，只能取数据库默认值。默认值若恰好是 `'archived'`，这个 create **永远不可能成功**——每次调用都插入、重判、回滚，而错误信息指向 `values`，调用方根本改不了。三条信息（scope 引用哪些字段、`fields` 有哪些、默认值是什么）全是静态的，没有理由拖到运行时才发现。

### 重判与错误信息

写入后按不变量 2 对新记录重判 `create.scope`，不满足则整个事务回滚。

```text
SCOPE_VIOLATION: Created record does not satisfy create.scope
  field: status    expected: not equal to 'archived'    actual: 'archived'
  hint: This field is absent from create.fields; its value came from the column default.
```

消息正文用英文，与仓库既有的 `RepositoryError` 一致——[AGENTS.md](../../../../../../../AGENTS.md) 把 error messages 归在必须英文的一类。

错误信息给出**违反的那一条具体条件**，但不 dump 整份 policy。这个错误只在调用方确实有权创建、仅仅是值不对时发生，暴露的是字段约束而非他人数据；不说清楚则接口无法使用。最后一行提示尤其重要——它指出问题在 policy 配置而不在提交的数据。

### 必填，无继承

`create.scope` 和其它三个一样必填，没有继承规则。通常它和 `read.scope` 写成同一个值——语义是「不允许创建一条自己看不见的记录」——但那是你写出来的，不是隐式发生的。确实需要创建自己看不到的记录（例如向别的部门提交工单），写 `create: { scope: true }`。

## 读取形状

```text
根记录范围 = 调用方 filter AND read.scope
返回内容   = select ∩ read.fields / read.relations
关系范围   = 关系局部 filter AND 该关系节点的 scope
```

- 调用方**显式**请求未授权字段或关系 → `FIELD_READ_FORBIDDEN` / `RELATION_READ_FORBIDDEN`，不静默删除请求内容。
- 调用方**省略 `select`** → 返回 `read.fields` 允许的根级标量字段，仍不自动展开关系。

两者不一致是有意的：**省略 select 表示"由服务端决定返回什么"，不是"请求全部字段"。**

类型上的代价随白名单生效：**`read.fields` 省略或绑定为空白名单时，无 `select` 查询不返回任何根级标量字段；显式绑定字段白名单时，返回类型降级为 `Partial<TRecord>`**。只绑定 `read.scope` 不会保留完整字段类型，因为省略 `fields` 并不代表放开字段。

### 关系与外键的对称

`read.fields` 管标量，`read.relations` 管关系，互不蕴含但必须一起判定：

- 若 `read.relations.owner` 允许展开且其 `fields` 含目标主键，则视同 `ownerId` 可读。否则"禁 `ownerId` 但准 `owner{id}`"是等价泄漏。
- 反向不成立：`ownerId` 可读不蕴含 `owner` 可展开，因为 owner 上还有别的字段。

写入侧的对称规则照旧：允许 `owner.connect` 不等于允许写 `ownerId`。

### 递归与跨路径复用

`relations: { tasks: {} }` 表示 tasks 可展开但零字段、零子关系。

**不做跨路径自动继承**：`projects` 的 `read.relations.tasks` 与 `tasks` 自己的 `read` 是两份独立声明。自动继承会让"经由关系到达"和"直接查询"互相影响，难以推理。为避免漂移提供显式引用：

```ts
read: {
  scope: { tenantId },
  fields: ['id', 'title'],
  relations: { tasks: ref('tasks') },
}
```

`ref` 在策略编译阶段展开并检测环，不是运行时解引用。

## 查询条件也会泄漏

`read.fields` 限制返回内容，但查询本身同样泄漏字段值：一次 `exists` 配上 `budget` 的范围条件不返回任何字段，却能二分出具体数值。

规则：**调用方在 `filter`、关系 filter、`sort`、`distinct`、`cursor`、`groupBy.by`、`aggregate`、`having` 中使用的字段，必须属于 `read.fields`。**

硬性实现要求：**合并后的 filter AST 必须区分节点来源。** Policy 注入的条件不参与该校验，否则 scope 的 `tenantId` 会被自己拒绝。给节点打 `origin: 'caller' | 'policy'` 标记，在合并时写入；不要靠"合并前先校验"的时序技巧，嵌套关系与 `combine` 分支会让时序假设失效。

第一版不支持"允许搜索但不允许返回"。需要时另开 `read.filterableFields`，不让 `read.fields` 隐式承担这个例外。

## 绑定

Policy 跟着身份走，绑在实例上，不由单次调用提供。

### 绑定在 Connection 上，不是逐个 Repository

一次请求通常要用到多个 Collection，事务里还要重新取 Repository。逐个绑定两样都别扭，而且没有任何地方能看出「这次请求授权了哪些表」：

```ts
// ✗ 逐个绑定
const projects = conn.repository('projects').withPolicy(p1);
const tasks = conn.repository('tasks').withPolicy(p2);
await conn.transaction(async (tx) => {
  tx.repository('projects'); // 未绑定，policy 丢了；重新绑也没人检查有没有漏
});
```

把绑定上移一层，两个问题一起消失：

```ts
const scoped = conn.withPolicies(
  { projects: projectPolicy, tasks: taskPolicy },
  principal,
);

scoped.repository('projects'); // 已绑定
scoped.repository('users'); // 不在 map 里：标了 requireScope → POLICY_REQUIRED，否则返回未绑定实例
await scoped.transaction(async (tx) => tx.repository('projects')); // 事务内自动携带
```

这也让 `requireScope` 的检查点变得自然：一处就能看出这次请求覆盖了哪些 Collection。单表场景保留 `repository().withPolicy()` 作为简写。

### 两种派生方法，靠类型分开

```ts
// 未绑定：只能完整声明
interface Repository<...> {
  withPolicy(policy: RepositoryPolicy): ScopedRepository<...>;
  withPolicy<P>(policyFor: (principal: P) => RepositoryPolicy, principal: P): ScopedRepository<...>;
}

// 已绑定：只能收窄
interface ScopedRepository<...> {
  narrow(partial: PartialRepositoryPolicy): ScopedRepository<...>;
  explainPolicy(): RepositoryPolicy;
}
```

两者共享一个操作方法基接口（`findMany`、`updateOne` 等完全相同），只在派生方法上分叉。`ScopedRepository` **不是** `Repository` 的子类型，否则 `withPolicy` 又会在已绑定实例上可见。

这样「重复绑定」和「未绑定就收窄」都是编译错误，不需要运行时检查——失败点比 `INVALID_POLICY` 早一整个运行阶段。

两者都返回新实例，原实例不受影响。

### 两个参数的重载

**principal 是什么：当前是谁**，认证中间件解析出来的身份对象。

它不是本设计引入的概念，`@nocobase/db` 对它一无所知——签名里就是个裸泛型 `P`，db 层不读它的任何字段、不校验它、也不导出 `Principal` 类型，只是把调用方给的东西原样传给调用方自己的函数。`P` 完全由应用定义。

叫 principal 而不叫别的：`context` 已经是 `RepositoryContext`，且信任级别正好相反（调用方每次调用可传）；`user` 不准确，服务账号、API key、定时任务的系统身份走的是同一条路；principal 是安全领域对「被认证的主体」的标准叫法。

**大多数情况根本用不到它**——身份已在作用域内就直接写字面量。函数形式只为一个场景存在：policy 必须写在身份存在之前，典型是 HTTP 路由在启动时声明，那个函数写在模块作用域，没有任何东西可以闭包。

三条契约：

- **求值一次。** 在 `withPolicy` 时调用，结果规范化并冻结，不是每次方法调用重新求值。否则同一个实例在生命周期内 policy 会变，`explainPolicy()` 也就失去意义。
- **同步返回。** 这条不需要运行时规则，`async` 返回 Promise 会直接是类型错误。
- **返回值走完整校验。** 四节点必填、scope 必填、字段名存在性——函数产出的 policy 与字面量写的走同一套规范化。

每种写法的完整枚举见 [Policy 参考](./policies-reference.md)。

### 不提供 callback builder

Policy 是一份静态数据，没有任何需要计算的东西。Builder 在 `filter` 和 `select` 上挣得到位置（前者按字段类型给出操作符，后者驱动返回值类型推导），在这里只是第二套等价语法。

对象形式已经拿到了 builder 能给的全部：字段名类型安全来自 `readonly (keyof TRecord & string)[]`，重复声明由对象字面量的重复键在编译期挡掉。而 builder 会引入「回调必须同步返回收到的那个 builder」这类只能运行时检查的约束，并让 policy 不再可检视、不可序列化。

### scope 的值由 principal 的类型负责

`{ field: X }` 这个简写的含义取决于 X 的运行时类型——标量是 `$eq`，普通对象按操作符解析。所以插进去的值应当是标量：

```ts
interface Principal {
  readonly id: string;
  readonly tenantId: string;
  readonly role: 'admin' | 'member';
}
// p.tenantId 是 string，插不进操作符对象
```

Policy 不为此增加运行时检查。这是 `filter` 简写语法的通用性质，`filter: { status: req.query.status }` 一样中招；只在 scope 上补一道，等于同一个问题补一处漏一处。产出字段皆为标量的 principal 是认证层的义务，声明清楚类型即可，前提是那个类型不是 `as Principal` 断言出来的谎言。

顺带一提：污染 principal 的攻击者写 `tenantId: 'T2'` 与写一个条件片段同样致命，标量检查拦不住前者——它从来不是一道防线。

- `narrow` 的合并规则：scope 取 AND，`fields` 取集合交，`relations` 递归取交，任一侧为 `false` 则结果为 `false`。没有任何写法能放宽。
- 方法级仍可传 `writePolicy` 做本次调用的额外收窄，与实例节点取交集；传 `true` 表示本次不额外收窄，实例绑定照常生效，**不报错**。
- 带身份的实例不得跨请求共享，不得挂到模块级单例上。

### 让配置可被验证

```ts
repo.explainPolicy();
// → 归并 withPolicy 与历次 narrow 之后实际生效的完整 policy
```

多层收窄之后「到底允许什么」不该靠推理。测试里对 `explainPolicy()` 断言，比对着几层调用心算可靠。

### 错误信息要能指导修复

```text
SCOPE_VIOLATION: 写入后的记录不满足 update.scope
  path: ['values', 'ownerId']
  期望: ownerId = 'u1'   实际: 'u2'
  提示: 若业务允许转让，应放宽 update.scope，而不是修改提交的值
```

最后一行是必要的。没有它，读到这条错误的人（或 agent）最可能的下一步是去改 `values`，而正确的修复在 policy 那一侧。

### 可选加固：`requireScope`

漏调用 `withPolicy` 的代码路径拿到的是完全无限制的 Repository。把这个决定放到数据模型上而不是指望每个调用点：

```ts
builder.createCollection('projects', {
  // ...
  policy: { requireScope: true },
});
```

标记后，该 Collection 的 Repository 未绑定 policy 时一律抛 `POLICY_REQUIRED`。系统代码显式写 `.withPolicy({ read: true, create: true, update: true, delete: true })` 声明豁免——可 grep、可 review。多租户表是多租户的，与谁在查询无关，所以该声明属于 Collection。

默认不启用，按 Collection 逐个开启。

## validateMutation

保持不查库的定位：校验形状、`create.defaults` 应用后的结果、字段可写性，**不**校验目标行是否在 scope 内。

create 是个例外——它的写入后重判本来就不需要查库（`defaults` 加上已知的字面量默认值就够算），所以 `validateMutation` 对 `createOne` 可以给出完整的 scope 判定。取值来自 `now()`、序列或触发器的字段判不了，标注为 `unknown`。

```ts
await repo.validateMutation({
  operation: 'updateOne',
  filter,
  values,
  probe: true,
});
// → { valid, errors, targetInScope: boolean | 'unknown' }
```

`probe` 额外做一次只读命中检查。它有 TOCTOU，只能用于提示，不能作为授权依据——真正的判定永远在写入语句的 WHERE 里和写入后的重判里。

## 错误码与 HTTP 映射

| 错误码                            | 含义                                           | HTTP |
| --------------------------------- | ---------------------------------------------- | ---- |
| `INVALID_POLICY`                  | 策略结构、字段名或 scope 表达式不合法          | 400  |
| `POLICY_REQUIRED`                 | Collection 要求 scope，实例未绑定              | 400  |
| `READ_FORBIDDEN`（新增）          | 整次读取被 `read: false` 拒绝                  | 403  |
| `FIELD_READ_FORBIDDEN`（新增）    | 显式请求的标量字段超出白名单                   | 403  |
| `RELATION_READ_FORBIDDEN`（新增） | 显式请求的关系未获授权                         | 403  |
| `WRITE_FORBIDDEN`                 | 整次写入被 `false` 拒绝                        | 403  |
| `FIELD_WRITE_FORBIDDEN`           | 字段或 through payload 超出白名单              | 403  |
| `RELATION_WRITE_FORBIDDEN`        | 关系操作未获授权                               | 403  |
| `SCOPE_VIOLATION`                 | 写入后的记录不满足本次操作的 scope（不变量 2） | 403  |
| `RECORD_OUTSIDE_SCOPE`            | upsert 目标存在但不在 scope 内                 | 409  |

**scope 不匹配不产生错误码**，按上文映射成 404 或空结果。`SCOPE_VIOLATION` 与之不同：它描述的是调用方提交的值把记录推出了范围，此时记录本身是可见的，返回 403 不泄漏任何存在性。

## HTTP 层

读 action 目前全部是 `Record<string, never>`，需要加 policy 位，并与写 action 统一成单个 `policy` 字段。请求体中出现 `policy` / `scope` 一律拒绝。

默认值按重构处理：所有 action 的 policy 缺省为拒绝，与现有 `writePolicy` 在 HTTP 层的默认一致。

## 分期与待决

分阶段任务、前置决策、验收标准与迁移面统一维护在 [Policy 实施清单](./policies-roadmap.md)，本篇不再复制一份——两处各写一份是这组文档此前出现分期归属矛盾的来源。

设计侧尚未拍板、会改变本篇结论的开放问题，同样记在实施清单的「阶段 0：前置决策」。

相关文档：

- [Policy 示例说明](./policies-examples.md)
- [Policy 参考](./policies-reference.md)
- [Policy 执行细节](./policies-internals.md)
- [Policy 实施清单](./policies-roadmap.md)
