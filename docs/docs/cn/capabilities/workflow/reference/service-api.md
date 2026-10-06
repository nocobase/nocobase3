---
title: '触发工作流'
description: '从业务代码或定时任务触发工作流，使用 eventKey 去重，处理触发结果。'
keywords: 'NocoBase,Service API,trigger,eventKey,定时任务,Instruction'
---

# 触发工作流

编写工作流不会让它自动响应任何业务事件。工作流有三种触发方式：

| 方式         | 适用场景                                       | 由谁发起                           |
| ------------ | ---------------------------------------------- | ---------------------------------- |
| 业务代码触发 | 业务操作成功后启动处理，例如库存变更、报价提交 | 应用代码调用 Workflow Service      |
| 定时触发     | 按固定时间执行，例如每日报表、夜间检查         | 定时任务的内置 `workflow` 执行目标 |
| 手动运行     | 验证新版本、管理员发起的一次性处理             | 业务管理员在管理界面操作           |

手动运行见[手动运行工作流](../management/manual-runs.md)。本页介绍前两种。需要扩展节点能力时，参见[自定义节点](./custom-instructions.md)。

## 从业务代码触发

业务操作成功后，由拥有该事件的代码完成输入构造和调用。交给 Agent 实现的步骤和验收要求见[开发流程](../development/process.md#业务事件触发)。

### 获取工作流服务

从工作流插件的服务端入口导入 token，再通过应用容器解析：

```ts
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';

const workflow = app.container.resolve(workflowServiceToken);
```

这个公开 Service 只提供 `trigger()` 和 `registerInstruction()`。管理界面的查询、启停和手动运行走认证的管理 API，不属于这个 Service。不要从插件内部路径导入，也不要创建同名 token。

### 触发工作流

```ts
const receipt = await workflow.trigger(
  'quotation-routing',
  { quotationId: quotation.id, amountCents: quotation.amountCents },
  { eventKey: `quotation-submitted:${quotation.id}:${quotation.revision}` },
);
```

- 第一个参数是工作流的目录名，不是管理界面上的标题，也不是数据库中的版本 ID；
- 输入必须符合工作流声明的输入 Schema，序列化后不超过 65,536 字节；
- 认证、授权和业务校验由调用方负责。插件刻意不提供任何人都能调用的通用 HTTP 触发接口。

### 处理触发结果

```ts
if (receipt.status === 'skipped') {
  // receipt.reason 为 'not-found'（没有当前定义）或 'disabled'（已停用）
  return;
}
// accepted：事件已被接受，receipt.runId 指向新建或已有的运行
```

- `accepted`：事件已被接受，`runId` 指向新建或已有的运行。重复 eventKey 会返回已有运行，不会重新执行它，也不代表业务成功，最终状态以运行记录为准；
- `skipped`：没有创建运行，也就没有可以查询的运行记录。应根据 `reason` 修正部署或按业务约定处理。

即使工作流存在且已启用，输入无效、输入过大或嵌套调用超限时仍会抛出错误。

### 使用 eventKey 避免重复运行

eventKey 表示一次业务事件的身份，在应用内全局去重，不仅限于某个工作流。建议包含业务事件类型或工作流标识，避免不同业务误用同一个 key：

- 同一事件因网络或队列重试再次触发时，使用同一个 key，只会产生一次运行；
- 真正的新事件使用新 key，例如新的库存变更版本、新一版报价；
- 省略时运行时会生成随机 key，调用方就无法表达“这是同一次事件的重试”。

不要用每次调用都会变化的时间戳作为同一业务事件的 key。

eventKey 只能回答“这是不是同一次流程调用”，不能回答“这个副作用是不是已经完成”。管理员创建新运行或应用执行恢复操作时，业务动作可能再次执行，所以创建记录、发起支付或发送通知时，仍要使用业务唯一键、数据库唯一约束或外部系统的幂等键。

相同 eventKey 对应的运行即使已经失败，也不会因再次触发而重跑。当前公开 Service 不提供失败运行的重放接口。需要恢复时，先确认已经发生的副作用，再决定是否创建新运行或显式补偿；新运行使用新的调用身份，业务写入仍使用原业务唯一键保证幂等。

### 在哪里触发

- **领域 Service**：在领域写入成功后触发，用领域记录的稳定 ID 构造输入和 eventKey。写入和触发需要更强的一致性时，按应用的事务与 outbox 设计处理；
- **受保护的 HTTP Route**：Route 先完成认证、授权、参数校验和领域操作，再调用 Workflow Service；
- **后台任务**：同样使用稳定的事件身份并处理 `skipped`，不能因为调用方已经在队列中就省略业务幂等。

## 定时触发

需要按时间执行时，不必自己写定时逻辑。工作流插件为[定时任务](../../scheduler.md)注册了内置的 `workflow` 执行目标：定时任务负责“什么时候执行”，工作流负责“执行哪些步骤”，定时任务的配置中只需引用工作流目录名和输入。交给 Agent 配置的步骤和验收要求见[开发流程](../development/process.md#定时触发)。

每次定时执行会以该次调度作为事件身份，不会重复运行。工作流不存在、已停用或输入不符合要求时，定时任务的执行记录中会显示失败或跳过原因。

## 常见问题

### 为什么没有通用的公开 HTTP 触发接口

不同业务事件的认证、授权、输入构造和幂等规则都不同。应由拥有该事件的 Route、Service、Webhook 或任务负责这些边界，再调用内部 Service。

### 为什么相同 eventKey 没有创建第二次运行

这是事件去重的预期行为。如果它确实是一个新的业务事件，应使用能区分新事件的稳定身份，而不是随机生成一个值来绕过去重。

### Service API 能否用来启停或修改工作流

不能。公开 Service 只用于业务触发和注册节点。启停、参数、版本和手动运行由管理界面和认证的管理 API 负责。
