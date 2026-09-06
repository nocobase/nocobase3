---
title: Repository Streaming
description: 使用 AsyncIterable 流式读取 Repository 根记录，并正确处理背压、提前取消和数据库连接释放。
---

# Repository Streaming

> 文档状态：本页保留设计与实现演进记录，不作为当前用法契约。Repository 已提供[正式使用文档](../../repository/overview.md)和 [API 参考](../../reference/repository-api.md)；本页中的候选项及旧限制需以正式文档、公开类型和实际测试核对。

> **状态：V1 已实现。**

```ts
for await (const order of orders.stream({
  filter: { status: 'paid' },
  sort: (sort) => sort.field('id').asc(),
  select: (select) => select.fields('id', 'orderNo', 'amount'),
})) {
  await exportOrder(order);
}
```

`stream()` 返回 `AsyncIterable`，由消费者的读取速度自然提供背压。提前 `break`、抛错或调用
iterator `return()` 时，Repository 会销毁底层数据库 stream 并释放资源。

## V1 规则

- 支持根级 `filter`、标量 `select`、`sort`、`cursor`、`distinct` 和 `limit`。
- Select Builder 的直接标量字段继续推导每条记录的 TypeScript 类型。
- 不支持 relation include；需要关系数据时使用普通 `findMany()` 或分批读取根记录后显式查询。
- 不支持 `offset`，避免大结果流在数据库端扫描并丢弃大量记录；继续翻页使用 cursor。
- 不提供 aggregate/groupBy 流、自动恢复或自动重试。流中断后是否从最后 cursor 继续由调用方决定。
- 调用方应在有限时间内消费或取消流，不要跨长时间业务等待持有数据库连接。
