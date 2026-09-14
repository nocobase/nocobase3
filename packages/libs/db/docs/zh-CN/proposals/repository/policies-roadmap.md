---
title: Policy 实施清单
description: 按阶段拆分的实施任务，含前置决策、技术验证、每阶段的交付物与验收标准，以及替换现有 writePolicy 的迁移面。
---

# Policy 实施清单

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：阶段 1 至阶段 3 已实现，HTTP 侧的迁移已完成。** 见 `db/src/repository/policy/`、`db-testkit/tests/integration/repository/policy/` 与下方的逐项进度。`defineRepositoryApiRoutes()` 不再接受 `writePolicy`；[Write policy](../../repository/write-policy.md) 描述的方法级选项仍然有效，用于内部调用的单次收窄。本组文档仍在 `proposals/` 下，转正另行安排。

配套 [Policy 设计](./policies.md)。每个阶段独立可交付，阶段 1 完成即可用于生产的多租户隔离。

## 阶段 0：前置决策与技术验证

这一阶段不产出代码，但**不做完就开工必然返工**——下面每一条都会改变阶段 1 的类型形状。

### 五个设计决策

| #       | 决策                                                                                                                                                                                                                                  | 影响                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| ~~0.1~~ | ~~Scope 是否复用 `RepositoryFilter` 语法~~ **已定**：复用简写、AST 与 Builder 回调三种形式，回调在绑定期物化成 AST；排除关系路径、关系量词与 JSON 系列操作符。见 [Policy 参考](./policies-reference.md)                               | —                                   |
| 0.2     | `fields` 是否也必填                                                                                                                                                                                                                   | 只影响类型，但改起来是全量 breaking |
| ~~0.3~~ | ~~现有 `writePolicy` 的 callback builder 是否移除~~ **已定**：Policy 补一套自己的 builder（`buildRepositoryPolicy`），旧 builder 随方法级 `writePolicy` 一起保留。没有 builder 的话，七种关系操作全开的声明改成对象字面量会长到没法读 | —                                   |
| 0.4     | `requireScope` 落在 Collection metadata 还是 Connection 配置                                                                                                                                                                          | 影响阶段 4，但接口要在阶段 1 预留   |
| ~~0.5~~ | ~~`origin` 标记是否进入公开的 `FilterAst`~~ **已定**：不进公开类型。标记只在 `@nocobase/db` 内部携带，`@nocobase/repository-input` 的 `FilterAst` 不变，零 breaking                                                                   | —                                   |

### 两个技术验证（spike，各半天）

- ~~**0.6 返回类型降级能否从字面量推出来。**~~ **已定：能，但按更粗的判据降级。** `withPolicy` 用 `const` 泛型捕获策略字面量，`PolicyRecord<TRecord, TPolicy> = TPolicy['read'] extends object ? Partial<TRecord> : TRecord`。判据从「`fields` 是不是字符串数组」放宽成「`read` 是不是一个规则对象」，因为省略 `fields` 同样是空白名单、同样不返回完整记录，两者应当得到同一个类型。不做「精确到列出的那几个字段」那一档：那需要字面量数组在每个调用点都活过推导，而一个诚实的 `Partial` 好过一个在策略被存进变量时悄悄变宽的精确类型。类型层契约钉在 `tests/unit/repository/policy/return-type.test-d.ts`。
- **0.7 `evaluateScope` 与 SQL 的语义一致性边界。** 见阶段 1 的 1.4——先确认哪些操作符能在内存里和数据库给出完全一致的结果，定不下来的直接排除出 `Scope` 的允许集合。

**出口条件**：五个决策写进设计文档的对应位置（不再留在「待决」），两个 spike 有结论。

### 实施期决定

实施开始后补记的两条，与上表的设计决策并列，但它们决定的是施工方式而不是契约形状。

