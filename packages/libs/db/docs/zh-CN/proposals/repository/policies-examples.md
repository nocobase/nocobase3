---
title: Policy 示例说明
description: 从没有 Policy 的现状出发，逐层加入 scope、写入后重判、字段白名单、关系与查询条件校验，每一层给出实际 SQL、返回值与错误。
---

# Policy 示例说明

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：阶段 1 至阶段 3 已实现**，见 `db/src/repository/policy/`、`db-testkit/tests/integration/repository/policy/` 与 [实施清单](./policies-roadmap.md) 的逐项进度。本组文档仍在 `proposals/` 下：转为正式文档并入 `docs/zh-CN/repository/` 与消费方迁移一并进行，在那之前 [Write policy](../../repository/write-policy.md) 描述的方法级 `writePolicy` 仍然有效，两者并存。

本文是 [Repository Policy](./policies.md) 的配套说明，按层次递进：每一节只加入一个概念，并保持前面各层继续生效。设计依据与取舍理由在设计文档里，这里只讲"写成什么样、跑出什么结果"。

## 贯穿全文的数据

`projects`：

| id  | title      | status    | tenantId | ownerId | budget |
| --- | ---------- | --------- | -------- | ------- | ------ |
| p1  | 官网改版   | draft     | T1       | u1      | 50000  |
| p2  | 内部工具   | published | T1       | u2      | 120000 |
| p3  | 迁移计划   | archived  | T1       | u1      | 30000  |
| p4  | 别家的项目 | draft     | T2       | u9      | 8000   |

`tasks`：

| id  | title    | completed | projectId | assigneeId |
| --- | -------- | --------- | --------- | ---------- |
| t1  | 设计稿   | false     | p1        | u1         |
| t2  | 切图     | true      | p1        | u2         |
| t3  | 需求梳理 | false     | p2        | u2         |
| t4  | 数据盘点 | false     | p4        | u9         |

`users`：

| id  | name | email          | tenantId |
| --- | ---- | -------------- | -------- |
| u1  | 张三 | zhang@acme.com | T1       |
| u2  | 李四 | li@acme.com    | T1       |
| u9  | 王五 | wang@other.com | T2       |

**当前身份：租户 `T1`，用户 `u1`。** 后面所有示例都以此为前提。

## 第 0 层：没有 Policy 的现状

今天要做租户隔离，只能在每个调用点手写条件：

```ts
const projects = db.repository('projects');

await projects.findMany({ filter: { tenantId: 'T1', status: 'draft' } });
await projects.count({ filter: { tenantId: 'T1' } });
await projects.updateOne({ filter: { id, tenantId: 'T1' }, values });
```

三个问题，一个比一个隐蔽：

```ts
// 一、漏写一处就是整张表
await projects.findMany({ filter: { status: 'draft' } });
// → [p1, p4]   p4 属于 T2，泄漏了

// 二、createOne 根本没有 filter 参数，手写条件这条路走不通
await projects.createOne({ values: { title: '新项目' } });
// → 写出一条 tenantId 为 null 的记录

// 三、条件筛对了，值却能写错
await projects.updateOne({
  filter: { id: 'p1', tenantId: 'T1' },
  values: { tenantId: 'T2' },
});
// → 筛的是自己租户的行，改完记录跑到别人租户去了
```

第二和第三个问题说明：**行范围不是靠 `filter` 能表达完的东西**。下面逐层把它变成一个独立的、绑在实例上的概念。

## 第 1 层：read.scope

绑定一次，之后所有读取自动收窄：

```ts
const projects = db.repository('projects').withPolicy({
  read: { scope: { tenantId: 'T1' } },
  create: true,
  update: true,
  delete: true,
});
```

四个节点一个都不能少——**调用 `withPolicy` 就必须把话说完**，缺一个是 TypeScript 编译错误。这一层只讲读取，所以另外三个显式写 `true`（不限制），后面几层会逐个替换掉它们。`fields` 和 `relations` 是白名单，省略即禁止；这里省略 `fields`，表示这一层不返回任何根级标量字段。为了让后面的读取示例可读，实际完整 policy 会显式列出字段。

如果允许省略，`withPolicy({ read: { scope: { tenantId: 'T1' } } })` 就是一个读取受控、删除完全敞开的 Repository，而它看起来像是配过权限的。

```ts
await projects.findMany({ filter: { status: 'draft' } });
```

```sql
SELECT * FROM projects WHERE status = 'draft' AND tenant_id = 'T1'
```

```text
→ [p1]
```

p4 也是 draft，但不在 T1，看不到了。**调用方的 `filter` 与 scope 取 AND，不是覆盖**（不变量 1）。

收窄对**所有**读路径一视同仁，不只是 `findMany`：

```ts
await projects.count({}); // → 3   （p1 p2 p3，不含 p4）
await projects.exists({ filter: { id: 'p4' } }); // → false
await projects.findOne({ filter: { id: 'p4' } }); // → null

await projects.aggregate({ aggregate: (a) => ({ total: a.sum('budget') }) });
// → { total: 200000 }   50000 + 120000 + 30000，不含 p4 的 8000

await projects.groupBy({
  by: ['status'],
  aggregate: (a) => ({ n: a.count() }),
});
// → [{ status: 'draft', n: 1 }, { status: 'published', n: 1 }, { status: 'archived', n: 1 }]
//   p4 是 draft，但没有计进去
```

