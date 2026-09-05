---
title: Repository 查询
description: 使用 Repository 的 findOne、findMany、count 和 exists 查询 Collection，明确空结果、排序、返回类型、筛选上下文与单条查询的非唯一语义。
---

# Repository 查询

需要查询 Collection 记录时，从这四个方法开始。本文示例沿用 [Overview](./overview.md) 的模型，假定 `db` 已配置、Collection 与物理表已存在。

## 按任务选择方法

| 需求     | 方法                 | 返回值             | 未匹配      |
| -------- | -------------------- | ------------------ | ----------- |
| 列表     | `findMany(options?)` | 记录数组           | `[]`        |
| 第一条   | `findOne(options)`   | 记录或 `undefined` | `undefined` |
| 数量     | `count(options?)`    | `number`           | `0`         |
| 是否存在 | `exists(options?)`   | `boolean`          | `false`     |

这些方法不返回 `{ record }`、`{ records }` 或 `{ total }` 包装。写入方法的返回结构不同，见[写入](./mutations.md)。

## 查询列表

```ts
const projects = db.repository('projects');
const records = await projects.findMany({
  filter: { status: 'active' },
  select: (select) => select.fields('id', 'name'),
  sort: (sort) => sort.field('id').asc(),
  limit: 20,
});
```

`records` 的运行时形态为 `[{ id: 'project-1', name: 'Repository' }]`。没有记录时为 `[]`。

- 省略 `filter` 查询所有记录，不建议在交互式列表中省略 `limit`。
- 省略 `select` 读取根记录标量字段；关系必须显式 include。
- 有主键时，省略 `sort` 默认按主键升序。自定义排序未形成唯一顺序时，会追加缺失的主键字段升序作为决胜项。
- 不存在主键且没有排序时，不应依赖数据库返回顺序。
- 返回字段类型受字段定义、驱动和 Repository 泛型影响，精确标量类型推导见 [Select](./select.md)。

## 查询第一条，不是唯一查询

```ts
const projects = db.repository('projects');
const record = await projects.findOne({
  filter: { status: 'active' },
  sort: (sort) => sort.field('id').asc(),
  select: (select) => select.fields('id', 'name'),
});

if (record !== undefined) {
  console.log(record.id, record.name);
}
```

`findOne()` 要求 `filter` 或显式非空 `sort`，两者可以同时提供。下面按排序取第一条，不设置筛选：

```ts
const record = await db.repository('projects').findOne({
  sort: (sort) => sort.field('id').desc(),
  select: (select) => select.fields('id'),
});
```

关键语义：

- 多条匹配时返回排序后的第一条，**不会**抛出多条命中错误。
- `findOne({ filter: { id: 'project-1' } })` 是否唯一，取决于 Schema 中的主键或唯一约束，不由方法名保证。
- 无参数或既无筛选又无非空排序，报 `INVALID_FILTER`。
- 根级 `findOne` 不接受 `limit / offset / cursor / direction / distinct`；关系 include 可以有自己的局部选项。
- 当前没有 `findUnique()`、`findFirst()` 或 `findOneOrThrow()`。不要照搬其他 ORM 的接口。

单条更新、删除要求实际命中一条，和这里的读取语义不同，见[写入](./mutations.md)。

## 计数和存在性

```ts
const projects = db.repository('projects');
const total = await projects.count({ filter: { status: 'active' } });
const present = await projects.exists({ filter: { id: 'project-1' } });
```

这两个方法仅接受 `filter` 和 `context`。它们不接受 `select / sort / limit / distinct`，也不会继承另一次 `findMany()` 的条件。

查询页面与总数时，应显式复用同一个 Filter。两次调用不是自动共享快照；需要一致性时，结合数据库隔离级别使用[事务](./transactions.md)。分组计数或按字段去重统计不要通过给 `count` 增加未经支持的参数实现，参见[聚合](./aggregates.md)。

## 按条件组合查询

| 需求                      | 阅读                            |
| ------------------------- | ------------------------------- |
| AND、OR、关系存在性、变量 | [Filter](./filter.md)           |
| JSON 路径及数组成员       | [JSON Filter](./json-filter.md) |
| 返回哪些字段及关联记录    | [Select](./select.md)           |
| 普通及关系聚合排序        | [Sort](./sort.md)               |
| 双向分页、去重            | [Pagination](./pagination.md)   |

未知 Collection、字段或关系会抛出相应 Repository 错误；输入错误不是“没有匹配数据”。错误代码和公开签名见 [API reference](../reference/repository-api.md)。

## 验证清单

- 同时覆盖零条、一条、多条匹配。
- 对 `findOne()` 验证排序后选中的记录，而不只是“有结果”。
- 检查投影实际返回的键，避免把查询结果当写入包装对象。
- 分页测试包含排序值相同的记录，验证主键决胜项。
- 业务权限条件应由调用层提供；Repository 不会自动完成业务授权。