| #   | 决策                                                                                                                      | 理由                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.8 | 分支整体做完阶段 2 再合入 `develop`，其间 `src/index.ts` 保持导出 policy 入口不变                                         | 半成品 policy 的危险形态正是「看起来配过了」。要么不合，要么撤掉导出；两者都比反复增删公开 API 好。若改为分组合入，须在该组最后一个 commit 撤出 `withPolicy` / `withPolicies` 与 policy 类型 |
| 0.9 | 保留 `toWritePolicy` 桥接（新 policy 翻回旧 `WritePolicy` 再走 `assertMutationWritePolicy`），到关系写入目标（1.8）时再拆 | 阶段 1 的执行层重构已经很宽，再并入 `write-policy.ts` + `write-policy-check.ts`（687 行）会大到无法 review。拆除的触发条件是 `RelationWriteNode.scope` 在旧结构里无处安放                    |

## 阶段 1：行范围

核心阶段。做完就有完整的多租户与归属隔离，不依赖后续任何一步。

### 1.1 错误码

- `@nocobase/repository-input` 的 `RepositoryErrorCode` 增加 `INVALID_POLICY`、`POLICY_REQUIRED`、`SCOPE_VIOLATION`、`RECORD_OUTSIDE_SCOPE`
- `app-server` 的 `repositoryErrorStatus` 增加映射：前两个 400，`SCOPE_VIOLATION` 403，`RECORD_OUTSIDE_SCOPE` 409

无依赖，可以最先做。

### 1.2 类型定义

新增 `src/repository/policy/types.ts`：`RepositoryPolicy`、`ReadNode`、`WriteNode`、`DeleteNode`、`RelationWriteNode`、`Scope`、`PartialRepositoryPolicy`。

阶段 1 只需要 `scope` 相关部分可用，`fields` / `relations` 的字段先定义出来但不接入校验（阶段 2 才用）。

### 1.3 编译

新增 `src/repository/policy/normalize.ts`，实现设计文档「Policy 的编译」五步：函数求值、四节点齐全校验、逐节点规范化、`defaults` / `readable` 预计算、深冻结。

同时做 **`create.scope` 的可满足性检查**：每个被引用的字段必须在 `create.defaults` 里、在 `create.fields` 里、或有满足条件的数据库字面量默认值，否则 `INVALID_POLICY`。三样输入都是静态的；不做这一步就会出现「配置合法但每次 create 都必然回滚」的死锁。

失败一律 `INVALID_POLICY` 并带 `path`。

### 1.4 写入后重判 ⚠️

**实现方式与原设计不同。** 原计划写一个内存求值器 `evaluateScope`，对已读出的记录求 `Scope` 的值，结果必须与同一条件下推成 SQL **完全一致**。动手前逐条核对下面那张风险表时，发现其中一条在内存里无解：

> **排序规则（collation）。** scope 写 `{ tenantId: 'T1' }`，行里存 `'t1'`——MySQL 默认排序规则下 SQL 判定为匹配，PostgreSQL 判定为不匹配。求值器看不到列的 collation，只能二选一，必然在另一半方言上给出与 SQL 相反的结论。

而这正是本节警告的那类故障：不一致不会立刻暴露，日后以「写进去了却查不出来」的形式出现。

**改为在 SQL 里重判**：事务内、行已锁定时发一条 `SELECT … WHERE <主键> AND <scope>`，命不中则抛 `SCOPE_VIOLATION` 回滚。同一个表达式、同一个引擎、同一套排序规则，与选中该行的 WHERE 子句在构造上就一致。下表五条风险一起消失，差分测试（1.4 的做法一节、阶段 1 验收的对应条目）不再有对象。

**「零额外查询」这条验收基本保住了**，靠的是一条观察：**写入没有触及 scope 引用的任何字段时，记录不可能离开 scope，重判可以整个跳过**。`update.scope` 是 `{ tenantId }` 而调用方只改 `name`，走的仍是原来的路径，一条语句都不多。只有触及 scope 字段的写才付那一次主键索引查找。`create` 例外——新记录没有前像可比，`create.scope` 不为 `true` 时一律重判。

