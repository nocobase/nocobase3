---
title: Policy 执行细节
description: Policy 在现有 Knex 适配器里的落点——编译、filter 合并与 origin 标记、各 mutation 的真实执行序列、写入后重判的零查询实现、方言差异、narrow 归并算法与错误产生点。
---

# Policy 执行细节

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：阶段 1 至阶段 3 已实现**，见 `db/src/repository/policy/`、`db-testkit/tests/integration/repository/policy/` 与 [实施清单](./policies-roadmap.md) 的逐项进度。本组文档仍在 `proposals/` 下：转为正式文档并入 `docs/zh-CN/repository/` 与消费方迁移一并进行，在那之前 [Write policy](../../repository/write-policy.md) 描述的方法级 `writePolicy` 仍然有效，两者并存。

面向实现者。[Policy 设计](./policies.md) 说规则是什么，[Policy 示例说明](./policies-examples.md) 说写出来什么样，本文说它在现有执行链路上挂在哪、每一步产生什么 SQL。

数据沿用示例文档那套（4 个 project、4 个 task、3 个 user，身份 `T1` + `u1`）。下面先把示例文档省掉的 Collection 定义补上。

## 前置：Collection 定义

```ts
builder.createCollection('projects', {
  fields: [
    { name: 'id', type: 'uuid' },
    { name: 'title', type: 'string', length: 200 },
    {
      name: 'status',
      type: 'enum',
      values: ['draft', 'published', 'archived'],
    },
    { name: 'tenantId', type: 'string', length: 32 },
    { name: 'ownerId', type: 'uuid' },
    { name: 'budget', type: 'integer' },
  ],
  relations: [
    {
      name: 'owner',
      type: 'belongsTo',
      target: 'users',
      foreignKey: 'ownerId',
    },
    {
      name: 'tasks',
      type: 'hasMany',
      target: 'tasks',
      foreignKey: 'projectId',
    },
  ],
  constraints: [
    { type: 'primary', fields: ['id'] },
    { type: 'unique', fields: ['tenantId', 'title'] },
  ],
  indexes: [{ fields: ['tenantId'] }, { fields: ['tenantId', 'ownerId'] }],
});
```

两处与 Policy 直接相关：

- **`tenantId` 上必须有索引。** scope 会 AND 进每一条语句的 WHERE，没有索引等于给全部读写加一次全表扫描。scope 用到的字段组合应当有对应索引，这是配置 Policy 时的隐含义务。
- **唯一约束是 `['tenantId', 'title']` 而不是 `['title']`。** 租户隔离下唯一性几乎总是租户内唯一；写成全局唯一会让一个租户的数据占用另一个租户的命名空间，而 scope 挡不住这件事——唯一冲突发生在数据库层，早于任何 Policy 判断。

## 一、Policy 的编译

`withPolicy` 时一次性完成，结果冻结，之后每次调用只读不算。

```text
withPolicy(input, principal?)
  1. input 是函数 → 以 principal 调用一次，取返回值
  2. 校验四节点齐全；节点为对象则 scope 必须存在
  3. 逐节点规范化：
     - scope    → FilterAst，节点标 origin: 'policy'
     - fields   → 去重、校验字段存在、校验是直接标量字段
     - relations→ 递归；ref 展开并检测环
  4. 预计算并缓存：
     - defaults ：create.defaults 规范化后的字段名到值的映射
     - readable ：read.fields 的集合形式，供查询条件校验用
     - 可满足性：create.scope 的每个引用字段能否从 defaults / fields /
                 数据库字面量默认值取到值，取不到则 INVALID_POLICY
  5. Object.freeze 全树
```

第 4 步的预计算是为了让每次调用只做集合查找，不重复遍历 policy 树。可满足性检查也只在这里做一次——它读的三样东西（scope 引用的字段、`create.fields`、Collection 的字面量默认值）都是静态的，没有理由拖到运行时。

