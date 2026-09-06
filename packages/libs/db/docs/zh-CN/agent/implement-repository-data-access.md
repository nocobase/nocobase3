---
title: 使用 Repository 实现数据访问
description: 按业务任务选择 Repository 查询、写入、关系、分页和聚合文档，核对 Collection 前提、事务及权限边界，并通过类型检查与真实数据库用例验证实现。
---

# 使用 Repository 实现数据访问

本页是 Agent 的任务入口，不重复主题页完整契约。当前 Repository 已实现；不要因旧设计材料中的“规划接口”声明而改用错误层级，也不要从 Prisma 经验猜测新接口。

## 按任务最小阅读

| 任务                    | 先读方法                                                                                                                                               | 按需补充                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 单条读取                | [findOne](../repository/methods/find-one.md)                                                                                                           | filter、select                                                                                                  |
| 列表、翻页、去重        | [findMany](../repository/methods/find-many.md)                                                                                                         | [pagination](../repository/pagination.md)、[distinct](../repository/distinct.md)、[sort](../repository/sort.md) |
| 计数、存在性            | [count](../repository/methods/count.md)、[exists](../repository/methods/exists.md)                                                                     | filter、事务一致性                                                                                              |
| 创建                    | [createOne](../repository/methods/create-one.md)、[createMany](../repository/methods/create-many.md)                                                   | [values](../repository/values.md)、[context](../repository/context.md)                                          |
| 更新与 upsert           | [updateOne](../repository/methods/update-one.md)、[updateMany](../repository/methods/update-many.md)、[upsertOne](../repository/methods/upsert-one.md) | values、[transactions](../repository/transactions.md)                                                           |
| 删除                    | [deleteOne](../repository/methods/delete-one.md)、[deleteMany](../repository/methods/delete-many.md)                                                   | 作用域与外键约束                                                                                                |
| 关系写入                | [relation-mutations](../repository/relation-mutations.md)                                                                                              | 对应根方法、through payload                                                                                     |
| JSON 条件               | [filter](../repository/filter.md#json-字段条件)                                                                                                        | 字段与方言能力                                                                                                  |
| 统计、分组              | [aggregate](../repository/methods/aggregate.md)、[groupBy](../repository/methods/group-by.md)                                                          | [select](../repository/select.md#关系聚合与独立分支)                                                            |
| Incremental consumption | [findMany asynchronous iteration](../repository/methods/stream.md)                                                                                     | Transactions and query lifecycle                                                                                |
| 能力描述与预校验        | [mutation-validation](../repository/methods/mutation-validation.md)                                                                                    | 实际执行时的错误处理                                                                                            |

方法页包含参数、返回、完整调用和错误边界；共享主题维护 Filter/Values/Select 等规则。根级与嵌套关系写入均支持显式 values 变量，嵌套 Filter 共用顶层 context；支持范围和限制以 Values 与关系写入文档为准。

## 实施步骤

1. 确认目标 Connection 和 Collection 逻辑名。通过公开 collections API 核对字段类型、主键/唯一约束、关系键、可空性及 optimisticLock；不要猜物理表名。
2. 确认调用方可访问的字段、记录和关系。Repository 与 context 不自动执行应用 ACL；不要直接把不可信输入当作授权后的 values/select/filter。
3. 按任务选择方法与文档。单条读写、批量写入和嵌套关系写入的约束不同；先核对返回结构再编写调用方逻辑。
4. 使用 Builder 或可序列化 JSON，保持同一语义。不要将 callback 塞进 JSON；不要对 JSON AST 套用 Prisma where/orderBy/data 的形状。
5. 原子多步操作从事务 Connection 获取所有 Repository。未处于事务时，嵌套写入使用自己的事务；已有事务会直接复用，不为每次写入创建 savepoint。让错误传播到事务外以触发完整回滚，不要在事务内捕获错误后继续提交。多个独立调用需要共同回滚时使用显式事务。
6. 做输入与能力校验，再在真实目标数据库执行测试；validateMutation 不能提前保证目标存在、唯一冲突或 through 新关系必填值。

## 必须核对的护栏

- 不假定存在 id，不按名称推断字段类型、主键或自增。关系键必须显式配置，不回退到 id、主键或 unique；关联条件与目标记录的唯一选择器是不同概念。

- 参数用 filter/values/select/sort；root upsert 用 filter/create/update。
- findOne 是取第一条；updateOne/deleteOne 需要恰好命中一条；upsertOne 需要唯一等值条件。
- 全表 updateMany/deleteMany 只能在任务明确允许时使用 all:true，不能为了修复报错自动扩大条件范围。
- createMany/updateMany 不支持嵌套关系写入；createOne 的关系仅允许 create/connect。
- disconnect 不删目标；delete 会删目标。关系 target update/delete 必须留在当前父记录作用域内。
- through 的逻辑关系键、主键、版本不可由 payload 覆盖；省略 payload 不代表清空它。
- 游标必须包含完整排序轴；前后页结果都按原排序返回。关系记录分页可能读取多于返回数量的子记录。
- 不把数字字符串盲目转为 Number；不把动态泛型 fallback 当成真实字段承诺。
- PostgreSQL Streaming 缺失依赖、JSON 方言边界、MySQL 布尔过滤已知回归必须显式处理，不能声称全数据库能力一致。
- 不生成 findUnique/findFirst/connectOrCreate/countDistinct/distinctOn、原生数组字段或未公开的 relations 根参数。

## 完成条件

- 示例和实现的 imports、方法、选项、返回值通过当前包公开类型检查。
- 查询覆盖命中、空结果、字段裁剪、关系为空；分页覆盖相同排序值、唯一 tie-breaker、边界页和反向页。
- 单条写入覆盖零条/多条命中、版本冲突；嵌套写入覆盖错误归属、缺失目标和完整回滚。
- 聚合覆盖空集合、NULL、数值精度与分支隔离；through 覆盖新建、保留、部分更新和必填值。
- 在声明支持的数据库上执行相关测试；缺失依赖或方言失败单独报告，不以 SQLite 通过替代跨数据库验证。
- 按受影响范围执行 lint、typecheck、test、build；只改文档时检查链接、摘要、格式和示例类型，不修改运行时代码来迎合文档。

更多通用要求见[实现护栏](./guardrails.md)和[验证指南](./verification.md)。
