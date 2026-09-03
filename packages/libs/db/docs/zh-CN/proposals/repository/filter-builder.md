---
title: Filter Builder 提案
description: 尚未实现或导出的 Collection-aware Filter Builder 设计；仅供设计讨论，不可用于生成生产代码。
---

# Filter Builder

> **状态：分批实现中。运行时可用性：未实现。导出 API：Builder 类型契约。** 本页描述 V1 目标，Builder 与执行器尚未可用。

`Filter Builder` 是未来 Repository 的筛选条件 DSL。它面向 Collection metadata，而不是数据库物理 schema。目标是让开发者和 Agent 都能写出可解释、可校验、可序列化、能跨数据库编译的筛选条件。

## 基本原则

Filter Builder 只在 Repository 层使用：

```ts
await db.repository('orders').findMany({
  filter: (filter) =>
    filter.and([
      filter.string('status').eq('paid'),
      filter.number('amount').gte(100),
      filter.date('createdAt').notBefore('2026-01-01'),
    ]),
});
```

这里的 `orders`、`status`、`amount`、`createdAt` 都是 Collection / Field 逻辑名。Repository 会根据 Collection metadata 解析字段类型和关系路径，再把只含逻辑名的查询计划交给绑定 connection 的数据库 adapter 执行。

## 和 db.query().where() 的区别

`db.query().where()` 是数据库层条件：

```ts
await db.query().selectFrom('orders').where('createdAt', '>=', start).execute();
```

它只做 query identifier 的轻量命名归一化，不读取 Collection metadata。

Filter Builder 是应用层条件：

```ts
await db.repository('orders').findMany({
  filter: (filter) => filter.date('createdAt').notBefore(start),
});
```

它会知道 `createdAt` 是日期字段，因此使用日期 operator group，而不是数字比较 operator。

## 入口形态

Repository 操作通过 `filter` callback 接收 Filter Builder：

```ts
await db.repository('orders').findMany({
  filter: (filter) => filter.string('status').eq('paid'),
});
```

复杂条件用 `and()` / `or()` 组合：

```ts
await db.repository('orders').findMany({
  filter: (filter) =>
    filter.and([
      filter.or([
        filter.string('status').eq('paid'),
        filter.string('status').eq('completed'),
      ]),
      filter.number('amount').gte(100),
      filter.or([
        filter.string('orderNo').includes('SO-'),
        filter.string('remark').includes('priority'),
      ]),
    ]),
});
```

Filter Builder 生成的是结构化 Filter AST。HTTP、CLI、file sync 或持久化配置可以直接使用 AST 形态，详见 [Filter AST](./filter-ast.md)。

## 不提供的简称 API

为了让 Agent 更容易稳定生成代码，V1 不设计这些简称：

```ts
// 不规划
filter('status').eq('paid');
filter.field('status').eq('paid');
filter.rel('roles').some(...);
filter.var('$user.id');
f.and(...);
```

推荐使用完整入口：

```ts
filter.string('status').eq('paid');
filter.relation('roles').some(...);
filter.variable('$user.id');
filter.and([...]);
```

这样读代码时可以直接看出字段 operator group，也方便运行时根据 Collection metadata 做校验。

## 字段方法组

不同 Field type 的可用操作符不同。Filter Builder 不根据 UI 控件、字段名称、是否为主键或数据库物理列类型猜测语义，而是从路径终点的 Collection Field `type` 选择并校验 operator group。