编译发生在每次请求（函数形式的 policy 每个 principal 都要重新求值）。第 2、3 步里只依赖模板而与 principal 无关的部分——字段存在性校验、`ref` 展开、环检测——可以按模板缓存，每请求只重算随 principal 变化的值。是否值得做要先测；`withPolicies` 形态下一次请求会编译多份 policy，这个开销更容易显形。

编译失败一律 `INVALID_POLICY`，带 `path` 指向出错的节点位置，例如 `['update', 'fields', 2]`。

## 二、读路径

### filter 合并与来源区分

所有读方法（`findMany` / `findOne` / `count` / `exists` / `aggregate` / `groupBy`）走同一段合并：

```text
merged = {
  kind: 'group', logic: 'and',
  items: [
    ...(调用方 filter ? [调用方 filter.root] : []),
    ...(read.scope   ? [read.scope.root]   : []),
  ],
}
```

调用方 filter 整体作为一个 group 塞进来，不打平——打平会让调用方的 `$or` 与 scope 的条件错误地并列：

```ts
// 调用方 filter: (f) => f.or([f.string('status').eq('draft'),
//                              f.string('status').eq('published')])
// scope:        { tenantId: 'T1' }

// ✓ 正确：(A OR B) AND tenantId = 'T1'
// ✗ 打平：A OR B OR tenantId = 'T1'   ← 整张表
```

**来源区分靠结构，不靠节点上的 `origin` 标记。** 原设计给 `FilterNode` 加 `origin: 'caller' | 'policy'`，实现改为：调用方 filter 与 policy scope 自始至终是两个独立的值，`scopeCallerFilterGroup` 只遍历前者（同时按目标集合递归、并给关系分支注入该关系的 scope），合并发生在校验之后且不再回头校验。否则 scope 的 `tenantId` 会被 `read.fields` 自己拒绝。见[实施清单](./policies-roadmap.md) 1.5 与决策 0.5。

这条区分有过一次真实的失效，值得记住：关系 `combine` 分支曾把**已经合并过 scope 的** filter 当作各分支共同继承的调用方 filter 传下去，递归校验于是把 policy 条件当调用方条件判，`tenantId` 被 `FIELD_READ_FORBIDDEN` 拒绝。修法是让分支继承调用方自己的 filter——scope 由每一层递归各自重新注入，不必也不该随着继承。

### findMany 的 SQL

```ts
await projects.findMany({
  filter: { status: 'draft' },
  select: (s) => s.fields('id', 'title'),
});
```

```sql
select "repository_root"."id"    as "id",
       "repository_root"."title" as "title"
from "projects" as "repository_root"
where "repository_root"."status"    = 'draft'
  and "repository_root"."tenant_id" = 'T1'
```

scope 就是 WHERE 里多出来的合取项，没有子查询、没有 join——这正是 scope 限定为直接标量字段换来的。

### 关系展开：scope 落在子查询的 WHERE

关系不是 join 到根查询上的。`loadRelation` 为每个关系分支发一条批量查询，用父键 `IN`：

```ts
select: (s) =>
  s
    .fields('id')
    .include('tasks', (t) =>
      t.fields('id', 'title').filter({ completed: false }),
    );
```

```sql
-- 第一条：根记录
select "repository_root"."id" from "projects" as "repository_root"
where "repository_root"."tenant_id" = 'T1'

-- 第二条：tasks 分支，父键批量 IN
select "repository_target"."id", "repository_target"."title",
       "repository_target"."project_id"
from "tasks" as "repository_target"
where "repository_target"."project_id" in ('p1', 'p2', 'p3')
  and "repository_target"."completed"  = false      -- 调用方的局部 filter
  and "repository_target"."assignee_id" = 'u1'      -- 关系节点的 scope
```

两个后果值得写下来：

- **关系 scope 不影响根记录数量。** 它在第二条语句里，父记录该返回还返回，只是 `tasks` 数组为空。这与"关系局部 filter 不过滤根记录"是同一件事，Policy 没有改变这个性质。
- **关系 scope 的字段属于目标 Collection。** 上面的 `assigneeId` 是 `tasks` 的字段，与 `projects` 的 `read.fields` 无关。两层的校验各用各的节点。

