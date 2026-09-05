---
title: Repository：基于 Collection 的数据访问
description: 使用 Repository 查询和修改 Collection 记录，按任务选择 Filter、Select、Sort、Values、关系和聚合接口，了解返回结果及使用边界。
---

# Repository：基于 Collection 的数据访问

Repository 基于解析后的 Collection 定义访问记录，识别逻辑字段、关系和命名映射。这是当前公开 API 的使用文档，不需要先阅读设计提案。

## 选择正确入口

| 任务                                     | 使用                                                        |
| ---------------------------------------- | ----------------------------------------------------------- |
| Collection 记录 CRUD、关系读取、嵌套写入 | Repository                                                  |
| 数据库层 join、子查询和查询组合          | [Query](../query/overview.md)                               |
| 创建或修改表、字段、索引、约束           | Migration 中的 [Collection Builder](../builder/overview.md) |
| 检查已有物理数据库结构                   | [Schema Inspector](../schema-inspector/overview.md)         |

Repository 不创建 Schema，也不替代业务权限、租户隔离或输入授权。调用方必须明确允许访问的 Collection、字段和记录范围。

Collection 不要求存在 `id`，也不要求存在主键。字段名称不决定类型：`id` 可以是 string、uuid、integer 等声明类型，甚至不是唯一字段。基础查询和不带 select 的批量标量操作不要求主键；需要定位或重读记录的单条写入要求可用的完整非空主键或无条件唯一选择器。没有可用标识时不会猜测 id，见[写入限制](./mutations.md)。

## 获取 Repository

以下示例假设 `db` 是已配置的 `DatabaseManager`，Collection 已存在且能由 `connection.collections` 解析。

```ts
const projects = db.repository('projects');
const mainProjects = db.connection('main').repository('projects');

await db.transaction(async (connection) => {
  const transactionProjects = connection.repository('projects');
  await transactionProjects.count();
});
```

`repository()` 接受 Collection 逻辑名称，不是带前缀的物理表名。Manager 与 Connection 上的 repository 都是方法，不需要 `await`。命名连接必须已配置；事务内始终从回调 Connection 获取 Repository。

## 本组文档的示例模型

各页复用下面的模型约定。示例是独立的使用片段，不应按页面顺序反复执行创建操作。生产 Schema 应在自包含的 Migration 中声明，不能将此说明当成初始化代码。

| Collection    | 字段和关系前提                                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`    | `id`：调用方提供的非空 string 主键；`name`：string；`status`：默认 draft 的非空 string；`country/role`：可空 string；`budget`：默认 0 的 decimal；`metadata`：可空 JSON；`version`：启用乐观锁的 integer；`ownerId`：可空 string |
| `users`       | string 主键 `id`、`name`、唯一 string `email`                                                                                                                                                                                    |
| `tasks`       | 非空 string 主键 `id`、string `title`、默认 draft 的非空 string `status`、可空 integer `priority`、默认 0 的 integer `points`、可空 string `projectId`                                                                           |
| `tags`        | string 主键 `id`、string `label`                                                                                                                                                                                                 |
| `projectTags` | `projectId/tagId`：string 关系键；`role`：可空 string payload；为关系键组合声明唯一约束                                                                                                                                          |

`projects.owner` 是指向 users 的 belongsTo，foreignKey 为 ownerId，targetKey 为 id；`projects.tasks` 是指向 tasks 的 hasMany，sourceKey 为 id，foreignKey 为 projectId；`projects.tags` 是经 projectTags 的 belongsToMany，sourceKey/targetKey 均为 id，foreignKey 为 projectId，otherKey 为 tagId。这里的 id 是示例显式声明的字段，不是默认值；其他模型必须填各自真实的关系键。除字段本身外，必须保留这些 Relation Metadata。

其他必填字段应由调用方提供或在 Schema 中定义默认值。示例中 version 由 Repository 初始化，不手动写入。

## 最小读写示例

```ts
const projects = db.repository('projects');
const created = await projects.createOne({
  values: {
    id: 'project-1',
    name: 'Repository',
    status: 'draft',
    country: 'CN',
    role: 'internal',
    budget: '100.00',
  },
  select: (select) => select.fields('id', 'name', 'version'),
});

const rows = await projects.findMany({
  filter: { status: 'draft' },
  select: (select) => select.fields('id', 'name'),
  sort: (sort) => sort.field('id').asc(),
});