| Builder 方法组         | Collection Field `type`                                         | 方法                                                                                                        | 输出 operator                                                                                                                  |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `filter.string(path)`  | `string`、`uuid`                                                | `includes()`、`notIncludes()`、`eq()`、`ne()`、`empty()`、`notEmpty()`                                      | `$includes`、`$notIncludes`、`$eq`、`$ne`、`$empty`、`$notEmpty`                                                               |
| `filter.text(path)`    | `text`                                                          | `includes()`、`notIncludes()`、`eq()`、`ne()`、`empty()`、`notEmpty()`                                      | `$includes`、`$notIncludes`、`$eq`、`$ne`、`$empty`、`$notEmpty`                                                               |
| `filter.number(path)`  | `increments`、`integer`、`bigInt`、`decimal`、`float`、`double` | `eq()`、`ne()`、`gt()`、`gte()`、`lt()`、`lte()`、`empty()`、`notEmpty()`                                   | `$eq`、`$ne`、`$gt`、`$gte`、`$lt`、`$lte`、`$empty`、`$notEmpty`                                                              |
| `filter.date(path)`    | `date`                                                          | `on()`、`notOn()`、`before()`、`after()`、`notBefore()`、`notAfter()`、`between()`、`empty()`、`notEmpty()` | `$dateOn`、`$dateNotOn`、`$dateBefore`、`$dateAfter`、`$dateNotBefore`、`$dateNotAfter`、`$dateBetween`、`$empty`、`$notEmpty` |
| `filter.date(path)`    | `datetime`                                                      | `before()`、`after()`、`notBefore()`、`notAfter()`、`between()`、`empty()`、`notEmpty()`                    | `$dateBefore`、`$dateAfter`、`$dateNotBefore`、`$dateNotAfter`、`$dateBetween`、`$empty`、`$notEmpty`                          |
| `filter.time(path)`    | `time`                                                          | `eq()`、`ne()`、`empty()`、`notEmpty()`                                                                     | `$eq`、`$ne`、`$empty`、`$notEmpty`                                                                                            |
| `filter.boolean(path)` | `boolean`                                                       | `isTrue()`、`isFalse()`、`empty()`、`notEmpty()`                                                            | `$isTruly`、`$isFalsy`、`$empty`、`$notEmpty`                                                                                  |
| `filter.json(path)`    | `json`                                                          | V1 暂无 operator                                                                                            | —                                                                                                                              |

`filter.largeText()`、`filter.id()` 和 `filter.object()` 不进入 V1。`text` 与 `json` 分别使用同名 Field type 对应的 `filter.text()` 和 `filter.json()`；主键、唯一键或 relation 终点的 ID 仍按其实际 Field type 使用 `filter.number()` 或 `filter.string()`，不会因为承担 ID 角色而获得独立 operator group。`blob` 和 `native` 暂不支持筛选。

Collection 允许扩展自定义 Field type，但 V1 对没有明确 operator group 映射的类型应报“不支持筛选”，不能按值形状或底层列类型回退猜测。

### `empty` / `notEmpty` 的固定语义

- `string` 和 `text`：`empty` 表示 `NULL OR ''`，`notEmpty` 表示 `NOT NULL AND != ''`。
- 其他支持这些 operator 的标量 Field：`empty` 只表示 `NULL`，`notEmpty` 只表示 `NOT NULL`。
- `json` 在 V1 不提供 `empty` / `notEmpty`，也不提供跨数据库含义不一致的结构相等判断。
- relation 只通过 `filter.relation().empty()` / `notEmpty()` 判断关联集合是否为空。

运行时必须根据 Collection metadata 校验方法组是否匹配终点 Field。比如 `createdAt` 是 `date` Field 时，只能使用 `filter.date('createdAt')`，不能使用 `filter.number('createdAt').gte(...)`。

## 日期条件

日期字段不要使用 `$lt`、`$lte`、`$gt`、`$gte` 这类 number operator。Filter Builder 使用更清晰的日期方法：

```ts
filter.date('createdAt').before('2026-12-31');
filter.date('createdAt').notBefore('2026-01-01');
filter.date('createdAt').notAfter('2026-08-15');
filter.date('createdAt').between(['2026-01-01', '2026-12-31']);
```

语义对应关系：

| 用户意图               | Filter Builder          | 输出 operator    |
| ---------------------- | ----------------------- | ---------------- |
| 等于某日期或周期       | `on(value)`             | `$dateOn`        |
| 不等于某日期或周期     | `notOn(value)`          | `$dateNotOn`     |
| 早于                   | `before(value)`         | `$dateBefore`    |
| 晚于                   | `after(value)`          | `$dateAfter`     |
| 不早于，等价于大于等于 | `notBefore(value)`      | `$dateNotBefore` |
| 不晚于，等价于小于等于 | `notAfter(value)`       | `$dateNotAfter`  |
| 在范围内               | `between([start, end])` | `$dateBetween`   |

这样可以避免 Agent 把自然语言里的“大于等于”直接翻译成 `$gte`，导致前端 filter UI 无法正确展示。

`date` literal 必须是 ISO `YYYY-MM-DD`。`datetime` literal 必须是带显式 offset 或 `Z` 的
ISO 8601；代码 API 收到 `Date` 时先规范化为 ISO string。`between([start, end])` 使用
`[start, end)` 半开区间。V1 不提供 `today`、`thisWeek` 等相对日期；`on()` / `notOn()`
只用于 `date`，避免在未提供时区的情况下猜测 `datetime` 的自然日边界。