这不是"顺带也生效"，而是**必须生效**：`count` 和 `exists` 一个字段都不返回，却照样能回答"p4 存在吗"。只作用于 `findMany` 的 scope 等于没有 scope。同样的道理，关系上的聚合按关系节点的 scope 收窄，分页聚合在收窄之后计算——第 7 层会把这条推到底。

`all: true` 也不例外——它表示"scope 范围内的全部记录"：

```ts
await projects.count({ all: true }); // → 3，不含 p4
```

注意这一层的 `update` 还是 `true`，所以**写操作此刻完全不受限**——`read.scope` 只收窄读取，不会顺带约束写入。写侧的范围要到下一层声明 `update.scope` 才有。

## 第 2 层：写入与删除的 scope

读写删各自独立声明，互不继承：

```ts
const projects = db.repository('projects').withPolicy({
  read: { scope: { tenantId: 'T1' } },
  create: true,
  update: { scope: { tenantId: 'T1', ownerId: 'u1' } },
  delete: { scope: { tenantId: 'T1', ownerId: 'u1', status: 'draft' } },
});
```

读得到不等于改得了：

```ts
await projects.findOne({ filter: { id: 'p2' } });
// → { id: 'p2', title: '内部工具', ... }   p2 在 T1，读得到

await projects.updateOne({ filter: { id: 'p2' }, values: { title: 'X' } });
```

```sql
UPDATE projects SET title = 'X'
WHERE id = 'p2' AND tenant_id = 'T1' AND owner_id = 'u1'
-- 0 行
```

```text
→ RepositoryError: RECORD_NOT_FOUND    HTTP 404
```

**注意这里是 404 而不是 403**（不变量 3）。p2 明明存在，调用方也确实看得到它，为什么不说"你没权限"？因为同一套规则要覆盖 p4：

```ts
await projects.updateOne({ filter: { id: 'p4' }, values: { title: 'X' } });
// → RECORD_NOT_FOUND    与上面完全相同
```

如果越权返回 403、不存在返回 404，攻击者拿 id 逐个试，两种响应的差别就足以把别的租户有哪些记录枚举出来。把两者做成不可区分，是用一点调试便利换掉一个存在性预言机。

排查靠日志而不是靠响应体：

```text
[debug] repository.policy: projects.updateOne matched 0 rows,
        scope = { tenantId: 'T1', ownerId: 'u1' }
```

这条只进 logger，不进返回值，也不进 HTTP 响应。

删除同理，`delete.scope` 比 `update.scope` 更严：

```ts
await projects.deleteOne({ filter: { id: 'p3' } });
// p3 是 u1 的，但 status = 'archived' ≠ 'draft'
// → RECORD_NOT_FOUND

await projects.deleteOne({ filter: { id: 'p1' } });
// p1：T1 ✓ u1 ✓ draft ✓
// → 删除成功
```

批量删除不报错，只是数字变小：

```ts
await projects.deleteMany({ all: true });
// WHERE tenant_id='T1' AND owner_id='u1' AND status='draft'
// → { count: 1 }   只有 p1 符合
```

## 第 3 层：create.scope 与 defaults

`createOne` 没有 `filter`，所以 `create.scope` 不会变成 WHERE。它说的是另一句话：**新建的记录必须落在这个范围内**。

但 scope 只做**判定**，它不提供值。新记录的 `tenantId` 从哪来？靠 `defaults`：

```ts
const projects = db.repository('projects').withPolicy({
  read: { scope: { tenantId: 'T1' } },
  create: {
    scope: { tenantId: 'T1', ownerId: 'u1' }, // 判定：必须满足
    defaults: { tenantId: 'T1', ownerId: 'u1' }, // 赋值：没给就填
    fields: ['title', 'budget'],
  },
  update: { scope: { tenantId: 'T1', ownerId: 'u1' } },
  delete: true,
});
```

```ts
await projects.createOne({ values: { title: '新项目', budget: 10000 } });
```

```sql
INSERT INTO projects (title, budget, tenant_id, owner_id)
VALUES ('新项目', 10000, 'T1', 'u1')
```

调用方没有提交 `tenantId` 和 `ownerId`，也不需要知道它们存在。不赋值会怎样？会创建出一条创建者自己都找不到的记录——`tenantId` 为 null，下一次 `findMany` 就把它过滤掉了。

### 为什么是两个字段而不是一个

早先的设计只写 `scope`，由它自动反推赋值——把顶层 AND 的等值条件注入新记录。看起来省了一次声明，实际上是把**判定**当成了**赋值**，而且只对一种语法形状有效：

```ts
// 这个能反推
scope: { tenantId: 'T1' }

// 这个反推不出来，注入静默失效
scope: <AST: tenantId $ne null>
```

一个依赖条件语法形状、失效时还不报错的机制，产出的就是"我测的时候是好的"。拆成两个字段之后，`defaults` 与 scope 写多复杂完全无关。

重复一个值的代价，抽个变量就没了：

```ts
const mine = { tenantId: 'T1', ownerId: 'u1' };
create: { scope: mine, defaults: mine, fields: ['title'] }
```

而且 `defaults` 能设 scope 里根本没有的字段，这是反推永远做不到的：

```ts
create: {
  scope: { tenantId: 'T1' },
  defaults: { tenantId: 'T1', createdBy: 'u1', source: 'web' },
  fields: ['title'],
}
```

### defaults 与 fields 的四种组合

`defaults` 在**调用方没提供该字段时**应用，能不能提供由 `fields` 决定：