多对多多一个 through join，scope 仍然只加在目标表的 WHERE 上；中间表自身的条件不属于 scope 的表达范围。

### 聚合与 groupBy

同一段合并，scope 进 WHERE，`having` 在收窄后的分组上求值：

```sql
select "status", count(*) as "n"
from "projects"
where "tenant_id" = 'T1'
group by "status"
having count(*) > 1
```

**`having` 里调用方用到的字段同样要过 `read.fields` 校验**，它和 `filter` 一样是不返回数据却能问出数据的通道。

## 三、写路径

### 现有适配器的真实序列

关键事实：**适配器不使用 `UPDATE ... RETURNING`**。`executeUpdateOne` 是"先锁、再改、最后回读"，整段在事务里（[`knex-execution-adapter.ts`](../../../../src/repository/internal/knex-execution-adapter.ts)）：

```text
inTransaction:
  1. lockByFilter(collection, filter)
       select <全部标量字段> from projects as repository_root
       where <filter>  limit 2  for update
     → 'missing' | 'multiple' | { record: 前像, unique }
  2. ifVersion 检查
  3. update ... where <unique>            （按唯一键，不是按原 filter）
  4. refreshAtomicValues（values 含 increment 等原子操作时回读这些列）
  5. applyRelationMutations
  6. incrementVersion
  7. findOne by unique                    → 后像
```

这个形状对 Policy 非常友好，因为它天然提供了两样东西：

- **第 1 步的 `filter` 就是 scope 的落点。** 合并后的条件进 `lockByFilter`，`'missing'` 直接变成 `RECORD_NOT_FOUND`——不变量 3 不需要任何额外代码。
- **第 1 步已经把整行读进内存并加了 `for update` 锁。** 前像在手，且在事务结束前不会被别人改。

### 不变量 2 的判定

**判定在数据库里做，不在内存里。** 原设计是内存求值器 `evaluateScope`（前像 + `values` 算后像），改为事务内、行已锁定时发一条按主键的 `SELECT … WHERE <主键> AND <scope>`，命不中则抛 `SCOPE_VIOLATION` 回滚。理由见[实施清单](./policies-roadmap.md) 1.4：内存求值必须复刻数据库自己的比较语义，而列的排序规则复刻不了——同一个字符串等值比较，MySQL 默认排序规则匹配、PostgreSQL 不匹配，求值器看不见该用哪一套。

这同时消掉了原本要单列处理的两个例外(原子操作、写触发器)：两者都是"新值由数据库算出"，而判定本来就在数据库里,所以不再需要 `hasWriteTriggers` 这类声明。

**「零额外查询」基本保住了**，靠的是另一条观察：**写入没有触及 scope 引用的任何字段时，记录不可能离开 scope，判定整个跳过**。`update.scope` 是 `{ tenantId }` 而调用方只改 `title`，走的仍是原来的路径，一条语句都不多。只有触及 scope 字段的写才付一次主键索引查找。同一条观察决定了 `updateMany` 的降级时机：单条 UPDATE 事后无法得知碰了哪些行，所以只有触及 scope 字段的批量写才降级到 `lockManyByFilter`。

`create` 例外——新记录没有前像可比，`create.scope` 不为 `true` 时一律判定。

**到根记录的路径不止 `values`。** 一个 to-one 关系把外键写在根表上，所以 `owner.connect` 会改 `ownerId` 而不在 `values` 里出现；判定条件因此还要问"本次写入的关系里，有没有 to-one 的外键落在 scope 读的字段上"。漏掉这一条，关系操作就能把记录带出自己的租户。

### createOne

```text
inTransaction:
  1. 形状检查：caller 提供的字段 ⊆ create.fields
  2. 赋值：values = { ...defaults, ...caller values }
       defaults 来自编译期规范化的 create.defaults
  3. createRecord → { record: 后像, unique }
  4. 按主键 + create.scope 回查 → 命不中则抛 SCOPE_VIOLATION，事务回滚
```

