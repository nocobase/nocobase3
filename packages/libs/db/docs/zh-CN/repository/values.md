---
title: Repository Values：赋值、变量与原子更新
description: 定义 values 对象和 callback、变量与 literal、原子更新、身份限制以及根级和关系输入的支持边界。
---

# Repository Values：赋值、变量与原子更新

values 描述写入字段。方法参数、返回值和完整流程见 [createOne](./methods/create-one.md)、[createMany](./methods/create-many.md)、[updateOne](./methods/update-one.md)、[updateMany](./methods/update-many.md)；根级 upsert 用 create/update 两个分支。示例模型见[概览](./overview.md)。

## 三种输入形式

Temporal values follow the [date/time contract](./temporal-values.md): `datetime` is zone-free, `datetimeTz` is an instant, and outputs are canonical strings. Do not rely on driver-local `Date` conversion.

普通对象：

```ts
await db
  .repository('projects')
  .createOne({ values: { id: 'plain-1', name: 'Plain' } });
```

同步 callback：

```ts
await db.repository('projects').createOne({
  values: (v) => ({ id: 'variable-1', name: v.variable('$input.name') }),
  context: { input: { name: 'Variable' } },
});
```

纯 JSON 节点：

```ts
await db.repository('projects').createOne({
  values: { id: 'json-1', name: { kind: 'variable', path: '$input.name' } },
  context: { input: { name: 'Variable' } },
});
```

根级 createOne/updateOne/updateMany 的 values、upsertOne 的 create/update 支持 callback 返回字段对象；createMany 的 callback 返回非空数组。callback 接收 ValuesBuilder，不直接接收 context，不支持 async。普通字段 callback 不用于取变量；关系字段 callback 用于关系操作，数值字段 callback 用于原子更新。

## 变量与 literal

变量路径以 $ 开头，按 context 自有属性解析。缺失或 undefined 报 VARIABLE_NOT_FOUND；路径非法报 INVALID_CONTEXT；解析结果与字段类型不符报 INVALID_MUTATION。错误提供 path 和 details.variable。完整规则见 [Context](./context.md)。

JSON 字段支持整体引用，不递归扫描普通 JSON 内部的变量标记。变量解析得到的数据不再次解释为变量或操作。需要保存字段值边界上的标记对象时使用 literal：

```ts
await db.repository('projects').createOne({
  values: (v) => ({
    id: 'literal-1',
    name: 'Literal',
    metadata: v.literal({ kind: 'variable', path: '$example' }),
  }),
});
```

这里 metadata 保存对象本身。纯 JSON 等价输入是 `{ kind: 'literal', value: { kind: 'variable', path: '$example' } }`。普通 `{ color: 'blue' }` 不需要 literal。literal 不绕过字段、可空性或操作数校验。

| 位置                                     | 当前支持                                   |
| ---------------------------------------- | ------------------------------------------ |
| 根级标量赋值、createMany 各条标量值      | 变量或 literal                             |
| 根级及嵌套 update/upsert 原子操作数      | 变量或 literal                             |
| 整个 values 数组或对象                   | 允许 callback 构造，不允许变量替换整个结构 |
| 字段名、操作名、关系名                   | 不支持变量替换                             |
| 嵌套关系 values、选择器、through payload | 变量或 literal                             |

嵌套 create/update/upsert 字段、connect/disconnect/set 选择器字段和 through payload 均支持变量。嵌套对象复用外层 ValuesBuilder，不支持嵌套 values 再声明根级 callback；关系字段 callback 仍用于构造关系操作。变量解析不取消关系作用域、唯一选择器和受管理字段限制。示例见[关系写入](./relation-mutations.md)。

## 身份与受管理字段

Collection 不要求 id 或主键。单条写入需要完整非空主键或无条件唯一选择器用于定位／重读；nullable unique 的 NULL 和条件唯一约束不能提供该身份。不带 select 的批量标量写入不要求主键，批量 returning 要求主键。

