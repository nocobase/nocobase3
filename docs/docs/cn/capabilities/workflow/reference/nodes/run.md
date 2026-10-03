---
title: 'Run 节点'
description: '使用 Run 节点执行类型化业务动作，并向后续节点提供结果。'
keywords: 'NocoBase,工作流,Run 节点,业务服务'
---

# Run 节点

Run 节点执行随工作流包发布的服务端处理函数，适合计算、数据读写或调用应用 Service。它负责完成一个业务动作，不能决定流程分支，也不能暂停后恢复。

## 定义 Run 节点

```ts
import type { run as calculateRisk } from './server/calculate-risk';

createRunInstruction({
  key: 'calculateRisk',
  title: '计算风险',
  description: '根据报价金额和客户等级计算风险分，供后续判断使用。',
}).run(defineHandler<typeof calculateRisk>('./server/calculate-risk'));
```

模块路径必须以 `./` 开头、相对于工作流包、不带扩展名，并且是静态字符串。节点不声明参数映射，也不声明结果 Schema。

## 编写处理函数

```ts
// server/calculate-risk.ts
import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import type { FlowContext } from '../workflow';

export async function run(
  { input }: FlowContext,
  options: WorkflowRunOptions,
): Promise<{ score: number }> {
  options.signal.throwIfAborted();
  const score = input.amountCents / 1000;
  options.logger.info('Quotation risk calculated', {
    quotationId: input.quotationId,
  });
  return { score };
}
```

处理函数必须命名导出为 `run`：

- 第一个参数是共享上下文 `{ input, parameters, nodeResults }`，类型来自 `workflow.ts` 中的 `FlowContext`，见[处理函数与共享上下文](../dsl.md#处理函数与共享上下文)；
- 第二个参数提供 `services`（只读的应用 Service 解析器）、`signal`（取消信号）和 `logger`（已绑定当前运行的日志器）；
- 返回值就是节点结果，后续节点通过 `nodeResults.<节点 key>` 读取，类型由返回类型推导。

## 调用应用 Service

从 Service 所属的包导入它公开的 token，再用 `options.services.resolve(token)` 获取实例。不要创建同名 token，也不要绕过只读解析器修改应用容器。

具体的 token 和方法取决于目标应用，Agent 必须先检查真实的 Service 合同。数据写入、事务和外部协议由 Service 负责，处理函数只负责读取上下文并调用它。

## 返回节点结果

可以返回 `null`、布尔值、有限数字、字符串、数组或普通 JSON 对象，`undefined` 会存为 `null`。不能返回 BigInt、非有限数字、函数、Symbol、Date、Map、循环对象或 ORM 模型实例，需要先转换为普通 JSON 数据。

返回 `{ status: 'failed' }` 只是普通数据，不会让节点失败。需要表示执行错误时抛出异常；可预期的业务结论也可以作为数据返回，再由 Condition 判断。

## 日志和取消

用 `options.logger` 记录必要的定位信息，不要记录密码、令牌或完整的敏感数据。在开始时和耗时步骤之间调用 `signal.throwIfAborted()`，并把 signal 传给支持取消的 I/O。

取消无法撤销已经提交的数据库事务、已发送的消息或已发出的外部请求。

## 设计幂等副作用

Run 节点可能因为恢复或人工操作再次执行。创建记录时使用稳定的业务 ID、唯一约束或幂等 Service；调用外部系统时使用它的幂等键。eventKey 只保证同一事件不产生第二次运行，不能替代节点内部的业务幂等，见[使用 eventKey 避免重复运行](../service-api.md#使用-eventkey-避免重复运行)。

## 常见问题

### 为什么运行时找不到模块或 run 导出

确认模块路径以 `./` 开头、不带扩展名，文件被应用服务端构建输出到相同的相对位置，并且命名导出了 `run`。

### 为什么处理函数应显式声明返回类型

处理函数引用 `FlowContext`，而 `FlowContext` 又从各节点的返回类型推导。显式声明返回类型可以打断这个推导循环。