同一条观察决定了 `updateMany` 的降级时机：单条 UPDATE 事后无法得知自己碰了哪些行，所以**只有触及 scope 字段的批量写**才降级到 `lockManyByFilter`，其余保持快路径。

下面这张表保留下来，是为了记住为什么不走内存求值：

<details>
<summary>内存求值器的风险点（已不适用，保留作为决策依据）</summary>

### 原计划：`evaluateScope` 内存求值器

**这是整个实施里最容易被低估、也最容易出错的一块。**

它要对一条已读出的记录求 `Scope` 的值，结果必须与同一条件下推成 SQL 的结果**完全一致**。不一致就会出现两类幽灵故障：写进去了却读不出来，或者本该拒绝的写入放行了。

风险点：

| 项         | 陷阱                                                 |
| ---------- | ---------------------------------------------------- |
| NULL       | SQL 三值逻辑：`NULL != 'x'` 不为真。JS 的 `!==` 为真 |
| 字符串比较 | 数据库排序规则决定大小写敏感性；八种方言默认值不同   |
| 日期       | 时区与精度截断，`datetime` 与 `datetimeTz` 行为不同  |
| 数值       | BigInt 与 Decimal 的精度，JS number 会丢             |
| 布尔       | 部分方言用 0/1 存储，读出来需要 `decodeBooleanRow`   |

做法：

- 先按 0.7 的结论确定允许的操作符集合，**拿不准的直接不允许进 `Scope`**，而不是求值器里猜
- 写**差分测试**：同一批记录、同一个 scope，分别走内存求值和 `SELECT ... WHERE <scope>`，断言两边挑出的行完全相同；八种方言各跑一遍
- 求值器和 SQL 构造器共用同一份操作符语义表，不要各写一套

</details>

### 1.5 filter 合并与来源区分

- 合并函数：调用方 filter **整体包成 group**，与 scope group 取 AND，不打平
- 接入所有构造 filter 的位置：读方法、`lockByFilter`、`lockManyByFilter`、`updateMany` / `deleteMany` 的快路径
- 调用方条件与 policy 条件必须可区分，否则 scope 里的 `tenantId` 会被 `read.fields` 自己拒掉

**实现方式与原设计不同，结论相同。** 原计划给 `FilterNode` 加 `origin: 'caller' | 'policy'` 标记。实际实现改为**结构性区分**：调用方 filter 与 policy scope 自始至终是两个独立的值，校验只遍历前者，合并发生在校验之后且不再回头校验。

这不是「合并前先校验」的时序技巧——设计文档警告的是那种做法，理由是嵌套关系与 `combine` 分支会让时序假设失效。这里没有时序假设可失效：`scopeCallerFilterGroup` 接收的永远是调用方那个值，policy scope 走的是另一条路径，两者在类型和调用图上都分得开。关系分支的 scope 注入也发生在同一次递归里，注入点之后不再有校验。

代价是没有一个可以在运行时检视的来源标记。收益是 `@nocobase/repository-input` 的公开 `FilterAst` 不变（决策 0.5），且少了一个「标记漏打」的失败模式。若将来出现调用方与 policy 条件真正交织的构造，再引入标记。

### 1.6 写路径接入

按依赖顺序：

- `updateOne`：在 `lockByFilter` 之后、`update` 之前插入重判（用前像 + values 算后像）
- `createOne`：形状检查 → 应用 `create.defaults` → 插入 → 对 `createRecord` 返回的后像判 `create.scope`
- `upsertOne`：三分支，命中但越界抛 `RECORD_OUTSIDE_SCOPE`，不退化成插入
- `updateMany`：静态判定；`or` 分组被 values 触及或 scope 字段有原子操作时降级到 `lockManyByFilter`
- `deleteOne` / `deleteMany`：只加 WHERE，无后像判定
- 原子值例外：`refreshAtomicValues` 之后再判

### 1.7 绑定 API

