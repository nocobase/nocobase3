# 原生 SUM / AVG 调整验证（2026-09-10）

本轮继续 [DECIMAL 原生读取调整](./NATIVE-RESULTS-2026-09-10.md)，将聚合行为切换到新约定：

| 场景                                | 返回类型与处理                    |
| ----------------------------------- | --------------------------------- |
| COUNT                               | 非负安全整数 number，超界报错     |
| SUM/AVG(integer / BIGINT / DECIMAL) | 数据库格式 string，不规范化末尾零 |
| SUM/AVG(FLOAT / DOUBLE)             | number，原生浮点聚合              |
| MIN/MAX                             | 保留字段结果类型与数据库格式      |
| 空输入                              | COUNT 为 0，其他聚合为 null       |

PostgreSQL/MySQL 不为数字聚合读取 Collection，不增加输入或输出 CAST。PostgreSQL 使用原生 AVG，包括极大整数舍入；例如 `999999999999999998` 与 `999999999999999999` 的平均值返回 `999999999999999999`，不再承诺保留 `.5`。

SQL Server 整数 SUM/AVG 输入提升为 DECIMAL(38,0)，DECIMAL 输入使用原生 precision/scale 规则，浮点输入直接聚合。SQLite 整数及 DECIMAL 保留自定义精确聚合，浮点直接使用原生函数。Oracle 精确结果保留文本传输、浮点保留数字。其他三库的字段信息按次执行缓存并传给嵌套查询，不存入共享 Query Builder。

Oracle 全面切换驱动 fetchTypeHandler 的重构、SQLite 精确累加算法进一步优化及数据库拆包不在本轮内；当前适配已经实现上述公开行为。

## 验证

- 五库数字集成测试 315 项通过；其他聚合、关系、分组集成测试 140 项通过，均无跳过。
- 补充高精度 DECIMAL 容量测试后，原生聚合套件共 25 项再次通过：覆盖超过 20 位整数部分及 20 位小数，避免原 DECIMAL(38,18) 输入限制。
- db 默认全量测试：196 文件、1258 项通过，1 项原有 Oracle 专用结构检查在 SQLite 环境跳过。上述新增容量用例在此全量执行后单独跑过五库。
- db / repository-input 的 lint、typecheck、test、build 通过；db 公共 API 检查、benchmark typecheck 通过。
- app-server / repository-example 的 lint、typecheck、test、build 通过。
- 五库十万行基准 225 组场景完成，预热 2 次、测量 5 次，每批创建 100 条。结果类型验证包含浮点 SUM/AVG 的 number。

## 性能观察

同为 Query、100,000 行，每次查询同时执行 SUM 和 AVG。单位 ms、中位数，对照 2026-09-09 同规模基线。

| 数据库 / 字段      | 原耗时 | 本轮耗时 |
| ------------------ | -----: | -------: |
| SQLite FLOAT       | 50.033 |    3.896 |
| PostgreSQL FLOAT   | 24.935 |    5.334 |
| SQL Server FLOAT   | 38.792 |   21.958 |
| PostgreSQL INTEGER |  7.744 |    4.634 |
| PostgreSQL DECIMAL |  8.234 |    5.477 |
| MySQL DECIMAL      | 12.075 |   11.805 |
| Oracle DECIMAL     |  3.701 |    4.075 |
| SQLite DECIMAL     | 50.028 |   51.075 |

SQLite 浮点绕过 JS 精确聚合，PG 浮点 AVG 去掉 numeric 输入转换，SQL Server 浮点去掉 DECIMAL 输入转换；这些耗时改善伴随已批准的原生计算语义变化，不能理解为相同精度保证下的纯性能优化。小幅耗时差不足以说明回归或稳定收益。SQLite 精确 DECIMAL 聚合仍有约 50 ms 成本，本轮没有声称解决这一项。

浮点计算误差继续记录在原始 accuracy 结果中；返回 number 不改变数据库本身的浮点误差。PG 极大整数 AVG 的舍入边界由独立测试验证。

## 重现

在 packages/libs/db 下使用 Node 24，启动测试数据库后：

```sh
pnpm benchmark:numeric --databases=all --rows=100000 --writes=100 --repeats=5 --warmups=2 --output=benchmarks/results/2026-09-10-native-aggregates
```

原始产物：[JSON](./results/2026-09-10-native-aggregates/results.json)、[完整报告](./results/2026-09-10-native-aggregates/report.md)。原始结果目录按现有规则不进入 Git，本摘要保留结论。
