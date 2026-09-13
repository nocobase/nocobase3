# 原生数字结果路径调整验证（2026-09-10）

本轮落实已确认的 COUNT 和 DECIMAL 规则；SUM/AVG 的公开返回类型、规范化及计算精度适配保持现状。数据库未拆包。

- COUNT 保留非负安全整数 number，超界报错。
- DECIMAL 普通读取、MIN/MAX、关系与 mutation 结果保留数据库格式，不统一去末尾零。Oracle 可能返回 `.1`；PG/MySQL 保留 `42.000000`。
- PG/MySQL 不再为数字读取查 Collection 或增加文本投影。mysql2 固定 `decimalNumbers: false`，覆盖冲突的 driverOptions。
- PG 去掉 DECIMAL 专用创建回读。Repository 最终选择结果的通用回读仍保留。
- Query 无数字解码时直接返回映射后的行；有解码时仅处理已准备的输出列。Repository 分组结果的字段查找移到逐行循环之外。
- SQLite 保留自定义精确聚合，仅将普通结果文本函数改为保留表示形式。

## 验证

- 五库数字集成测试：300 项通过，无跳过；追加 COUNT SQL 断言后，五库原生结果回归测试 10 项再次通过。
- db 默认全量测试：195 文件通过，1255 项通过。另有 1 项既有 Oracle 专用 schema inspector 测试在默认 SQLite 环境跳过，与数字测试无关。
- db lint、typecheck、build 通过；app-server 和 repository-example 的 lint、typecheck、test、build 通过。
- 五库基准：10,000 行、每批写入 100 条，预热 2 次、重复 5 次，共 225 组场景，无跳过。最终测量期间没有同时运行测试或构建。

## 与既有同规模基线比较

单位 ms，中位数。SQL 次数为 Knex query 事件数，包含可见事务命令，不等于网络包数。

| 场景                                        | 数据库     |  原耗时 | 本轮耗时 | 原 SQL 次数 | 本轮 SQL 次数 |
| ------------------------------------------- | ---------- | ------: | -------: | ----------: | ------------: |
| Query 冷 Collection 缓存读取 100 行 INTEGER | PostgreSQL |   5.165 |    0.478 |           5 |             1 |
| Query 冷 Collection 缓存读取 100 行 INTEGER | MySQL      |   5.482 |    0.573 |           7 |             1 |
| 创建并返回 100 条 DECIMAL 记录              | PostgreSQL | 155.976 |  108.114 |         302 |           202 |
| 创建并返回 100 条 DECIMAL 记录              | MySQL      | 140.690 |  106.158 |         302 |           302 |
| Query COUNT                                 | PostgreSQL |   0.620 |    0.882 |           1 |             1 |
| Query COUNT                                 | MySQL      |   1.003 |    1.022 |           1 |             1 |

PG/MySQL 冷查询减少元数据 SQL，PG 创建每条少一次专用回读，均有 SQL 断言和 trace 支持。MySQL 创建次数未变，跨日耗时差不能完全归因于本轮代码。此次 COUNT 耗时没有稳定改善，不能以去掉 CAST 推导必然提速。

其他三库冷读取及创建 SQL 次数未变。SQLite 自定义 SUM/AVG、Oracle 的 NUMBER 传输与 SQL Server 的聚合输入提升仍保留，后续按已确定的行为边界分别评估。

## 重现

从 packages/libs/db 使用 Node 24、启动专用测试服务后运行：

```sh
pnpm benchmark:numeric --databases=all --rows=10000 --writes=100 --repeats=5 --warmups=2 --output=benchmarks/results/2026-09-10-native-results
```

原始数据：[JSON](./results/2026-09-10-native-results/results.json)、[完整报告](./results/2026-09-10-native-results/report.md)。这些结果文件按现有规则不进入 Git；本摘要保留主要结论。对照为 [2026-09-09 基线](./BASELINE-2026-09-09.md) 中 10,000 行这一档。