## 关系筛选

Relation filter 必须区分 to-one 和 to-many。

### To-one relation

To-one relation 可以使用字段路径，operator group 取决于终点字段：

```ts
await db.repository('orders').findMany({
  filter: (filter) =>
    filter.and([
      filter.string('customer.name').includes('Acme'),
      filter.string('createdBy.id').eq(filter.variable('$user.id')),
    ]),
});
```

`customer.name` 的终点 Field 是 `string`，所以使用 string group。这个示例中 `createdBy.id` 的终点 Field 是 `uuid`，因此也使用 string group；如果它是 `integer`，则应使用 number group。

### To-many relation

To-many relation 不建议直接写 `filter.string('roles.name')`。它应该通过 `filter.relation(path)` 显式选择量词。

拥有 root 或 admin 任意一个角色：

```ts
await db.repository('users').findMany({
  filter: (filter) =>
    filter
      .relation('roles')
      .some((role) =>
        role.or([
          role.string('name').eq('root'),
          role.string('name').eq('admin'),
        ]),
      ),
});
```

没有关联 root，也没有关联 admin：

```ts
await db.repository('users').findMany({
  filter: (filter) =>
    filter
      .relation('roles')
      .none((role) =>
        role.or([
          role.string('name').eq('root'),
          role.string('name').eq('admin'),
        ]),
      ),
});
```

必须同时拥有 root 和 admin：

```ts
await db.repository('users').findMany({
  filter: (filter) =>
    filter.and([
      filter.relation('roles').some((role) => role.string('name').eq('root')),
      filter.relation('roles').some((role) => role.string('name').eq('admin')),
    ]),
});
```

### Relation 量词

| 方法             | 语义                         |
| ---------------- | ---------------------------- |
| `some(callback)` | 至少存在一个关联记录满足条件 |
| `none(callback)` | 不存在任何关联记录满足条件   |
| `exists()`       | 关联存在                     |
| `notExists()`    | 关联不存在                   |
| `empty()`        | 关联为空                     |
| `notEmpty()`     | 关联不为空                   |

V1 暂不规划 `every()`。`every()` 对空集合的语义容易引发误解，以后确有需要再单独设计。

## 变量

Repository filter 使用 `context` 作为变量解析上下文，Filter Builder 中用 `filter.variable(path)` 表达变量值：

```ts
await db.repository('orders').findMany({
  context: {
    user: {
      id: 1,
    },
  },
  filter: (filter) =>
    filter.string('createdBy.id').eq(filter.variable('$user.id')),
});
```

不要在 TypeScript 代码里直接写模板字符串形态：

```ts
// 不推荐作为代码 API
filter.string('createdBy.id').eq('{{$user.id}}');
```

`filter.variable('$user.id')` 会生成一等 AST value，由 Repository 运行时解析。缺失变量默认应抛错。解析后的值进入 SQL bindings，不参与 SQL 字符串拼接。

`$user.id` 表示从 `context.user.id` 读取。`$` 是变量命名空间前缀，不要求 `context` 里真的存在 `$user` 这个 key。

## 设计边界

Filter Builder V1 不规划：

- callable builder，例如 `filter('name')`。
- 简称方法，例如 `filter.rel()`、`filter.var()`。
- 通用 `filter.field()` 作为主入口。
- object shorthand，例如 `{ status: 'paid' }`。
- `$and` / `$or` 这类直接暴露给代码作者的特殊 key。
- generic `not()` 节点。
- raw SQL filter。
- to-many relation 的直接字段路径。
- `every()` relation 量词。

这些边界是为了降低 Agent 的误写概率，让每个条件都能从方法名看出字段类型、操作符和关系语义。

## Agent 注意事项

- 本页接口为规划接口，当前代码中尚未实现。
- Agent 写 TypeScript 代码时，优先使用 Filter Builder。
- Agent 生成 HTTP / CLI / 持久化配置时，可以输出 Filter AST。
- 选择方法组之前必须先根据 Collection metadata 确认终点字段类型。
- 日期字段必须使用 `filter.date()`，不要使用 `filter.number()`。
- to-many relation 必须使用 `filter.relation().some()`、`none()`、`empty()`、`notEmpty()`、`exists()` 或 `notExists()`。
- 变量使用 `filter.variable()`，Repository operation options 使用 `context`。