| `defaults` | 在 `fields` 里 | 效果                                                |
| ---------- | -------------- | --------------------------------------------------- |
| 有         | 否             | **强制赋值**，调用方无法覆盖——租户隔离要的就是这个  |
| 有         | 是             | **真正的默认值**，调用方可覆盖，覆盖后受 scope 重判 |
| 无         | 是             | 调用方自己提供，否则走数据库默认值                  |
| 无         | 否             | 完全由数据库默认值决定                              |

```ts
// 第一行：tenantId 不在 fields 里
await projects.createOne({ values: { title: 'X', tenantId: 'T2' } });
// → FIELD_WRITE_FORBIDDEN，调用方碰不到这个字段

// 第二行：status 既有默认值又可提交
create: { scope: tenant, defaults: { ...tenant, status: 'draft' }, fields: ['title', 'status'] }
await projects.createOne({ values: { title: 'X' } });            // status = 'draft'
await projects.createOne({ values: { title: 'X', status: 'published' } }); // status = 'published'
```

### 为什么不从 read / update 借

一个很自然的想法是让 create 复用别的节点的 scope，省掉一次声明。它不成立：

```ts
update: { scope: { tenantId: 'T1', status: 'draft' } },   // 只能改草稿
```

`update.scope` 里的 `status: 'draft'` 说的是「**能修改**草稿状态的记录」，不是「**新建**的记录必须是草稿」。借过来当初始值，等于静默强制每条新项目都是草稿。两个来源冲突时（例如 `read` 写 `T1` 而 `update` 误写 `T2`）也没有定义良好的结果。

所以 create 有自己的 scope，而且和其它三个一样**必填**：

```ts
create: { defaults: { tenantId: 'T1' }, fields: ['title'] }
// → INVALID_POLICY: create 节点缺少 scope

create: { scope: true, fields: ['title', 'assigneeId'] }
// 显式豁免：允许创建一条自己看不到的记录，例如向别的部门提交工单
```

### 取不到值的字段会在配置阶段被拦下

scope 不提供值，所以每个被它引用的字段都得有来源。配置阶段就检查：

```ts
// ❌ INVALID_POLICY
create: {
  scope: <AST: status $ne 'archived'>,
  fields: ['title'],       // status 不在 fields，也没有 defaults
}
```

`status` 赋不到值、提交不了，只能取数据库默认值。默认值若恰好是 `'archived'`，这个 create **永远不可能成功**——每次调用都插入、重判、回滚，而错误信息指向 `values`，调用方根本改不了。

三条信息全是静态的（scope 引用哪些字段、`fields` 有哪些、默认值是什么），没有理由拖到运行时。规则是：

> scope 引用的每个字段，必须在 `defaults` 里、在 `fields` 里、或有满足条件的数据库字面量默认值。

两种修法都合法，选哪个取决于业务：

```ts
// 服务端定死
create: { scope: <status $ne 'archived'>, defaults: { status: 'draft' }, fields: ['title'] }

// 让调用方决定，值不对时写入后重判挡下
create: { scope: <status $ne 'archived'>, fields: ['title', 'status'] }
```

## 第 4 层：写入后重判（最关键的一层）

前三层只约束了"能碰哪些行"。但筛对了行，值仍然可以写错——第 0 层的第三个问题还没解决：

```ts
await projects.updateOne({ filter: { id: 'p1' }, values: { ownerId: 'u2' } });
```

`update.scope` 是 `{ tenantId: 'T1', ownerId: 'u1' }`，p1 完全符合，WHERE 会命中。如果到此为止，这次调用就成功了——用户把自己的项目转给了李四，而且转完之后自己再也管不了它。

**不变量 2：写入后的记录必须仍满足本次操作的 scope，否则在同一事务内回滚。**

执行变成三步：

```text
1. 锁定（事务内）
   SELECT <全部标量字段> FROM projects
   WHERE id='p1' AND tenant_id='T1' AND owner_id='u1'
   LIMIT 2 FOR UPDATE                      → 命中 1 行 ✓，前像在手

2. 算后像：{ ...前像, ...values }
   tenantId = 'T1'  ✓
   ownerId  = 'u2'  ✗   期望 'u1'

3. UPDATE 还没发出，事务回滚
```

第 1 步已经把整行读进内存并加了行锁，所以第 2 步是**纯内存判定，零额外查询**——甚至在 UPDATE 发出之前就失败了。这是 scope 限定为本表标量条件换来的；执行细节见[执行细节](./policies-internals.md)。

```text
→ RepositoryError: SCOPE_VIOLATION    HTTP 403
   path: ['values', 'ownerId']
```

这里返回 403 而不是 404，并且不违反不变量 3：记录本身调用方看得见、也确实有权修改，被拒绝的是他提交的**值**，不泄漏任何存在性。

同一条规则也管住第 0 层的跨租户改写：

```ts
await projects.updateOne({ filter: { id: 'p1' }, values: { tenantId: 'T2' } });
// 写入后 tenantId = 'T2'，不满足 update.scope → SCOPE_VIOLATION
```

以及第 3 层的 create 兜底：

```ts
await projects.createOne({ values: { title: 'X' } });
// 注入不出 tenantId 时，写入后按 create.scope 重判，把它挡下来
```

**一条规则同时覆盖了 create、update、upsert 的全部写入侧提权。**

### 它不需要额外开关

一个很自然的疑问：那业务上确实允许同租户内转让项目怎么办？答案是**改 scope，不是加开关**：

