---
title: BigInt 与 Decimal 精确数值处理
description: 记录 Query where 与 Repository filter 的精确数值风险、业界处理方式和候选契约；暂缓实施，输入、返回类型及数据库能力边界尚未定案。
---

# BigInt 与 Decimal 精确数值处理

> 状态：待决策，暂缓实施。本文记录问题与候选方案，不代表当前 API 或已批准的实现计划。记录日期：2026-09-05。

## 问题

JS `number` 的安全整数范围为 `±(2^53 - 1)`，即 `±9007199254740991`。超出安全范围不一定溢出，但不能保证整数精度。已经失真的 `number` 无法通过 `BigInt()` 或 `String()` 恢复。

```javascript
9007199254740993 === 9007199254740992; // true
BigInt(9007199254740993); // 9007199254740992n

// Preserve precision from the point of input.
const integerText = '9007199254740993';
const integerValue = 9007199254740993n;
const decimalText = '12345678901234567890.123456';
```

风险不仅包括 BigInt：

| 类型或场景        | 风险                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| 数据库 BIGINT     | 64 位整数范围超过 JS 安全整数范围；JS 原生 `bigint` 不受该安全范围限制，但仍须满足数据库范围 |
| DECIMAL / NUMERIC | 高精度整数和小数可能失真；即使 `0.1` 也不能用二进制浮点精确表示                              |
| FLOAT / DOUBLE    | 本来就是近似数；有效位数和范围受数据库实际类型影响                                           |
| SUM / COUNT / AVG | 单条数据安全不代表聚合结果安全，平均值还涉及小数精度                                         |
| JSON 数字         | 普通 `JSON.parse()` 可能在 Repository 接收数据之前丢失精度                                   |

普通 32 位整数，包括无符号 32 位整数，在 JS 安全整数范围内。字段名不能决定类型：Collection 不一定有主键，主键和关系键不一定叫 `id`，`id` 也不一定是 BigInt。

## 当前实现的缺口

以下为记录时的源码状态，后续实施前应重新核对。

| 位置                | 当前情况与问题                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query `where`       | 参数路径未强制转为 `number`，可以传字符串或 `bigint`；但这不等于所有驱动的绑定和读取已保证精确                                                      |
| Repository `filter` | `integer / increments / bigInt / decimal / float / double` 共用有限 `number` 校验；拒绝精确数字字符串和原生 `bigint`，却未拒绝不安全的整数 `number` |
| Filter 类型         | `FilterScalar` 不包含原生 `bigint`，`NumberFilterOperators` 的比较操作数为 `number`                                                                 |
| Cursor              | 部分数值字段已接受字符串或 `bigint`，但校验与 Filter 不一致                                                                                         |
| Values / 原子更新   | 写入值可包含 `bigint`；原子更新接受数值字符串，整数操作数已有安全整数检查，但尚未形成统一精确数值契约                                               |
| 聚合返回            | 部分 `count` 路径直接执行 `Number()`，缺少超出安全范围时的明确策略                                                                                  |
| 嵌套 JSON           | 若数据库直接把精确数值构造成 JSON number，驱动解析后再解码已经太晚，需要审计相关投影路径                                                            |

主要核对位置：[`repository/types.ts`](../../../src/repository/types.ts)、[`repository/repository.ts`](../../../src/repository/repository.ts)、[`numeric-mutation.ts`](../../../src/repository/numeric-mutation.ts)、[`knex-execution-adapter.ts`](../../../src/repository/internal/knex-execution-adapter.ts)、[`Query Knex adapter`](../../../src/query/internal/knex/adapter.ts)。

## 业界参考

业界没有统一要求全部使用字符串，通常区分应用类型、数据库传输类型和 JSON 表示。

| 实现                                         | BigInt                                                                                         | Decimal                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 传统 Prisma Client                           | 应用值为原生 `bigint`                                                                          | 应用值为 `Prisma.Decimal` 对象             |
| 本次参考的 Prisma 新一代 ORM PostgreSQL 源码 | 默认应用值为 `bigint`，数据库传输和规范 JSON 使用字符串；另有超出安全范围即报错的 number codec | 默认应用值与规范 JSON 使用精确十进制字符串 |
| Node `pg` 默认文本解析                       | `int8` 通常为字符串                                                                            | `numeric` 通常为字符串                     |
| Node `mysql2`                                | 受大数配置影响，可返回字符串                                                                   | 默认通常返回字符串                         |
| JSON / HTTP 接口                             | 大整数常用字符串                                                                               | 精确小数常用字符串                         |

