---
title: Query 聚合与 having
description: 使用聚合表达式、groupBy、having 和 havingRef 编写跨数据库统计查询，并使用统一的精确聚合返回类型。
---

# 聚合和 having

聚合通过 `eb.fn` 表达：

```ts
const rows = await db
  .query()
  .selectFrom('orders')
  .select((eb) => [
    'customerId',
    eb.fn.countAll().as('total'),
    eb.fn.sum('amount').as('amountTotal'),
  ])
  .groupBy('customerId')
  .having((eb) => eb(eb.fn.countAll(), '>', 5))
  .execute();
```

## 支持的聚合函数

- `eb.fn.count(column)`
- `eb.fn.countAll(table?)`
- `eb.fn.sum(column)`
- `eb.fn.avg(column)`
- `eb.fn.min(column)`
- `eb.fn.max(column)`
- `.as(alias)`
- `.distinct()`

不提供 terminal `count()`；需要统计时使用聚合表达式。

## groupBy

```ts
await db
  .query()
  .selectFrom('orders')
  .select((eb) => ['status', eb.fn.countAll().as('total')])
  .groupBy('status')
  .execute();
```

`groupBy()` 支持单个字段或字段数组：

```ts
.groupBy('status')
.groupBy(['tenantId', 'status'])
```

## having

`having()` 的表达方式和 `where()` 一致：

```ts
await db
  .query()
  .selectFrom('orders')
  .select((eb) => ['status', eb.fn.countAll().as('total')])
  .groupBy('status')
  .having((eb) => eb(eb.fn.countAll(), '>', 1))
  .execute();
```

字段和字段比较使用 `havingRef()`：

```ts
await db
  .query()
  .selectFrom('metrics')
  .select(['metricName', 'planned', 'actual'])
  .groupBy(['metricName', 'planned', 'actual'])
  .havingRef('actual', '>', 'planned')
  .execute();
```

## 统一返回类型

Query 和 Repository 在五种数据库上使用相同的聚合结果类型：

| 操作                                  | 返回类型                 |
| ------------------------------------- | ------------------------ |
| COUNT                                 | `number`，无匹配时为 `0` |
| SUM / AVG(integer / bigInt / decimal) | `string \| null`         |
| SUM / AVG(float / double)             | `number \| null`         |
| MIN / MAX(bigInt)                     | `string \| null`         |
| MIN / MAX(decimal)                    | `string \| null`         |
| MIN / MAX(integer)                    | `number \| null`         |
| MIN / MAX(float / double)             | `number \| null`         |

float / double 的 SUM/AVG/MIN/MAX 与普通字段读取一样返回数字，使用原生浮点计算；浮点存储和计算本身的精度限制不变。

COUNT 在结果边界校验后转为 number，最大支持 Number.MAX_SAFE_INTEGER（9,007,199,254,740,991）；超过上限抛出 INVALID_STORED_VALUE，不会静默舍入。

给聚合表达式使用 `.as()` 指定结果字段名。别名不改变类型。
精确数值的 SUM/AVG 和 DECIMAL 的 MIN/MAX 保留数据库输出格式，不去掉末尾零，
也不强行补零。例如 `'42.5000'` 保持不变，Oracle 可以返回 `'.5'`。
空集合或全部为 null 的 SUM/AVG/MIN/MAX 返回 null；COUNT(column) 忽略 null。

AVG 遵循数据库计算精度和舍入规则，允许小数位数及边界结果不同。比如 1/3 可以返回
`'0.3333'` 或更多位小数的字符串。不要用 `Number()` 处理超出安全范围的结果。
聚合类型参数只是 TypeScript 声明，不会把运行时字符串转换成数字。

数据库在分组、HAVING 和排序时仍按数值比较。字符串转换在结果读取边界进行；
SQLite 的整数和 DECIMAL SUM/AVG 使用连接内注册的精确聚合函数；FLOAT/DOUBLE 使用原生聚合。

### 计算与容量边界

- PostgreSQL 的 SUM/AVG 使用原生计算，不扩大 AVG 输入精度。例如 `999999999999999998` 和 `999999999999999999` 的 AVG 可以舍入为 `999999999999999999`，不保证保留 `.5`。
- MySQL 保留原生精确 DECIMAL 聚合行为。
- Oracle 在数字转成 JS number 前保留字符串；原有 bigInt 字段映射仍为 NUMBER(18,0)，本次不改变存储范围。
- SQL Server 使用 COUNT_BIG；整数 SUM/AVG 先提升为 DECIMAL(38,0)，以扩大 SUM 范围并保留 AVG 小数；DECIMAL 输入保留原生聚合 precision/scale 规则，浮点输入使用原生计算。精确数字在驱动转换成 number 前投影为文本。
- SQLite 的精确聚合使用 BigInt 系数累加，AVG 至少保留 18 位小数并将中点舍入到远离零的方向。

类型一致不意味着各库的存储范围和聚合容量无限或相同。已经通过浮点数写入而丢失的信息、
SQLite REAL 数据本身的近似值，以及用户自定义 SQL 表达式不在 BIGINT 精确性保证内。
本契约适用于 `db.query()` 的聚合表达式与 Repository 聚合入口，直接取得 Knex client
后执行的原生查询仍遵循相应驱动规则。

Query 的 SUM/AVG 默认 TypeScript 类型为 `string | number | null`，Repository 共享聚合类型同样包含两种数值表示。
普通 TypeScript `number` 无法区分 INTEGER 与 FLOAT 字段，不能仅据此推导聚合一定返回 number。
PG/MySQL 不为聚合类型加载 Collection；其他库在执行前准备必要的字段信息，供 SQL 生成与解码使用。
同步 `compile()` 不加载这些信息，因此其他库的聚合输入适配可能与实际执行不同。