```ts
const projects = db.repository('projects').withPolicy({
  read: { scope: { tenantId: 'T1' } },
  create: {
    scope: { tenantId: 'T1' },
    defaults: { tenantId: 'T1' },
    fields: ['title'],
  },
  update: { scope: { tenantId: 'T1' } }, // 按租户，不按人
  delete: { scope: { tenantId: 'T1', ownerId: 'u1', status: 'draft' } },
});

await projects.updateOne({ filter: { id: 'p1' }, values: { ownerId: 'u2' } });
// 1. WHERE id='p1' AND tenant_id='T1'   → 命中 ✓
// 2. 重判：tenantId 仍是 'T1' ✓
// → 转让成功
```

而跨租户改写照样被挡：

```ts
await projects.updateOne({ filter: { id: 'p1' }, values: { tenantId: 'T2' } });
// → SCOPE_VIOLATION
```

**松紧完全由你写的 scope 决定。** 不存在"某个字段因为出现在 scope 里所以被锁死"这种连带效果，也就不需要放行开关。

### 不归 Policy 管的那一类

```ts
delete: { scope: { tenantId: 'T1', ownerId: 'u1', status: 'draft' } },
update: { scope: { tenantId: 'T1', ownerId: 'u1' }, fields: ['title', 'status'] },
```

```ts
await projects.updateOne({
  filter: { id: 'p1' },
  values: { status: 'published' },
});
// 1. WHERE ... → 命中 p1 ✓
// 2. 重判 update.scope：tenantId ✓ ownerId ✓   （update.scope 里没有 status）
// → 成功。此后 p1 离开了 delete.scope，删不掉了
```

这是**正确结果**，不是漏洞：用户失去了删除能力，没有获得任何权限。反过来把 `published` 改回 `draft` 再删掉，算不算绕过？那是"这个状态转换合不合法"的问题，属于字段与记录级 validation 或状态机，不属于 Policy。

Policy 回答"谁能碰哪些行、哪些字段"，到此为止。把状态机也塞进来，会让权限配置里冒出一堆与权限无关的连带限制。

## 第 5 层：字段白名单

到这一层为止，范围（行）已经完整了。接下来是形状（字段与关系）。

```ts
const projects = db.repository('projects').withPolicy({
  read: {
    scope: { tenantId: 'T1' },
    fields: ['id', 'title', 'status'],
  },
  create: {
    scope: { tenantId: 'T1' },
    defaults: { tenantId: 'T1' },
    fields: ['title'],
  },
  update: {
    scope: { tenantId: 'T1', ownerId: 'u1' },
    fields: ['title', 'status'],
  },
  delete: { scope: { tenantId: 'T1', ownerId: 'u1', status: 'draft' } },
});
```

### 显式请求越权字段：报错

```ts
await projects.findMany({
  select: (s) => s.fields('id', 'title', 'budget'),
});
// → RepositoryError: FIELD_READ_FORBIDDEN
//    path: ['select', 'fields', 2]   field: 'budget'
```

**不静默把 `budget` 删掉。** 静默裁剪会让调用方拿到一个看起来正常、实际少了字段的结果，问题要到很远的地方才暴露。

### 省略 select：裁剪

```ts
await projects.findMany({});
// → [{ id: 'p1', title: '官网改版', status: 'draft' }, ...]
//   budget、tenantId、ownerId 都不返回
```

同一份 policy，一边报错一边裁剪，是有意的：**省略 `select` 表示"由服务端决定返回什么"，不是"请求全部字段"。**

### 类型只在形状真的变了时降级

```ts
// 只绑 scope：行数变了，字段没变
const a = db.repository('projects').withPolicy({
  read: { scope: { tenantId: 'T1' } },
  create: true,
  update: true,
  delete: true,
});
const rows = await a.findMany({});
// rows: Project[]

// 绑了 fields：字段真的少了
const b = db.repository('projects').withPolicy({
  read: { scope: { tenantId: 'T1' }, fields: ['id', 'title'] },
  create: true,
  update: true,
  delete: true,
});
const rows2 = await b.findMany({});
// rows2: Partial<Project>[]
```

不想要这个降级，就显式写 `select`，类型照常精确推导。

### 写入侧

```ts
await projects.updateOne({
  filter: { id: 'p1' },
  values: { title: '新标题', budget: 99999 },
});
// → FIELD_WRITE_FORBIDDEN    path: ['values', 'budget']
```

`create` 与 `update` 的白名单独立：`create.fields` 只有 `title`，所以创建时连 `status` 都不能提交，初始状态交给数据库默认值或服务端赋值。

三态的区别：

```ts
create: {
  fields: ['title'];
} // 只能提交 title
create: {
} // 空白名单：一个字段都不能提交，
//   但仍可 createOne({ values: {} }) 触发数据库默认值
create: false; // 整个 createOne 被拒绝，values 求值前就返回 WRITE_FORBIDDEN
create: true; // 不增加限制（内部 Repository 的缺省值）
```

## 第 6 层：关系

### 读：递归的节点

```ts
const projects = db.repository('projects').withPolicy({
  read: {
    scope: { tenantId: 'T1' },
    fields: ['id', 'title', 'status'],
    relations: {
      owner: { fields: ['id', 'name'] },
      tasks: {
        scope: { assigneeId: 'u1' },
        fields: ['id', 'title', 'completed'],
      },
    },
  },
  create: true,
  update: true,
  delete: true,
});
```

`ReadNode` 在根和每一级关系上是同一个类型，所以关系节点同样可以有自己的 `scope`、`fields` 和下一层 `relations`。

**策略不会自动展开关系**，它只决定"请求得到批准吗、最多能返回什么"：

```ts
await projects.findMany({});
// → [{ id, title, status }, ...]    owner 和 tasks 都不返回
```

要拿到关系，仍然得自己请求：