- `ScopedRepository` 接口，与 `Repository` 共享操作方法基接口，**不是**其子类型
- `withPolicy` 两个重载
- `explainPolicy()`

阶段 1 不做 `narrow`（阶段 3）。

### 1.8 关系写入目标

`resolveMutationTarget` 与 `lockRelatedTarget` 的定位查询加上 `RelationWriteNode.scope`；关系 `update` 分支同样走写入后重判。

**未命中不使用独立错误码。** 原计划返回 `RELATION_TARGET_NOT_FOUND`，实际保留各条路径原有的未命中错误（`connect` / `disconnect` 走 `RECORD_NOT_FOUND`，关系 `update` / `delete` 走 `RELATION_TARGET_NOT_FOUND`）。理由是不变量 3：越界目标与不存在的目标必须给出完全相同的回答，否则调用方可以拿 ID 逐个试，通过关系把别的租户有哪些记录枚举出来。为越界单独设码，等于在关系这条路上重新开一个存在性预言机。

`toWritePolicy` 桥接（决策 0.9）**保留**：关系目标 scope 不经过旧 `WritePolicy` 结构，而是与 mutation AST 平行地下发一棵 `RelationScopeNode` 树，在适配器里与定位查询合并。旧结构装不下 scope 这件事因此不再构成拆桥的触发条件，拆除时机改由迁移（阶段 2 结束后的文档转正与消费方改造）决定。

### 阶段 1 验收

下列前五条都是关于**真实 SQL** 的断言，单元测试的假适配器在结构上证明不了，必须落在
`db-testkit/tests/integration/repository/policy/`，跟随八个 dialect 包执行。方言排期见
[数据库集成测试](../../../../../../../internal-docs/development/database-integration-testing.md)：
SQLite、PostgreSQL、MySQL、Kingbase 可并发；OceanBase、Oracle、MSSQL、Dameng 必须串行。

- [ ] 生成的 SQL 含 scope 条件，且不存在「先查全量再内存过滤」的路径
- [ ] 调用方 `or` 分组与 scope 合并为 `(A OR B) AND scope`
- [ ] 越权与不存在的响应**逐字节相同**：`findOne` 返回 `null`，`findMany` / `count` / `exists` 不含该行，`updateOne` / `deleteOne` 抛 `RECORD_NOT_FOUND`，`updateMany` / `deleteMany` 计 0 不报错
- [ ] 未触及 scope 字段的 update 零额外查询（断言查询次数）
- [ ] 触及 scope 字段的 update、以及全部 create，走重判并在越界时回滚
- [ ] 重判触发回滚后事务干净，不留半条记录
- [ ] 并发下重判发生在锁之后（照 `repository/methods/concurrent-writes.test.ts` 的模式）
- [ ] `create.defaults` 被调用方同名字段覆盖后由重判挡下；`defaults` 可设 `fields` 之外的字段
- [ ] scope 引用的字段取不到值时，配置阶段就报 `INVALID_POLICY`（不是运行时回滚）
- [ ] 关系 `connect` 越界目标返回 `RELATION_TARGET_NOT_FOUND`
- [ ] 目标 Collection 单独绑 `update: false` 时，经由关系的写入**不**被拒

## 阶段 2：读取形状

### 任务

- 2.1 `read.fields` / `read.relations` 的编译与校验（1.3 里预留的部分接入）
- 2.2 `select ∩ policy`：显式越权报 `FIELD_READ_FORBIDDEN` / `RELATION_READ_FORBIDDEN`
- 2.3 省略 `select` 时按 `read.fields` 裁剪
- 2.4 返回类型降级（按 0.6 的结论实现）
- 2.5 查询条件字段校验：`filter` / 关系 filter / `sort` / `distinct` / `cursor` / `groupBy.by` / `aggregate` / `having`，只遍历 `origin: 'caller'`
- 2.6 关系节点递归 + 关系 scope 进关系分支查询的 WHERE
- 2.7 `ref()` 展开与环检测
- 2.8 外键与关系的对称规则：关系可展开且 `fields` 含目标主键 ⇒ 视同外键可读

