---
title: Repository JSON Filter
description: 在 Repository 中查询 JSON 字段的路径、结构和数组成员，区分数据库 NULL、JSON null 与缺失路径，并了解参数校验和各数据库的实际支持边界。
---

# Repository JSON Filter

JSON Filter 用于 `json` Field，不是字符串形式的 JSON，也不是原生数据库数组字段。条件在数据库中执行，不通过取回全部记录再在 JavaScript 中过滤。

本文沿用 [Overview](./overview.md) 模型中 `projects` 的可空 JSON 字段 `metadata`。示例数据形态为 `{ profile: { country: 'CN' }, labels: ['database', 'orm'], scores: [1, 2] }`；`db` 已配置且 Schema 已创建。

## 路径与结构比较

```ts
const records = await db.repository('projects').findMany({
  filter: (filter) =>
    filter.and([
      filter.json('metadata').path(['profile', 'country']).eq('CN'),
      filter.json('metadata').path(['scores', 0]).eq(1),
    ]),
});
```

`json('metadata')` 选择 Collection 字段；`.path()` 选择该字段内部的 JSON 路径。两者不能混为 `string('metadata.profile.country')`。

- 字符串路径段是对象键，数字段是从 0 开始的数组索引。
- `.path(['profile']).path(['country'])` 追加路径，等价于 `.path(['profile', 'country'])`；Builder 分支互不修改。
- 路径不得为空；键不得为空或包含双引号、反斜杠、NUL；索引须为非负安全整数。
- `eq(value)`／`ne(value)` 支持合法 JSON 标量、数组、对象。
- 对象按结构比较，忽略键顺序；数组保留顺序。数字 `1`、布尔 `true`、字符串 `'1'` 是不同值。
- 缺失路径不会被 `ne(value)` 自动当作“不相等”匹配；需要判断缺失路径的专用操作符目前未提供。

## JSON 数组成员

```ts
const records = await db.repository('projects').findMany({
  filter: (filter) =>
    filter.json('metadata').path(['labels']).hasEvery(['database', 'orm']),
});
```

| 方法               | 行为                       |
| ------------------ | -------------------------- |
| `has(value)`       | 数组包含该直接标量元素     |
| `hasSome(values)`  | 数组包含列表中至少一个元素 |
| `hasEvery(values)` | 数组包含列表中的所有元素   |
| `isEmpty()`        | 值是数组且长度为 0         |
| `isNotEmpty()`     | 值是数组且长度大于 0       |

成员参数只接受 string／有限 number／boolean／null，不接受对象或数组成员条件。`has(1)` 匹配 `[1]`，不匹配 `[[1]]`、`[true]` 或 `['1']`。

边界语义：

- `hasSome([])` 不匹配任何行。
- `hasEvery([])` 匹配所有数组，包括空数组，但不匹配对象、标量、JSON null、数据库 NULL 或缺失路径。
- `isEmpty()` 不表示空对象、空字符串或 NULL；它只判断数组。
- 当前没有 JSON 数组排序、切片或原生 scalar-list Field API。

## 区分三种空值

| 数据状态                 | 整列 `isDbNull()` | 整列 `isJsonNull()` | 整列 `isAnyNull()` |
| ------------------------ | ----------------- | ------------------- | ------------------ |
| SQL NULL                 | 匹配              | 不匹配              | 匹配               |
| JSON 文本 `null`         | 不匹配            | 匹配                | 匹配               |
| `{}`、`[]`、其他 JSON 值 | 不匹配            | 不匹配              | 不匹配             |

```ts
const records = await db.repository('projects').findMany({
  filter: (filter) => filter.json('metadata').path(['profile']).isJsonNull(),
});
```

这个条件匹配 `{ profile: null }`，不匹配 `{}`，也不匹配整列 SQL NULL。

路径上的 `isAnyNull()` 匹配“整列 SQL NULL，或该路径为 JSON null”；仍不匹配缺失路径。`isDbNull()` 只允许整列调用，和 `.path()` 组合报 `INVALID_FILTER`。`eq(null)` 对应 JSON null，不是 SQL NULL。

这些是读取时的判断语义。不要据此推断 `values: { metadata: null }` 可以区分两种存储 NULL；写入输入并没有提供 Prisma 风格的 `DbNull`／`JsonNull` 哨兵。

## 对应 JSON AST

```ts
import type { FilterAst } from '@nocobase/db';

const filter: FilterAst = {
  kind: 'filter',
  version: 1,
  root: {
    kind: 'group',
    logic: 'and',
    items: [
      {
        kind: 'condition',
        path: ['metadata'],
        jsonPath: ['labels'],
        operator: '$jsonHas',
        value: 'database',
      },
    ],
  },
};
const records = await db.repository('projects').findMany({ filter });
```

| Builder                             | AST operator                              |
| ----------------------------------- | ----------------------------------------- |
| `eq / ne`                           | `$jsonEq / $jsonNe`                       |
| `has / hasSome / hasEvery`          | `$jsonHas / $jsonHasSome / $jsonHasEvery` |
| `isEmpty / isNotEmpty`              | `$jsonEmpty / $jsonNotEmpty`              |
| `isDbNull / isJsonNull / isAnyNull` | `$jsonDbNull / $jsonNull / $jsonAnyNull`  |

空数组和 NULL 判断操作符不得携带 `value`。一般逻辑组合、关系作用域和 context 规则与 [Filter](./filter.md) 相同。JSON 值参数也可引用 `filter.variable('$needle')`；不支持在任意深度对象中递归插值。

注意：直接位于 Filter `value` 的 `{ kind: 'variable', ... }` 会被解释为变量引用，不要把它作为普通 JSON 对象字面量传入。确需比较这种对象时，通过 context 变量提供完整对象。

## 数据库能力与错误

| 数据库                   | 当前能力                                                         |
| ------------------------ | ---------------------------------------------------------------- |
| SQLite（启用 JSON 函数） | 上述操作                                                         |
| PostgreSQL               | 上述操作                                                         |
| MySQL 8.0.17+            | 上述操作，数组成员实现依赖 `JSON_OVERLAPS`                       |
| Oracle／SQL Server       | 仅整列 `isDbNull()`；其他操作报 `FIELD_CAPABILITY_NOT_SUPPORTED` |

MySQL 版本要求应由部署环境满足，不保证旧版本会在 Repository 入口得到版本专属错误。非法路径、NaN／Infinity、undefined、循环对象、Date、非 JSON 实例或非标量成员输入报 `INVALID_FILTER`。JSON 操作符用于非 JSON Field 会被拒绝；没有 JSON 大小写 mode。

## 验证清单

- 在实际部署数据库执行测试，不只检查 AST。
- 覆盖对象键顺序、数组顺序和数字／布尔／字符串类型区分。
- 单独构造 SQL NULL、JSON null、缺失路径，不能只用一个 `null` fixture。
- 覆盖空数组、嵌套数组和空成员条件。
- 更新和删除使用 JSON Filter 时，同时验证命中范围与[写入保护](./transactions.md)。