```ts
await projects.findMany({
  select: (s) =>
    s
      .fields('id', 'title')
      .include('owner', (o) => o.fields('id', 'name'))
      .include('tasks', (t) =>
        t.fields('id', 'title').filter({ completed: false }),
      ),
});
```

```text
→ [
    {
      id: 'p1', title: '官网改版',
      owner: { id: 'u1', name: '张三' },
      tasks: [{ id: 't1', title: '设计稿' }]
    },
    ...
  ]
```

`t2` 属于 p1，但 `assigneeId = 'u2'`，被关系节点的 scope 挡住了。关系范围的算法和根一样：

```text
关系范围 = 关系局部 filter AND 关系节点的 scope
         = { completed: false } AND { assigneeId: 'u1' }
```

越权的关系同样报错，不静默丢弃：

```ts
await projects.findMany({
  select: (s) => s.include('members', (m) => m.fields('id')),
});
// → RELATION_READ_FORBIDDEN    relation: 'members'
```

### 外键和关系要一起看

```ts
read: {
  fields: ['id', 'title'],              // 不含 ownerId
  relations: { owner: { fields: ['id', 'name'] } },
}
```

调用方 include 一下 `owner` 就拿到了 `owner.id`，等于读到了 `ownerId`。所以规则是：**关系节点允许展开且其 `fields` 含目标主键时，视同对应外键可读。** 与其指望配置的人记住，不如让规则自己算出来。

反向不成立：`ownerId` 可读不蕴含 `owner` 可展开，因为 owner 上还有 `email` 之类的别的字段。

### 跨路径不自动继承，用 ref 复用

`projects.read.relations.tasks` 和 `tasks` 自己的 `read` 是两份独立声明——经由关系到达和直接查询，权限互不影响。但两份手写的声明必然漂移，所以：

```ts
const policies = definePolicies({
  tasks: {
    read: { scope: { assigneeId: 'u1' }, fields: ['id', 'title', 'completed'] },
  },
  projects: {
    read: {
      scope: { tenantId: 'T1' },
      fields: ['id', 'title'],
      relations: { tasks: ref('tasks') },
    },
  },
});
```

`ref` 在编译阶段展开并检测环，不是运行时解引用。

### 写：关系操作逐项声明

```ts
update: {
  scope: { tenantId: 'T1', ownerId: 'u1' },
  fields: ['title'],
  relations: {
    tasks: {
      scope: { tenantId: 'T1' },     // 能定位到哪些既有 task
      create: { fields: ['title'] },
      update: { fields: ['title', 'completed'] },
      connect: {},
      disconnect: {},
      // 没有声明 delete，所以关系删除被禁止
    },
  },
}
```

```ts
await projects.updateOne({
  filter: { id: 'p1' },
  values: {
    title: '改版 v2',
    tasks: { create: [{ title: '新任务' }] },
  },
});
// → 成功

await projects.updateOne({
  filter: { id: 'p1' },
  values: { tasks: { delete: [{ id: 't2' }] } },
});
// → RELATION_WRITE_FORBIDDEN    relation: 'tasks', operation: 'delete'
```

每个 `create` / `update` 节点有独立的 `fields` 和 `relations`，上级授权不继承也不合并。

与读侧对称的一条：**允许 `owner.connect` 不等于允许写 `ownerId`**。如果同时把 `ownerId` 放进 `fields`，调用方就可以绕过关系直接写外键。

### 关系节点的 scope 挡的是什么

`tasks` 节点上那个 `scope` 不是装饰。根记录的 scope 只约束根记录，关系操作里的目标是按选择器**直接从目标表定位**的：

```ts
// 若 tasks 节点没有 scope
await projects.updateOne({
  filter: { id: 'p1' },
  values: { tasks: { connect: [{ id: 't4' }] } },
});
// 根 scope 挡住了 p1 以外的 project
// 但 t4 属于 p4（T2 租户），它是从 tasks 表直接查出来的，没经过任何范围判断
// → 别家的 task 被挂到了自己的 project 上
```

加上 `scope: { tenantId: 'T1' }` 之后：

```ts
// t4 的 tenantId 是 'T2'，定位不到
// → RELATION_TARGET_NOT_FOUND（404，与"这条 task 不存在"不可区分）

await projects.updateOne({
  filter: { id: 'p1' },
  values: { tasks: { connect: [{ id: 't3' }] } },
});
// t3 属于 p2，同租户 → 成功
```

`create` 不受这个 scope 约束——新建的 task 由关系键决定归属，必然挂在 `p1` 下面。受约束的是 `connect` / `disconnect` / `set` / `delete`，以及关系的 `update` / `upsert` 能改哪些既有目标。

### 目标 Collection 自己的 Policy 不参与

这条要单独说清楚，因为它反直觉：

```ts
// 即使另有一份限制严格的 tasks policy，上面那次 connect 也不会去查它
const tasks = conn.repository('tasks').withPolicy({ update: false, ... });
```

调用方手上只有 `projects` 这一个实例，关系操作没有第二份 policy 可用。所以**给 `relations.tasks` 授权，就是在替 `tasks` 表做授权决定**。

这和读侧"跨路径不自动继承"是同一条规则的两侧，但写侧更要紧——读最多是泄漏，写是改数据。配 `relations` 的时候要当成在配目标表的权限，`scope` 这一项尤其不能省。

## 第 7 层：查询条件也会泄漏

`read.fields` 限制的是返回内容，但查询本身照样能问出字段值：

