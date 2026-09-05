---
title: Repository Streaming：逐条消费根记录
description: 通过 Repository stream 返回的 AsyncIterable 消费根记录，了解过滤排序、前向游标、提前退出和资源释放，以及 PostgreSQL 驱动依赖和当前使用限制。
---

# stream：逐条消费根记录

需要逐条消费较大结果集、不想先拿到完整数组时使用 stream。返回 AsyncIterable，不是 Promise<Record[]>；底层缓冲和读取批次由驱动管理，不代表数据库每次只取一行。

## 参数与返回

可选 filter、select、sort、distinct、cursor、direction、limit、context；方向只支持 forward。返回 AsyncIterable，无结果时迭代零次，不返回 records 包装。

## 使用前检查

- 本页是 API 用法，不代表所有方言已开箱验证。
- PostgreSQL 的 Knex stream 需要额外的 `pg-query-stream`；当前 db 包未声明该依赖，未配置时调用会报缺少依赖。已有 `pg` 不足以支持 Streaming。
- 本地 SQLite 和 MySQL 流式路径已有测试；Oracle/SQL Server 不应据接口存在推断已经过同等验证。
- 在目标应用中确认驱动依赖可由 Knex 解析，并验证完整读取、提前退出、连接释放之后，再用于生产任务。

## 逐条读取

模型和 db 前提见[概览](../overview.md)。

```ts
for await (const project of db.repository('projects').stream({
  filter: { status: 'active' },
  select: (select) => select.fields('id', 'name'),
  sort: (sort) => sort.field('id').asc(),
  limit: 1000,
})) {
  console.log(project.id, project.name);
}
```

可以使用根级 filter（包括关系条件）、标量 select、sort、limit、前向 cursor、distinct 和 context。限制同相应查询主题；distinct 仍可能要求数据库排序或临时存储，并非流式接口就没有数据库侧成本。

## 提前退出与事务

```ts
let consumed = 0;
for await (const project of db.repository('projects').stream({
  sort: (sort) => sort.field('id').asc(),
  select: (select) => select.fields('id'),
})) {
  console.log(project.id);
  if (++consumed === 10) break;
}
```

完成、break 或消费端抛错时，迭代器 finally 会销毁底层流。优先使用 for-await，不要取得迭代器后将其遗弃；手动迭代时要结束迭代器。

事务内必须创建并消费完流后再退出事务回调。不要将尚未消费的流返回到已关闭的事务外。消费期间会占用连接；避免在同一单连接事务中一边读取活动流、一边提交其他查询，否则可能受驱动限制或发生等待。需要读后批量写时优先使用明确的分页工作流。

## 不支持的选项

| 需求                                     | 当前处理                                                |
| ---------------------------------------- | ------------------------------------------------------- |
| 关系 include，包括关系 aggregate/combine | `INVALID_STREAM`，改用 findMany                         |
| `direction: 'backward'`                  | `INVALID_STREAM`，改用缓冲结果的 findMany               |
| offset                                   | 不在公开 StreamOptions 中，不要依赖额外属性的运行时行为 |
| 自定义 stream 批次、自动断点保存         | 未提供专用选项，由应用实现流程                          |

stream 不自动给出下一页 cursor，不保证并发写入下固定快照。断点续读使用已明确排序字段的[前向 cursor](../pagination.md)，并由应用保存进度。

## 验证清单

在实际方言和依赖配置上验证：空结果、正常完成、消费端异常、提前 break 后其他查询仍可执行、事务内消费，以及长任务的连接池占用。测试失败不能改为 `findMany()` 再 yield 来声称完成真正流式读取。

继续阅读：[查询](../methods/find-many.md)、[分页](../pagination.md)、[事务](../transactions.md)。

## 验证依据

行为覆盖见 [stream.test.ts](../../../../tests/integration/repository/methods/stream.test.ts)；公开签名见 [API 参考](../../reference/repository-api.md)。
