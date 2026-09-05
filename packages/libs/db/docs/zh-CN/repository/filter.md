---
title: Repository Filter
description: 使用等值简写、Filter Builder 与 JSON AST 表达 Repository 条件，核对字段操作符、关系量词、大小写模式、上下文变量及空值和日期区间语义。
---

# Repository Filter

根级筛选参数是 `filter`，不是 `where`。查询、计数、聚合前筛选和写入定位复用 Filter，但写入另外有命中数量和全表操作保护，见[写入](./mutations.md)。

示例使用 [Overview](./overview.md) 的模型，`db` 已配置。

## 选择输入形式

| 形式                     | 适用场景                     | 可序列化        |
| ------------------------ | ---------------------------- | --------------- |
| `{ status: 'active' }`   | 根级标量等值、隐式 AND       | 是              |
| `(filter) => FilterNode` | 应用代码、复杂组合           | 否              |
| `FilterAst`              | 保存、传输或动态生成完整条件 | 是，值须为 JSON |

```ts
const projects = db.repository('projects');
const records = await projects.findMany({
  filter: { status: 'active', ownerId: 'user-1' },
});
```

等值简写仅支持根级 string／uuid／text、数值、time、boolean 字段。`null` 也可表达空值；boolean 的 `null` 表达数据库 NULL。不支持 Date 对象、数组、嵌套操作符对象、关系、JSON、date／datetime 字段，也不接受 `{}` 或 `undefined` 属性值。

`{ budget: { gte: 100 } }` 不是当前 Filter 语法；复杂条件用 Builder 或 AST。Compact Filter V2 尚未支持。

## Builder：逻辑组合

```ts
const records = await db.repository('projects').findMany({
  filter: (filter) =>
    filter.and([
      filter.string('status').eq('active'),
      filter.or([
        filter.number('budget').gte(100),
        filter.string('name').startsWith('Repository'),
      ]),
    ]),
});
```

回调返回一个条件、关系节点或分组节点。`and()`、`or()` 接受节点数组，可继续嵌套；不要把多个节点作为多个位置参数传入。不要依赖空分组表达“全选”或“全不选”，需要不筛选的查询直接省略 `filter`。

## JSON AST：对应同一套条件

```ts
import type { FilterAst } from '@nocobase/db';

const filter: FilterAst = {
  kind: 'filter',
  version: 1,
  collection: 'projects',
  root: {
    kind: 'group',
    logic: 'and',
    items: [
      { kind: 'condition', path: ['status'], operator: '$eq', value: 'active' },
      { kind: 'condition', path: ['budget'], operator: '$gte', value: 100 },
    ],
  },
};
const records = await db.repository('projects').findMany({ filter });
```

`root` 必须是 group。`collection` 可省略，提供时必须与当前 Repository 匹配。`path` 是逻辑字段路径数组，不是数据库列名；嵌套分组放入 `items`。Builder 会构造相同语义的节点，不需要调用 `.build()`。

## 按字段类型选操作符

| Builder 入口         | 方法                                                           | AST operator                                                                                      |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `string()`／`text()` | `eq / ne`                                                      | `$eq / $ne`                                                                                       |
| `string()`／`text()` | `includes / notIncludes / startsWith / endsWith`               | `$includes / $notIncludes / $startsWith / $endsWith`                                              |
| `number()`           | `eq / ne / gt / gte / lt / lte`                                | `$eq / $ne / $gt / $gte / $lt / $lte`                                                             |
| `date()`             | `on / notOn / before / after / notBefore / notAfter / between` | `$dateOn / $dateNotOn / $dateBefore / $dateAfter / $dateNotBefore / $dateNotAfter / $dateBetween` |
| `time()`             | `eq / ne`                                                      | `$eq / $ne`                                                                                       |
| `boolean()`          | `isTrue / isFalse`                                             | `$isTruly / $isFalsy`                                                                             |
| 上述全部入口         | `empty / notEmpty`                                             | `$empty / $notEmpty`                                                                              |
| `json()`             | 结构、路径、数组及 NULL                                        | 见 [JSON Filter](./json-filter.md)                                                                |

字段组不是任意强制转换：uuid 用 `string()`，text 用 `text()`，integer／bigInt／decimal 等数值字段用 `number()`，date／datetime 用 `date()`。类型不匹配报 `FIELD_CAPABILITY_NOT_SUPPORTED`。

数值 Filter 的字面量目前要求有限 `number`，不是原子更新所支持的 decimal string／bigint 输入。比较超出 JavaScript 安全精度的数值时，不要通过 `Number()` 强行转换绕过此限制。