驱动行为受版本、配置和自定义解析器影响，不能仅凭类型声明推断实际精度。Prisma 新一代 ORM 的上述结论来自本次本地源码检查，不代表所有 Prisma 版本和数据库目标。

值得借鉴的是字段关联的编码／解码机制，而非直接照搬返回类型。例如，构造 PostgreSQL 嵌套 JSON 时，先将 BigInt／Numeric 的投影转换为文本，再构造 JSON，避免解析 JSON number 时失真；这不应改变 WHERE 和 ORDER BY 的数值语义。

## 候选方案与取舍

### 方案 A：Repository 返回精确字符串

| 字段                   | 候选输入                                     | 候选返回值         |
| ---------------------- | -------------------------------------------- | ------------------ |
| `integer / increments` | 安全整数 `number`，并检查实际字段范围        | `number`           |
| `bigInt`               | 整数字符串、原生 `bigint`、安全整数 `number` | 固定为整数字符串   |
| `decimal`              | 精确十进制字符串                             | 固定为十进制字符串 |
| `float / double`       | 有限的 `number`                              | `number`           |

优点是适合动态 Collection、HTTP、Agent、Filter JSON 和 cursor，不依赖 Decimal 类库，也不会因数值大小改变返回类型。缺点是应用中的字符串比较和加法不具备数值语义，计算需要显式 `BigInt(value)` 或 Decimal 类库。

### 方案 B：Repository 返回应用精确类型

BigInt 返回原生 `bigint`；Decimal 返回字符串或选定的 Decimal 类型。JSON 边界另行序列化。

优点是更适合服务端精确计算，BigInt 有明确的原生类型语义。代价是增加 JSON 序列化要求；若返回 Decimal 对象，还涉及依赖和公开类型契约。

当前讨论倾向方案 A，但**尚未定案**。暂不引入按数值大小切换返回类型或多种可配置返回模式；是否需要这些能力仍应由实际场景决定。

## 后续实施需要一起处理的范围

- 字段驱动的输入规范化、驱动参数绑定、结果解码和 JSON 投影复用一套规则，不能只放宽 Filter 类型。
- Filter Builder 可考虑增加 `.bigInt()`、`.decimal()`；现有 JSON AST 结构可以保留，通过字段元数据解释字符串，无需额外类型包装。这些方法目前不是可用 API。
- Query `where` 不掌握 Collection 元数据，不猜测数字形状字符串的类型；精确传值与 Repository 的字段校验分别承担职责。
- 覆盖普通 values、原子更新、Filter 变量、关系 selector、sourceKey / targetKey、cursor、嵌套关系、mutation returning 和聚合。
- 拒绝不安全的整数 `number`；按实际字段范围、precision / scale 检查。小数舍入策略及科学计数法、特殊值的支持范围需要明确。
- `count` 可考虑保留 `number` 并在超出安全范围时报错；`sum / avg / min / max` 应分别定义结果类型，不能统一强转 `Number()`。
- 普通 JSON 字段不自动改写内部数字；精确数值需要由该 JSON 数据契约明确采用字符串。
- PostgreSQL、MySQL 的驱动必须在精度丢失前保留值。SQLite NUMERIC affinity 不等于原生精确 Decimal，需明确能力限制，不能把 TEXT 存储与数值运算等价处理。

## 恢复实施前的决策与验证

先确认 BigInt／Decimal 返回类型、Decimal 输入与舍入规则、聚合返回契约和各数据库能力边界，再分阶段实现与提交。

测试至少覆盖安全整数边界及正负越界、64 位字段范围、精确小数、非法输入、写入读回、Filter 比较与排序、原子更新、关系键、双向 cursor、嵌套 JSON、returning 和聚合。验证不能只检查“返回了字符串”，还必须检查完整有效数字没有变化。

本提案不启动代码改动，也不承诺这些能力已经实现。业务代码仍以正式文档、公开类型和实际测试为准。
