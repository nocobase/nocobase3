---
title: Repository 后续能力路线
description: Repository 查询与写入高级能力的实现顺序、V1 边界和分阶段交付约定。
---

# Repository 后续能力路线

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：V1 路线已完成。** 本文记录实现顺序、已交付边界和暂不纳入 V1 的能力。

## 实现顺序

The next iteration is tracked in [Repository V1.1 roadmap](./v1.1-roadmap.md).

| 阶段 | 能力                     | V1 边界                                                                                                                                         |
| ---: | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | 标量 Select 返回类型推导 | 已实现：Builder 的直接标量 `fields()` 推导 `findMany()`、`findOne()`、`createOne()` 和 `updateOne()` 返回类型；动态 Select AST 保持完整记录类型 |
|    2 | Delete returning/select  | 已实现：`deleteOne()` 通过 `select` 返回删除前快照；`deleteMany()` returning 已在阶段 4 完成                                                    |
|    3 | 根级 `upsertOne()`       | 已实现：基于主键或唯一约束执行 create/update，支持关系 values、optimistic lock 和并发创建冲突重试                                               |
|    4 | 批量 mutation returning  | 已实现：显式 `select` 时返回 `records`；create 保持输入顺序，update/delete 按 mutation 前主键排序，省略时保持 count 快路径                      |
|    5 | Aggregate                | 已实现：根级 `count`、`sum`、`avg`、`min`、`max` Builder 与 JSON AST；固定空集合、精度和 filter 输入集合规则                                    |
|    6 | GroupBy                  | 已实现：复用 Aggregate Builder/AST，支持直接标量分组、结果 `having`、聚合别名排序和 Builder 返回类型推导                                        |
|    7 | Distinct                 | 已实现：`distinct: ['country', 'role']` 按组合选择完整代表记录，sort 决定代表行、分页作用于去重结果，不公开 `distinctOn`                        |
|    8 | 统一分页                 | 已实现：根级 cursor、relation-local limit/cursor 共用稳定直接标量 sort 与字典序条件；关系分页按父记录独立生效                                   |
|    9 | Streaming                | 已实现：AsyncIterable 根级记录流，支持查询条件与标量 select；提前取消销毁底层流并释放资源，不支持 include/aggregate/groupBy                     |

## 已冻结的组合原则

- `distinct` 是非空的直接标量字段数组；`sort` 决定每组保留的代表记录，分页作用于去重结果。
- Cursor 必须基于稳定的非空标量排序；V1 不把 relation aggregate sort 作为 cursor 轴，也不支持每个父记录使用不同 cursor。
- 根级和 relation-local cursor 共用同一套字段校验与字典序边界编译器；relation-local `limit` 对每个父记录独立生效。
- `Aggregate` 先于 `GroupBy`；批量 returning 先定义跨数据库结果语义，再利用数据库原生 `RETURNING` 做优化。
- Streaming 在查询契约稳定后接入，复用根级查询编译，并独立约束资源生命周期。

## 分阶段交付

每个阶段遵循同一节奏：

```text
补充该阶段的短设计（如需要）
→ 实现公共类型和运行时
→ 添加类型、单元或集成测试
→ 运行受影响包的 lint / typecheck / test / build
→ 独立提交
```

一个阶段未完成验证和提交前，不混入下一阶段。涉及跨数据库 lowering 的阶段至少验证 SQLite，并在能力依赖或方言差异明显时扩大到 PostgreSQL、MySQL、Oracle 和 MSSQL。

## 暂不纳入 V1

- PostgreSQL 专用 `distinctOn`。
- 每个父记录分别提供 cursor 的 `cursorByParent`。
- relation-local offset 与任意深度的嵌套分页组合。
- 批量 relation mutation returning。
- Streaming include、aggregate、groupBy、自动恢复和自动重试。