### 空值与日期

- string／uuid／text 的 `empty()` 匹配数据库 NULL 或空字符串；其他非 JSON 标量的 `empty()` 仅匹配数据库 NULL。
- `eq(null)`／`ne(null)` 用于支持这些方法的字段，分别匹配数据库 NULL／非 NULL。字符串 `eq(null)` 不等价于 `empty()`。
- `ne('value')` 和 `notIncludes('value')` 遵循 SQL NULL 语义，不会自动把 NULL 行算入“不等于”。需要包含 NULL 时显式 OR 一个空值条件。
- `date.on()`／`notOn()` 仅支持 date，不支持 datetime。
- date 值用 `YYYY-MM-DD`；datetime 值用带时区的 ISO 时间字符串。Builder 的 Date 输入会转为完整 ISO 时间，因此仅用于 datetime；date 字段应明确传日期字符串。AST 应使用字符串。
- `between([start, end])` 是 **左闭右开**区间 `[start, end)`；`notBefore` 是 `>=`，`notAfter` 是 `<=`。
- boolean 简写和 Builder 最终使用同一组 SQL 操作符。当前 MySQL 布尔 Filter 的既有回归仍待修复，不能把切换输入形式当作已验证的绕过方式。

## 大小写不敏感和文本匹配

```ts
const records = await db.repository('projects').findMany({
  filter: (filter) =>
    filter.string('name').includes('repository', { mode: 'insensitive' }),
});
```

`eq / ne / includes / notIncludes / startsWith / endsWith` 的第二个参数支持 `mode: 'default' | 'insensitive'`；AST 在 condition 节点填写 `mode`。

- 省略 mode 使用数据库默认比较语义，不保证大小写敏感。
- insensitive 使用数据库小写转换比较；Unicode、语言及排序规则差异仍取决于数据库，并不等于通用 Unicode case folding。
- includes／前后缀输入按字面文本匹配；`%`、`_` 等不会被当作用户提供的 SQL 通配符。
- mode 不适用于数值、JSON、空值操作符；错误组合报 `INVALID_FILTER`。

## 关系条件

```ts
const records = await db.repository('projects').findMany({
  filter: (filter) =>
    filter.and([
      filter.string('owner.name').eq('Alice'),
      filter
        .relation('tasks')
        .some((tasks) =>
          tasks.and([
            tasks.string('status').eq('open'),
            tasks.number('points').gte(10),
          ]),
        ),
    ]),
});
```

`owner.name` 是经 to-one 关系到字段的路径；不能用 `tasks.status` 隐式穿过 to-many，必须使用关系量词。

| 方法                     | 含义                                       |
| ------------------------ | ------------------------------------------ |
| `some(callback)`         | 至少一个关联目标满足条件                   |
| `none(callback)`         | 没有关联目标满足条件；没有任何关联时也匹配 |
| `exists()`／`notEmpty()` | 存在关联目标                               |
| `notExists()`／`empty()` | 不存在关联目标                             |

量词每层只命名一个关系；跨多层关系应在子回调中继续使用 `relation()`。AST 使用 `kind: 'relation'`、`path: ['tasks']`、`quantifier: 'some'`，子条件放在 `filter` 分组。只有 some／none 接受子条件。

根 Filter 筛选父记录，不等于筛选返回的子记录；限制 include 中的子记录，应在关系 Select 中再次设置局部 Filter，见 [Select](./select.md)。当前没有关系 `every()`、通用 `not()` 或 `in()`。

## Context 变量

```ts
const records = await db.repository('projects').findMany({
  filter: (filter) => filter.string('ownerId').eq(filter.variable('$actor.id')),
  context: { actor: { id: 'user-1' } },
});
```

AST 中变量为 `{ kind: 'variable', path: '$actor.id' }`。路径以 `$` 开头，按 context 自有属性逐层读取；它不是 JavaScript 表达式或模板插值。变量替换后仍按字段能力验证。

- 路径格式错误：`INVALID_CONTEXT`。
- 变量缺失：`VARIABLE_NOT_FOUND`，不会自动删掉该条件。
- context 只是输入，不是可信身份来源；业务层须验证其来源和授权。

## 验证清单

- 同时验证 Builder 与 AST 的相同结果，以及无效字段／操作符。
- 文本测试包含 NULL、空串、大小写及 `%`／`_` 字面字符。
- 日期测试覆盖区间左右端点。
- 关系测试覆盖无关联、部分匹配和多条关联。
- 变量测试覆盖缺失值、错误类型和嵌套路径。

完整输入和错误结构见 [API reference](../reference/repository-api.md)。