第 3 步之后判而不是之前判，是因为数据库默认值和自增列要到插入后才有值——scope 可能引用它们。判定是一条按主键的查询，与选中该行的 WHERE 子句用的是同一套比较语义。

第 2 步用 `{ ...defaults, ...caller }` 而不是反过来：调用方的值覆盖默认值，再由第 4 步把越界的挡掉。这样错误信息指向调用方实际提交的东西，比「默认值被静默保留」好排查。

形状检查排在赋值之前：`defaults` 是服务端赋的值，不该去过 `create.fields` 白名单——那个白名单约束的是调用方。这也是 `defaults` 能设 `fields` 之外字段的原因。

### upsertOne

`executeUpsertOne` 先 `lockByUnique(plan.by)`，scope **不参与** 这一步：

```text
  1. lockByUnique(by)          ← 只用唯一键，scope 不并入
  2. 'missing' →
       inSavepoint: 走 create 分支（注入 + 插入 + create.scope 判定）
       插入撞唯一约束 → 回退 savepoint，重新锁定，转 update 分支
  3. 命中 →
       按唯一键 + update.scope 回查前像
         命不中 → RECORD_OUTSIDE_SCOPE（409）
         命中   → 走 update 分支，含写入后重判
```

第 3 步是全套设计里唯一一处"存在但越权"给出可区分响应的地方。它与关系 upsert 已有的 `RELATION_UPSERT_TARGET_OUTSIDE_SCOPE` 同构，实现可以共用同一个判定函数。

### 关系写入的目标定位

`applyRelationMutation` 通过 `resolveMutationTarget` 按选择器从目标表定位既有目标，**这条查询默认不带任何范围条件**——这是关系节点必须有 `scope` 的原因（见[设计](./policies.md)的「关系写入的目标也要有 scope」）。

加上关系节点的 scope 之后：

```sql
-- connect / disconnect / set / delete 与关系的 update / upsert 都走这里
select <标量字段> from "tasks"
where "id" = 't4'                 -- 调用方给的选择器
  and "tenant_id" = 'T1'          -- relations.tasks.scope
limit 2 for update
```

定位不到返回 `RELATION_TARGET_NOT_FOUND`（404），与"这条记录不存在"不可区分——和根记录的 `RECORD_NOT_FOUND` 遵循同一条不变量 3。

三点实现约束：

- **`create` 分支不加这个 scope。** 新目标的归属由关系键写入决定，没有既有行可定位。关系的 `create` 分支也没有自己的 `defaults`，嵌套目标的服务端赋值由关系键和数据库默认值负责。
- **关系的 `update` 分支仍要走写入后重判**，判的是关系节点的 scope：定位时满足、改完之后也必须满足，否则可以借关系把目标推出范围。
- **`upsert` 分支复用根级 upsert 的三分支判定**，目标存在但越界时抛 `RELATION_UPSERT_TARGET_OUTSIDE_SCOPE`——这个错误码已经存在，语义正好，不需要新增。

### updateMany：静态判定，判不了才降级

`updateMany` 有快慢两条路径。不带 `select` 时是单条 UPDATE，**一行都不读**：

```sql
update "projects" set "status" = 'archived'
where "tenant_id" = 'T1' and "owner_id" = 'u1'
```

这条路径上没有前像可用，但绝大多数情况根本不需要——`values` 对所有行相同，所以后像是否满足 scope 可以**一次性静态判定**：

```text
若 scope 是平铺的 AND，且对每个同时出现在 scope 和 values 里的字段，
values 给的字面值都满足该条件，则所有行的后像必然满足 scope。
→ 检查一次，放行快路径。
```

最常见的形态直接命中：`values` 里根本没有 scope 字段 → 那些字段不变 → WHERE 已经保证过了。

判不了的情况降级到锁定路径（`lockManyByFilter` → 逐行判定 → UPDATE）：

- scope 含 `or` 分组，且 `values` 触及其中任一分支的字段
- `values` 对 scope 字段做原子操作

```ts
// 降级示例
// scope（AST）：ownerId='u1' OR visibility='public'
const values = { ownerId: 'u2' };
// 某行原先靠 ownerId 满足、某行靠 visibility 满足，不读行判不出来
```