const updated = await projects.updateOne({
  filter: { id: 'project-1' },
  ifVersion: created.version,
  values: { status: 'active' },
  select: (select) => select.fields('id', 'status'),
});
console.log(created.record, rows, updated.record);
```

创建和更新返回结果对象，记录位于 `record`；查询直接返回记录或数组。`findOne()` 取匹配结果中的第一条，并不是唯一查询；单条更新和删除则校验实际命中数量。

## 按任务阅读

| 任务                     | 方法或输入                             | 文档                                                                                                   |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 查询记录、计数、判断存在 | findOne/findMany/count/exists          | [查询](./queries.md)                                                                                   |
| 组合条件                 | filter                                 | [Filter](./filter.md)、[JSON Filter](./json-filter.md)                                                 |
| 选择字段和嵌套关系       | select                                 | [Select](./select.md)                                                                                  |
| 定义结果顺序             | sort                                   | [Sort](./sort.md)                                                                                      |
| 分页或去重               | limit/offset/cursor/direction/distinct | [分页](./pagination.md)                                                                                |
| 创建、更新、删除、upsert | values                                 | [写入](./mutations.md)                                                                                 |
| 操作关系和中间表         | 关系 values                            | [关系写入](./relation-mutations.md)                                                                    |
| 统计与分组               | aggregate/groupBy/combine              | [聚合](./aggregates.md)                                                                                |
| 原子执行多个操作         | transaction/ifVersion                  | [事务](./transactions.md)                                                                              |
| 分批消费大量根记录       | stream                                 | [Streaming](./streaming.md)                                                                            |
| 核对签名或执行任务       | 类型参考、任务步骤                     | [API 参考](../reference/repository-api.md)、[Agent 指南](../agent/implement-repository-data-access.md) |

## 四类输入

| 输入   | 含义                     | 可用形式                                         |
| ------ | ------------------------ | ------------------------------------------------ |
| filter | 选择记录                 | 等值简写、Builder、JSON AST                      |
| values | 创建或修改数据           | 标量对象；关系和数值原子操作可用 Builder 或 JSON |
| select | 选择字段、关系、关系聚合 | Builder、JSON AST                                |
| sort   | 定义结果顺序             | Builder、JSON AST                                |

根级条件名是 `filter`，不是 Prisma 的 `where`。简单 Filter 对象仅表示等值 AND，不支持任意 Prisma 操作符对象。JSON 不能携带 callback；普通值本身也不一定可 JSON 序列化，例如 bigint、Date。

## 关系与结果

```ts
const rows = await db.repository('projects').findMany({
  select: (select) =>
    select.fields('id').include('tasks', (tasks) =>
      tasks.combine({
        records: tasks
          .fields('id', 'title')
          .sort((sort) => sort.field('id').asc())
          .limit(10),
        count: tasks.count(),
      }),
    ),
});
```

四种关系均支持 include；关系聚合只面向 to-many。上述 `tasks` 返回 `{ records: [...], count: number }`，记录分支的 limit 不限制 count 分支。

嵌套写入支持 create/connect/disconnect/set/update/upsert/delete，允许操作取决于关系类型和外键约束。disconnect 不删除目标，delete 会删除目标；根级 createMany/updateMany 不支持嵌套关系写入。

## 正确性和当前边界

- updateOne/deleteOne 必须实际命中一条；upsertOne 使用唯一条件，create 分支必须携带相同唯一值。
- 批量更新、删除需要非空 filter，或明确 `all: true`，不能依赖省略条件表达全表操作。
- 嵌套写入在事务中执行；多个独立调用要共同回滚时使用显式事务。
- View Collection 只读。validateMutation 是预校验，不是权限检查，也不能保证执行时记录仍存在。
- Cursor/Distinct 需要稳定排序；JSON Filter 和 Streaming 有数据库限制，见对应主题。
- 标量 Select 与关系聚合 Builder 有返回类型推导；普通关系记录 include 和 JSON AST 保留动态类型边界。
- 不存在 findUnique/findFirst/connectOrCreate；不支持 native scalar-list、distinctOn、countDistinct、GroupBy 分页。不要由其他 ORM 的习惯推断这些接口。

精确签名以包根入口的 TypeScript 声明为准；设计提案不是当前用法来源。