```ts
const projects = db.repository('projects').withPolicy({
  read: { scope: { tenantId: 'T1' }, fields: ['id', 'title', 'status'] },
  create: true,
  update: true,
  delete: true,
});

await projects.exists({ filter: (f) => f.number('budget').gt(100000) });
// 一个字段都没返回，却回答了"有没有预算超过 10 万的项目"
// 二分几次就能问出 p2 的具体预算
```

所以校验范围要扩大到所有出现字段名的位置：

```ts
await projects.findMany({ filter: (f) => f.number('budget').gt(100000) });
// → FIELD_READ_FORBIDDEN    path: ['filter', 'budget']

await projects.findMany({ sort: (s) => s.field('budget').desc() });
// → FIELD_READ_FORBIDDEN    path: ['sort', 0]

await projects.groupBy({
  by: ['budget'],
  aggregate: (a) => ({ n: a.count() }),
});
// → FIELD_READ_FORBIDDEN    path: ['by', 0]
```

`filter`、关系 filter、`sort`、`distinct`、`cursor`、`groupBy.by`、`aggregate`、`having` 全部适用。

### 为什么实现上需要 origin 标记

合并之后的 filter 长这样：

```text
AND
├── status = 'draft'        ← 调用方写的
└── tenant_id = 'T1'        ← policy 注入的
```

`tenantId` 不在 `read.fields` 里。如果对合并后的树统一做字段校验，**policy 会拒绝它自己注入的条件**。

所以每个节点带来源标记，只校验 `origin: 'caller'` 的那些：

```ts
{ kind: 'condition', path: ['status'],   operator: '$eq', value: 'draft', origin: 'caller' }
{ kind: 'condition', path: ['tenantId'], operator: '$eq', value: 'T1',    origin: 'policy' }
```

不能用"合并前先校验、合并后不校验"的时序技巧代替——嵌套关系的局部 filter 和 `combine` 分支会在合并之后才展开，时序假设在那里失效。

### 不做的事

第一版不支持"允许搜索但不允许返回"。真的需要时另开 `read.filterableFields`，不让 `read.fields` 隐式承担这个例外——一个字段白名单同时管两件事，很快就说不清它到底在管什么。

## 第 8 层：边界情况

### upsert：唯一一处返回"越权"的地方

`upsertOne` 的 `filter` 必须恰好等于一个主键或唯一字段集，scope 不能并进去，否则唯一性判定就被破坏了。

```ts
const projects = db.repository('projects').withPolicy({
  read: { scope: { tenantId: 'T1' } },
  create: {
    scope: { tenantId: 'T1' },
    defaults: { tenantId: 'T1' },
    fields: ['id', 'title'],
  },
  update: { scope: { tenantId: 'T1' }, fields: ['title'] },
  delete: false,
});

await projects.upsertOne({
  filter: { id: 'p4' }, // p4 属于 T2
  create: { id: 'p4', title: 'X' },
  update: { title: 'X' },
});
```

```text
1. 按 id = 'p4' 锁定 → 行存在
2. 判 update.scope：tenantId = 'T2' ≠ 'T1' ✗
3. → RECORD_OUTSIDE_SCOPE    HTTP 409
```

这是全文唯一一处"存在但越权"给出可区分响应的地方，有意为之：如果按不变量 3 退化成插入，唯一约束必然报 duplicate key，"这个 id 已被占用"照样泄漏，只是换成了一个完全误导的错误。需要隐藏"键已占用"的场景不要用 upsert。

`id` 不冲突时走正常路径：

```ts
await projects.upsertOne({
  filter: { id: 'p9' },
  create: { id: 'p9', title: '新项目' },
  update: { title: '新项目' },
});
// 行不存在 → 走 create，注入 tenantId='T1' → 插入成功
```

### ifVersion 与 scope 同时不满足

```ts
await projects.updateOne({
  filter: { id: 'p4' },
  values: { title: 'X' },
  ifVersion: 3,
});
// → RECORD_NOT_FOUND，不是 VERSION_CONFLICT
```

先判 scope。否则"版本对不上"这个回答本身就说明了行的存在。

### 批量写入：先全检查，再开始写

```ts
await projects.createMany({
  values: [
    { title: 'A' },
    { title: 'B', budget: 1 }, // budget 不在 create.fields 里
  ],
});
// → FIELD_WRITE_FORBIDDEN    path: ['values', 1, 'budget']
// A 也没有被写入
```

形状检查在数据库操作之前完成，不会写一半再失败。写入后的 scope 重判在同一事务内，违反则整批回滚。

### 事务内的一致性

```ts
await db.transaction(async (conn) => {
  const repo = conn.repository('projects').withPolicy(policy);
  await repo.updateOne({ filter: { id: 'p1' }, values: { title: 'A' } });
  await repo.createOne({ values: { title: 'B' } });
});
```

Policy 绑在实例上，事务内派生的实例照常携带。写入后重判与业务写入在同一事务里，回滚是原子的。

## 第 9 层：实际怎么装配

Policy 由身份决定，所以在请求边界组装一次，业务代码只管表达意图。有两种写法，区别只在**身份是不是已经在作用域内**。

### 身份已在手边：直接写字面量