| 模型的实际身份                       | 单条 create/update/delete            | 不带 select 的批量标量写入 | 带 select 的批量 returning |
| ------------------------------------ | ------------------------------------ | -------------------------- | -------------------------- |
| 明确的单字段主键                     | 支持，使用真实字段名与类型           | 支持                       | 支持                       |
| 复合主键                             | 支持，定位时包含完整键值             | 支持                       | 支持                       |
| 无主键，仅有完整非空的无条件唯一键   | 支持；upsert 也要求完整唯一条件      | 支持                       | 当前不支持                 |
| 只有 nullable unique 且当前值为 NULL | 该键不能提供身份，需另一个完整唯一键 | 支持                       | 当前不支持，除非另有主键   |
| 无任何可用唯一身份                   | 当前不支持                           | 支持                       | 当前不支持                 |

上表仍受 Collection 可写性和数据库约束限制。普通读取不要求唯一身份；cursor 和 distinct 的稳定排序需要另外核对[分页](./pagination.md)与[去重](./distinct.md)规则。完整的无主键唯一键示例见 [createOne](./methods/create-one.md#无主键但有唯一键)。

- 主键未配置数据库生成时，需要在创建值中显式提供。
- 自增、数据库生成和乐观锁版本字段由数据库／Repository 管理，不手动赋值。
- 更新省略字段表示不改动；null 表示写入空值，受实际约束限制。
- context 不自动填充任何字段，也不充当权限控制。
- 各字段名不决定类型；bigInt/decimal 的统一精度契约尚未完成，仍属于[提案议题](../proposals/precise-numeric-values.md)，不要将候选方案视为当前返回类型承诺。

## 写入值与返回值不是同一层契约

values callback 和变量只处理输入，不改变驱动的结果解码。尤其 JSON 字段可能由驱动返回对象或 JSON 文本，Decimal／BigInt 也没有统一的跨数据库返回表示；不能仅根据写入时传了对象或字符串，断言查询返回同一种 JS 类型。验证精度和 JSON 内容应使用目标数据库的实际读写结果，不能用类型断言替代验证。

## 数值原子更新

```ts
await projects.updateOne({
  filter: { id: 'project-1' },
  values: { budget: (value) => value.increment('100.25') },
});

await db.repository('tasks').updateOne({
  filter: { id: 'task-1' },
  values: { points: { decrement: 1 } },
});
```

| 操作 | JSON 输入          | Builder                         |
| ---- | ------------------ | ------------------------------- |
| 加   | `{ increment: 2 }` | `(value) => value.increment(2)` |
| 减   | `{ decrement: 2 }` | `(value) => value.decrement(2)` |
| 乘   | `{ multiply: 2 }`  | `(value) => value.multiply(2)`  |
| 除   | `{ divide: 2 }`    | `(value) => value.divide(2)`    |

运算在数据库中执行，避免应用端“先读后写”覆盖并发结果。每个字段每次只能选择一个运算，支持 integer、bigInt、decimal、float、double 的更新分支，包括批量和嵌套更新。

边界必须保留：

- 不用于 create；不修改主键、唯一键、生成字段或版本字段。
- 操作数是有限 number、bigint 或数值字符串；整数列要求精确整数，避免不安全的 JavaScript number。
- 除数不能为零；NULL 参与运算仍为 NULL，不会自动当作零。
- 除法、舍入、精度与溢出按数据库列类型执行，不保证各数据库整数除法完全一致。
- JSON 字段里的 `{ increment: 1 }` 是普通 JSON 数据，不是运算。
- bigint 不是原生 JSON 可序列化值；需要 JSON 传输时使用合法数值字符串。

## 使用变量作为操作数

```ts
await db.repository('tasks').updateOne({
  filter: { id: 'task-1' },
  values: (v) => ({
    points: (points) => points.increment(v.variable('$delta')),
  }),
  context: { delta: 2 },
});
```

操作结构必须由调用方明确声明，变量解析出的对象不能变成 increment/connect 等操作。根级 upsert 两个分支都会预校验，即使最终只执行一个分支。

验证依据：[变量与 callback](../../../tests/integration/repository/capabilities/values-variables.test.ts)、[原子更新](../../../tests/unit/repository/values/atomic.test.ts)。