### deleteMany：不需要后像

删除没有后像，scope 只进 WHERE，快路径完全不受影响：

```sql
delete from "projects"
where "tenant_id" = 'T1' and "owner_id" = 'u1' and "status" = 'draft'
```

带 `select`（返回删除前快照）时走 `executeDeleteManyReturning`：`lockManyByFilter` → `findManyBySelectors` 取快照 → 按选择器删除。快照的字段受 `read.fields` 约束，与 `delete.scope` 是两回事——删得掉不等于看得见。

## 四、方言差异

只有一处需要按方言分叉，而且已经有抽象：

```ts
function limitLockedQuery(query, client) {
  const customLimit =
    getDatabaseDriverRuntime(client)?.repository?.limitLockedQuery;
  if (customLimit) customLimit(query, client);
  else query.limit(2);
  query.forUpdate();
}
```

`SELECT ... LIMIT n FOR UPDATE` 的写法在八种方言里不一致（Oracle 用 `FETCH FIRST`，MSSQL 用 `TOP` 且行锁提示写在表上），驱动通过 `repository.limitLockedQuery` 覆盖。**Policy 不引入新的方言分支**——它只往 WHERE 里加合取项，而 WHERE 的构造已经由 `applyFilter` 统一处理。

也正因为走的是"先锁后改再回读"而不是 `RETURNING`，不存在"某些方言没有 RETURNING 怎么办"的问题。这是现有实现选择的副产品，但对 Policy 恰好合适，改成 `RETURNING` 反而会引入方言分叉。

`limit(2)` 而不是 `limit(1)`：要区分"恰好一行"和"多于一行"，后者返回 `'multiple'` → `MULTIPLE_RECORDS_MATCHED`。scope 收窄之后这个判定仍然成立，且收窄只会让 `'multiple'` 更少出现。

## 五、narrow 的归并算法

```text
merge(base, patch) 逐节点：
  节点级
    base === false            → false
    patch 未提及该节点        → base
    patch[node] === false     → false
    base === true             → patch[node]
    否则                      → 逐字段归并

  scope       AND（两侧都存在时包成 group；任一为 true 则取另一侧）
  fields      交集；任一为 false → false；任一未定义 → 另一侧
  relations   按关系名递归；只出现在 patch 里的关系 → 丢弃（不能新增授权）
```

最后一条容易写错：`patch.relations` 里出现 `base.relations` 没有的关系，**要丢弃而不是加入**，否则 `narrow` 就成了放宽。

逐步演算：

```ts
base = {
  read: {
    scope: { tenantId: 'T1' },
    fields: ['id', 'title', 'status'],
    relations: { owner: { fields: ['id', 'name'] }, tasks: { fields: ['id'] } },
  },
  create: true,
  update: { scope: { tenantId: 'T1', ownerId: 'u1' }, fields: ['title'] },
  delete: false,
};

patch = {
  read: {
    scope: { status: 'draft' },
    fields: ['id', 'title', 'budget'],
    relations: { owner: { fields: ['id'] }, members: { fields: ['id'] } },
  },
  delete: { scope: { status: 'draft' } },
};
```

```text
read.scope      { tenantId:'T1' } AND { status:'draft' }
read.fields     ['id','title','status'] ∩ ['id','title','budget'] = ['id','title']
                  budget 不在 base 里 → 丢弃，narrow 不能新增可读字段
read.relations
  owner         ['id','name'] ∩ ['id'] = ['id']
  tasks         patch 未提及 → 保持 ['id']
  members       base 没有 → 丢弃
create          patch 未提及 → true（保持）
update          patch 未提及 → 原样
delete          base 已是 false → false，patch 的 scope 无效
```

`delete` 那行是这套规则最该被测到的一条：base 禁用了删除，patch 给了一个 scope，结果必须仍是 `false`。

## 六、错误产生点