```ts
function projectsFor(actor: Actor, db: DatabaseConnection) {
  const tenant = { tenantId: actor.tenantId };
  const read = {
    scope: tenant,
    fields: ['id', 'title', 'status'],
    relations: { owner: { fields: ['id', 'name'] } },
  };

  if (actor.role === 'admin') {
    return db.repository('projects').withPolicy({
      read: { ...read, fields: ['id', 'title', 'status', 'budget'] },
      create: { scope: tenant, defaults: tenant, fields: ['title', 'budget'] },
      update: { scope: tenant, fields: ['title', 'status', 'budget'] },
      delete: { scope: tenant },
    });
  }

  const mine = { ...tenant, ownerId: actor.id };
  return db.repository('projects').withPolicy({
    read,
    create: { scope: tenant, defaults: tenant, fields: ['title'] },
    update: { scope: mine, fields: ['title'] },
    delete: { scope: { ...mine, status: 'draft' } },
  });
}
```

两个分支都把四个节点从头写了一遍。看起来啰嗦，但这正是能一眼看出"admin 比 member 多了什么"的原因——靠展开一个 `base` 再覆盖几个键的话，读的人得在脑子里做一次合并才知道 `delete` 到底是什么。

调用处看不到任何权限细节：

```ts
const projects = projectsFor(actor, conn);
await projects.findMany({ filter: { status: 'draft' } });
await projects.updateOne({ filter: { id }, values: { title } });
```

### 多个 Collection：绑在 Connection 上

一次请求很少只用一张表，而且事务里还要重新取 Repository。逐个绑定两样都别扭：

```ts
// ✗ 逐个绑
const projects = conn
  .repository('projects')
  .withPolicy(projectPolicy, principal);
const tasks = conn.repository('tasks').withPolicy(taskPolicy, principal);

await conn.transaction(async (tx) => {
  tx.repository('projects'); // 未绑定，policy 丢了
  // 重新绑一次也行，但没有任何地方能看出这次请求漏没漏绑某张表
});
```

把绑定上移一层：

```ts
const scoped = conn.withPolicies(
  { projects: projectPolicy, tasks: taskPolicy },
  principal,
);

await scoped.repository('projects').findMany({ filter: { status: 'draft' } });
await scoped.repository('tasks').updateOne({ filter: { id }, values });

scoped.repository('users');
// → POLICY_REQUIRED（users 标了 requireScope，而它不在 map 里）

await scoped.transaction(async (tx) => {
  await tx.repository('projects').updateOne({ filter: { id }, values });
  await tx.repository('tasks').createOne({ values }); // 事务内自动携带 policy
});
```

一处就能看出这次请求授权了哪些表——这也是 `requireScope` 最自然的检查点。单表场景 `repository().withPolicy()` 仍然可用。

### 身份还不存在：函数 + principal

HTTP 路由在**启动时**声明，那时没有任何请求，拿不到租户。这种场景用两个参数的重载：policy 写成函数，principal 每请求提供。

> **principal 是当前是谁**——认证中间件解析出来的身份对象。它不是 `@nocobase/db` 的概念：签名里只是个裸泛型 `P`，db 不读它的字段、不校验它、也不导出这个类型，只把你给的东西原样传给你自己的函数。上一节那种「身份已在作用域内」的写法完全用不到它。

```ts
// 启动时声明一次
const projectPolicy = (p: Principal) => ({
  read: { scope: { tenantId: p.tenantId }, fields: ['id', 'title', 'status'] },
  create: {
    scope: { tenantId: p.tenantId },
    defaults: { tenantId: p.tenantId },
    fields: ['title'],
  },
  update:
    p.role === 'admin'
      ? { scope: { tenantId: p.tenantId }, fields: ['title', 'status'] }
      : { scope: { tenantId: p.tenantId, ownerId: p.id }, fields: ['title'] },
  delete: p.role === 'admin' ? { scope: { tenantId: p.tenantId } } : false,
});

// 每个请求
const projects = conn
  .repository('projects')
  .withPolicy(projectPolicy, principal);
```

重载保证两个参数成对出现——写了函数忘了给 principal 是编译错误。函数在 `withPolicy` 时求值一次、结果冻结，不是每次方法调用重新求值；`async` 会返回 Promise，直接是类型错误。

**取值来自 principal，不是调用方的 `context`。** 这两个通道差别很大：

```ts
// ✗ 假设 scope 能引用调用 context，调用方就能改自己的范围
const scope = { ownerId: '$actor.id' };

repo.findMany({ context: { actor: { id: '别人的 id' } } });
```

所以 scope 不支持 context 变量。被拒的是那个通道，不是延迟绑定本身——上面这个重载就是延迟绑定，只不过取值来自认证中间件而非请求参数。

`Principal` 的字段声明成标量就够了，policy 不额外做运行时检查：

```ts
interface Principal {
  readonly id: string;
  readonly tenantId: string;
  readonly role: 'admin' | 'member';
}
```

`p.tenantId` 是 `string`，写进 `{ tenantId: p.tenantId }` 不可能变成操作符对象。这是 `filter` 简写语法的通用性质（`filter: { status: req.query.status }` 一样中招），该在认证层解决，不该由 policy 单独补一道。

### 再次收窄

某个接口要在身份之上再限一层，用 `narrow`。它接受任意子集，且只会更严：

```ts
const draftsOnly = projects.narrow({
  read: { scope: { status: 'draft' } },
});
// scope 取 AND  → { tenantId: 'T1', status: 'draft' }
// 其余节点未提及 → 保持不变
```

收窄是子集就行，不必填四个节点——这正是它和 `withPolicy` 分成两个方法的原因：**`withPolicy` 是完整声明，漏写一个节点是危险的；`narrow` 是叠加，漏写一个节点只是不收窄它。** 方法名说明了当前处在哪种契约里，不用靠"是不是已经绑过"去推断。

两种误用由类型直接挡住——未绑定的 `Repository` 上没有 `narrow`，已绑定的 `ScopedRepository` 上没有 `withPolicy`，所以重复绑定和"以为 narrow 能初始化权限"都是编译错误。