### 验收

- [ ] 写方法的 returning `select` 同样受 `read.fields` / `read.relations` 约束
- [ ] `sort` / `distinct` / `cursor` / `groupBy.by` / `aggregate` / `having` 同样受 `read.fields` 约束
- [ ] 显式请求越权字段报错，不静默裁剪
- [ ] 省略 select 时裁剪，且关系仍不自动展开
- [ ] `exists({ filter: { budget: ... } })` 被 2.5 拒绝
- [ ] 关系 scope 不减少根记录数
- [ ] `ref` 成环时编译报错

## 阶段 3：绑定层与 HTTP

### 任务

- 3.1 `ScopedConnection` 与 `conn.withPolicies(map, principal)`
- 3.2 事务内派生的 Repository 自动携带 policy
- 3.3 `narrow` 与归并算法（`false` 传播、`fields` 取交、patch 独有关系丢弃）
- 3.4 HTTP：`RepositoryApiActions` 的读写 action 统一加 `policy` 位
- 3.5 HTTP：请求体出现 `policy` / `scope` 一律 400

**「缺省拒绝」已随迁移落地。** `policy` 位最初加在九个 action 上、声明则绑定，迁移时上移到 exposure 并改为必填：一个 exposure 只有一份 Policy，管它全部的 action。同一个改动里删掉了路由层的 `writePolicy`，并补上 `principal`——没有它，Policy 只能表达常量 scope，多租户和「只看自己的」写不出来，新的位置不过是更啰嗦的 `writePolicy`。

3.5 **不需要新代码**：`readInput` 早已按 `allowedOptions[action]` 逐键白名单校验请求体，`policy` 和 `scope` 都不在任何 action 的列表里，因此一律 400 `UNSUPPORTED_REPOSITORY_OPTION`。已补测试把这条钉住，免得日后有人放宽白名单时无声打开这个口子。

- 3.6 `explainPolicy()` 覆盖多层 `narrow` 的归并结果

### 验收

- [ ] `withPolicies` 未覆盖的 Collection 抛 `POLICY_REQUIRED`
- [ ] 事务内外 policy 一致
- [ ] `narrow` 无法放宽任何一维（scope / fields / relations / 节点级 `false`）
- [ ] `explainPolicy()` 与手工归并结果一致

## 阶段 4：加固

- 4.1 `requireScope`（位置按 0.4）
- 4.2 `read.scope` 开放关系路径与关系量词
- 4.3 可序列化的 policy 模板（存库的角色配置）

阶段 4 三项互相独立，按需要排期。

## 进度

| 阶段                 | 状态   | 说明                                                                            |
| -------------------- | ------ | ------------------------------------------------------------------------------- |
| 阶段 0 决策与 spike  | 已完成 | 0.1 / 0.5 / 0.6 已定，另补记 0.8 / 0.9；0.7 因改为 SQL 重判而不再适用           |
| 阶段 1 行范围        | 已完成 | 1.4 改为 SQL 重判，1.5 改为结构性区分来源，1.8 未命中沿用既有错误码；其余按设计 |
| 阶段 2 读取形状      | 已完成 | 2.1–2.8 全部落地，含 `ref()` 展开与外键对称                                     |
| 阶段 3 绑定层与 HTTP | 已完成 | 3.1–3.6 落地；HTTP 的「缺省拒绝」随迁移落地，`policy` 位上移到 exposure         |
| 阶段 4 加固          | 未开始 | `requireScope`、`read.scope` 的关系路径、可序列化模板三项互相独立，按需排期     |
| 迁移                 | 已完成 | HTTP 侧的 `writePolicy` 已删除；方法级选项保留，见下节                          |

## 迁移：替换 HTTP 层的 writePolicy

