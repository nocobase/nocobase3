# 精确数字输入

Repository 的数字输入与读取结果遵循以下约定：

| 字段           | 普通写入                                     | 筛选                            |
| -------------- | -------------------------------------------- | ------------------------------- |
| INTEGER        | 安全整数 `number`                            | 安全整数 `number`               |
| BIGINT         | 整数字符串、安全整数 `number`、原生 `bigint` | 整数字符串、安全整数 `number`   |
| DECIMAL        | 本次不改变普通写入规则，精确值建议使用字符串 | 合法十进制字符串、有限 `number` |
| FLOAT / DOUBLE | 本次不改变普通写入规则                       | 有限 `number`                   |

`increments` 由数据库生成，不能作为普通可写字段；筛选使用安全整数。
可空字段支持 SQL NULL，筛选使用 `eq(null)`、`ne(null)` 或空值运算符。

```ts
const repository = database.repository('accounts');
const { record } = await repository.createOne({
  values: { key: 'A', balance: '9007199254740993' },
});
await repository.findOne({ filter: { balance: record.balance } });
await repository.findMany({
  filter: (f) =>
    f.and([
      f.number('balance').gte('9007199254740992'),
      f.number('balance').lt('9007199254740994'),
    ]),
});
```

`f.number()` 的 TypeScript 参数允许 `number | string`，运行时依据真实字段类型校验。
字符串支持简写、Builder 和上下文变量，不经过 JavaScript `Number()`。
BIGINT 字符串只接受带可选正负号的整数；DECIMAL 支持小数和科学计数法。
SQL Server 在绑定前将科学计数法展开为普通十进制字符串，不转换被比较的列。
筛选 JSON 不支持原生 JavaScript bigint，请使用字符串。

普通 INTEGER / BIGINT 写入复用表达式写入的校验。`createOne`、`createMany`、
`updateOne`、`updateMany` 的非法数值在执行写入前报 `INVALID_MUTATION`。
不能通过把不安全 number 转为字符串恢复精度，应从数据源保留原始数字字符串。

## 原子更新

```ts
await repository.updateOne({
  filter: { key: 'A' },
  values: { balance: { increment: '2' } },
}); // balance: '9007199254740995'
```

整数运算的操作数支持安全整数 number、整数字符串和 bigint。MySQL / SQL Server
将精确数字操作数绑定为明确 precision/scale 的 DECIMAL，避免浮点提升或提前舍入。
SQLite 的整数更新通过连接内函数完成，保持 int64 精度，并在溢出时终止写入。
PG / Oracle 保留原生运算；本次没有改变普通读取和聚合 SQL。

可整除的整数除法保持精确。不能整除时，写回整数列仍遵循各数据库原有的
截断/舍入规则；本次没有制定统一的小数除法策略。FLOAT / DOUBLE 和 SQLite DECIMAL
继续采用原生浮点计算，数据库物理范围、scale 和存储精度限制仍然适用。

低层 Query 不增加基于 Collection 的输入校验，Oracle BIGINT 存储范围与
SQLite DECIMAL 存储方案留待单独处理。