想放宽是做不到的，每一维都有对应的归并规则；多层叠加之后到底生效什么，用 `explainPolicy()` 查而不是心算：

```ts
draftsOnly.explainPolicy();
// → { read: { scope: { tenantId: 'T1', status: 'draft' }, fields: [...] },
//     create: {...}, update: {...}, delete: {...} }
```

归并规则逐维的说明、以及各种放宽尝试为什么无效，见 [Policy 参考](./policies-reference.md)。

### 让漏绑无法静默发生

上面的模式仍有缺口：忘了走 `projectsFor` 的代码路径拿到的是无限制的 Repository。把这个决定放到数据模型上：

```ts
builder.createCollection('projects', {
  // ...
  policy: { requireScope: true },
});
```

```ts
conn.repository('projects').findMany({});
// → POLICY_REQUIRED

conn
  .repository('projects')
  .withPolicy({ read: true, create: true, update: true, delete: true })
  .findMany({});
// → 正常执行，豁免是显式写出来的，可 grep 可 review
```

多租户表是多租户的，与谁在查询无关，所以这个声明属于 Collection 而不是调用点。默认不启用，按 Collection 逐个开。

## 常见的配置错误

### 只配了一半

```ts
// ✗ 编译不过：缺 create / update / delete
withPolicy({ read: { scope: { tenantId: 'T1' } } });
```

这是必填规则要挡的头号问题。如果允许省略，上面这行会得到一个读取受控、增删改完全敞开的 Repository，而它看起来像是配过权限的——review 时最容易放过去的就是这种形态。

需要放开字段或关系也必须显式写出来，让它出现在 diff 里；省略它们表示禁止：

```ts
withPolicy({
  read: { scope: { tenantId: 'T1' } },
  create: true,
  update: true,
  delete: true,
});
```

### 把 scope 当成默认值

```ts
// ✗ 以为调用方传了 filter 就会覆盖 scope（其余节点略）
const policy = { read: { scope: { status: 'draft' } } };

await projects.findMany({ filter: { status: 'published' } });
// → []   两个条件是 AND，不是覆盖，永远查不出东西
```

scope 是上限不是默认值。需要"默认草稿、可切换"这种行为，那是业务默认参数，写在 service 层。

### 把 scope 字段放进 create.fields

```ts
// ✗ tenantId 本该由注入决定，却又开放给调用方提交
create: { scope: { tenantId: 'T1' }, defaults: { tenantId: 'T1' }, fields: ['title', 'tenantId'] },

await projects.createOne({ values: { title: 'X', tenantId: 'T2' } });
// 注入的 T1 被调用方的 T2 覆盖 → 写入后重判 → SCOPE_VIOLATION
```

能挡住，但这是白白让调用方撞一次 403。注入得出来的字段就不要再放进 `fields`。

### 用 create.scope: true 图省事

```ts
// ✗ 嫌 SCOPE_VIOLATION 烦，直接豁免
create: { scope: true, fields: ['title'] },
// → 不再注入 tenantId，创建出一条谁都看不见的孤儿记录
```

`scope: true` 是给「确实要创建自己看不到的记录」准备的（例如向别的部门提交工单），不是用来消除报错的。报错通常说明 `create.fields` 或 `create.scope` 配错了。

### 用 read.fields 兼做搜索白名单

```ts
// ✗ 为了能按 budget 排序，把它放进了返回白名单
read: {
  fields: ['id', 'title', 'budget'];
}
// budget 现在也会返回给调用方
```

这正是第一版不做"可搜不可返回"的原因——需要时单独开字段，不要挪用 `read.fields`。

### 在 scope 里写关系路径

```ts
// ✗ 不支持
update: { scope: { 'owner.tenantId': 'T1' } }
// → INVALID_POLICY
```

把归属物化到本表（给 `projects` 加 `tenantId`），或者在 service 层拆成两段查询。

### 跨请求复用实例

```ts
// ✗ 模块级单例，第一个请求的身份会泄漏给后面所有请求
const projects = db.repository('projects').withPolicy({
  read: { scope: { tenantId: currentTenant } },
  create: {
    scope: { tenantId: currentTenant },
    defaults: { tenantId: currentTenant },
    fields: ['title'],
  },
  update: { scope: { tenantId: currentTenant } },
  delete: false,
});
export { projects };
```

带身份的实例只在一次请求内有效。

## 小结

| 层  | 加入的东西                      | 解决的问题                             |
| --- | ------------------------------- | -------------------------------------- |
| 1   | `read.scope`                    | 读取自动收窄，不靠每处手写             |
| 2   | `update.scope` / `delete.scope` | 写删各自独立，越权与不存在不可区分     |
| 3   | `create.scope` 与注入           | 没有 filter 的 create 也能落到正确范围 |
| 4   | 写入后重判                      | 筛对了行但值写错的全部提权路径         |
| 5   | `fields`                        | 字段级读写白名单                       |
| 6   | `relations`                     | 关系的递归范围与逐项写入授权           |
| 7   | 查询条件校验                    | 通过 filter/sort/groupBy 反推字段值    |

前四层是行范围，后三层是形状。行范围只靠三条不变量支撑，形状是白名单的直接展开。

相关文档：

- [Policy 设计](./policies.md)
- [Policy 示例说明](./policies-examples.md)
- [Policy 参考](./policies-reference.md)
- [Policy 执行细节](./policies-internals.md)
- [Policy 实施清单](./policies-roadmap.md)