| 阶段         | 位置                            | 可能产生                                                                 |
| ------------ | ------------------------------- | ------------------------------------------------------------------------ |
| 编译         | `withPolicy`                    | `INVALID_POLICY`                                                         |
| 绑定误用     | `withPolicy` / `narrow`         | 无运行时错误，由类型分离挡在编译期                                       |
| 取实例       | `repository()`                  | `POLICY_REQUIRED`                                                        |
| 请求校验     | 读方法入口                      | `READ_FORBIDDEN` / `FIELD_READ_FORBIDDEN` / `RELATION_READ_FORBIDDEN`    |
| 形状检查     | mutation 入口，数据库操作之前   | `WRITE_FORBIDDEN` / `FIELD_WRITE_FORBIDDEN` / `RELATION_WRITE_FORBIDDEN` |
| 锁定         | `lockByFilter` 返回 `'missing'` | `RECORD_NOT_FOUND`                                                       |
| 锁定         | `lockByUnique` 命中但越界       | `RECORD_OUTSIDE_SCOPE`                                                   |
| 关系目标定位 | `resolveMutationTarget` 未命中  | `RELATION_TARGET_NOT_FOUND`                                              |
| 关系目标定位 | 关系 upsert 命中但越界          | `RELATION_UPSERT_TARGET_OUTSIDE_SCOPE`                                   |
| 写入后重判   | 内存后像 / 回读后像             | `SCOPE_VIOLATION`                                                        |

注意**形状检查全部早于任何数据库操作**，与现有 `writePolicy` 一致：不会写了一半再失败，也不会静默丢弃未授权字段。

`RECORD_NOT_FOUND` 在这张表里只有一个来源，这是不变量 3 能成立的原因——没有第二条路径能泄漏"行存在但越权"。

## 七、验证清单

- **scope 下推**：断言生成的 SQL 含 scope 条件；断言不存在"先查全量再内存过滤"的路径。
- **`or` 合并**：调用方 filter 含 `or` 分组时，结果是 `(A OR B) AND scope` 而不是打平。
- **越权=不存在**：同一个 `RECORD_NOT_FOUND` 覆盖"行不存在"与"行存在但越界"两种输入，且响应体逐字节相同。
- **写入后重判**：正常路径零额外查询（断言查询次数）；原子操作触及 scope 字段时回读；`or` 分组 scope 下 `updateMany` 降级到锁定路径。
- **`create.defaults`**：赋值经过字段 validation；调用方同名字段覆盖后被重判挡下；数据库默认值参与判定；`defaults` 可设 `fields` 之外的字段。
- **可满足性**：scope 引用的字段取不到值时，配置阶段报 `INVALID_POLICY`，而不是运行时反复回滚。
- **upsert**：三条分支各一例，`RECORD_OUTSIDE_SCOPE` 不退化成插入。
- **narrow**：`false` 传播、`fields` 交集、patch 独有关系被丢弃、base 为 `true` 时取 patch。
- **关系**：关系 scope 不减少根记录数；多对多经 through 时 scope 仍加在目标表。
- **关系写入目标**：`connect` / `set` / `delete` 指向越界目标时返回 `RELATION_TARGET_NOT_FOUND`，且与目标不存在的响应逐字节相同；`create` 不受关系 scope 影响；关系 `update` 改完后仍要满足关系 scope。
- **目标 Collection 的 policy 不参与**：为目标表单独绑一份 `update: false` 的 policy，断言经由关系的写入**不**因此被拒——授权只由发起方的 `relations` 节点决定。
- **绑定层**：`withPolicies` 未覆盖的 Collection 抛 `POLICY_REQUIRED`；事务内派生的 Repository 携带同一份 policy。
- **方言**：八种方言各跑一遍锁定路径，覆盖 `limitLockedQuery` 的驱动覆盖实现。
- **`explainPolicy`**：多层 `narrow` 之后的输出与手工归并结果一致。

相关文档：

- [Policy 设计](./policies.md)
- [Policy 示例说明](./policies-examples.md)
- [Policy 参考](./policies-reference.md)
- [Policy 执行细节](./policies-internals.md)
- [Policy 实施清单](./policies-roadmap.md)