**已完成。** `defineRepositoryApiRoutes()` 的 action 配置不再有 `writePolicy`，每个 exposure 必须声明一份 Policy。落地时定下的四条，理由都记在这里，因为它们不是设计文档推导得出的：

| 决策                                    | 理由                                                                                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy` 在 exposure 上，不在 action 上 | 四个节点必填，放在 action 上意味着一个 collection 写九份可能互相矛盾的策略；更糟的是 `read` 节点同时管写方法的 returning select，`createOne` 上写 `read: false` 会让整个 create 403                               |
| 必填，缺省即拒绝                        | `writePolicy` 缺省是 `false`，而不绑定 Policy 等于不限制。可选的话，删掉 `writePolicy` 会把每一处既有声明从「拒绝一切写入」静默翻成「放行一切」                                                                   |
| 一并做 `principal`                      | 静态策略只能表达常量 scope。Policy 存在的理由就是多租户和数据归属，没有 principal 这个位置只是更啰嗦的 `writePolicy`                                                                                              |
| `ref()` 在这条路径上定义期拒绝          | 引用靠 `withPolicies` 那张 map 展开，而这里每个 exposure 绑一份；工厂策略下那张 map 只在请求期存在，展开就得把每个 exposure 的工厂在每个请求上都跑一遍。未展开的 ref 今天的表现是运行时 403，定义期报错已经是改善 |

同一个改动里顺手修掉的两处：

- **`create`/`update` 为 `false` 时的拒绝时机。** 原先 `resolveWriteShapeNode` 在 payload 规范化之后才跑，所以 `update: false` 加上 `values: {}` 报的是 400 `INVALID_MUTATION` 而不是 403。现在四个写方法都在读 payload 之前先判一次——调用方不该从一个它无权执行的写里学到 payload 的形状。
- **`create.relations` 里的无效操作。** 根级 create 在执行期只接受 `connect` 和 `create`，所以策略里给 `update`/`upsert`/`delete` 是永远用不上的配置。这条检查原来只在 HTTP 层（`assertCreateAllowance`），现在进了 `normalizeRepositoryPolicy`，对所有消费方生效。

**方法级 `writePolicy` 保留**，作为内部调用的单次额外收窄（设计文档本来也是这么说的），`toWritePolicy` 桥接同样保留（决策 0.9）。`db-testkit` 的 `relations/write-policy.test.ts` 测的仍是活着的 API，不重写。

`buildRepositoryPolicy` 是这次补的（决策 0.3）：`writePolicy` 的 callback builder 在 Policy 里没有等价物，而 `app-plugin-repository-example` 那份七种关系操作全开的声明改成对象字面量会长到没法读。未提及的节点等于 `false`，所以「四节点必填」不会变成每个 exposure 都要手写 `delete: false`。代价是字面量类型没了，`withPolicy` 的返回类型一律降级成 `Partial`。

## 关键路径

```text
阶段 0（决策 + 两个 spike）
   └─ 1.1 错误码 ─┬─ 1.2 类型 ─ 1.3 编译 ─┬─ 1.4 evaluateScope ⚠ ─┬─ 1.6 写路径 ─ 1.8 关系目标
                  │                        └─ 1.5 filter 合并 ────┘
                  └─────────────────────── 1.7 绑定 API
阶段 1 完成即可用
   ├─ 阶段 2（读取形状）
   ├─ 阶段 3（绑定层 + HTTP）
   └─ 迁移（可与 2、3 并行，但 db-testkit 契约测试先行）
阶段 4 按需
```

**1.4 是关键路径上的主要风险**，也是唯一一个「做错了不会立刻发现」的任务——内存求值与 SQL 语义不一致造成的故障会在很久以后以「数据明明写进去了却查不出来」的形式出现。差分测试不是可选项。

相关文档：

- [Policy 设计](./policies.md)
- [Policy 示例说明](./policies-examples.md)
- [Policy 参考](./policies-reference.md)
- [Policy 执行细节](./policies-internals.md)
- [Policy 实施清单](./policies-roadmap.md)
