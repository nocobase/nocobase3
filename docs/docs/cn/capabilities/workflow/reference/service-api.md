---
title: '触发与扩展 API'
description: '从业务代码或定时任务触发工作流，使用 eventKey 去重，并注册自定义节点。'
keywords: 'NocoBase,Service API,trigger,eventKey,定时任务,Instruction'
---

# 触发与扩展 API

编写工作流不会让它自动响应任何业务事件。工作流有三种触发方式：

| 方式         | 适用场景                                       | 由谁发起                           |
| ------------ | ---------------------------------------------- | ---------------------------------- |
| 业务代码触发 | 业务操作成功后启动处理，例如库存变更、报价提交 | 应用代码调用 Workflow Service      |
| 定时触发     | 按固定时间执行，例如每日报表、夜间检查         | 定时任务的内置 `workflow` 执行目标 |
| 手动运行     | 验证新版本、管理员发起的一次性处理             | 业务管理员在管理界面操作           |

手动运行见[手动运行工作流](../management/manual-runs.md)。本页介绍前两种，以及如何注册自定义节点。

## 从业务代码触发

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
// accepted：运行已被接受，receipt.eventKey 是本次事件的身份
```

- `accepted`：运行已创建，在后台异步执行。它不代表业务成功，最终状态以运行记录为准；
- `skipped`：没有创建运行，也就没有可以查询的运行记录。应根据 `reason` 修正部署或按业务约定处理。

即使工作流存在且已启用，输入无效、输入过大或嵌套调用超限时仍会抛出错误。

### 使用 eventKey 避免重复运行

eventKey 表示一次业务事件的身份：

- 同一事件因网络或队列重试再次触发时，使用同一个 key，只会产生一次运行；
- 真正的新事件使用新 key，例如新的库存变更版本、新一版报价；
- 省略时运行时会生成随机 key，调用方就无法表达“这是同一次事件的重试”。

不要用每次调用都会变化的时间戳作为同一业务事件的 key。

eventKey 只能回答“这是不是同一次流程调用”，不能回答“这个副作用是不是已经完成”。Run 节点可能因恢复或人工操作再次执行，所以创建记录、发起支付或发送通知时，仍要使用业务唯一键、数据库唯一约束或外部系统的幂等键。

### 在哪里触发

- **领域 Service**：在领域写入成功后触发，用领域记录的稳定 ID 构造输入和 eventKey。写入和触发需要更强的一致性时，按应用的事务与 outbox 设计处理；
- **受保护的 HTTP Route**：Route 先完成认证、授权、参数校验和领域操作，再调用 Workflow Service；
- **后台任务**：同样使用稳定的事件身份并处理 `skipped`，不能因为调用方已经在队列中就省略业务幂等。

## 定时触发

需要按时间执行时，不必自己写定时逻辑。工作流插件为[定时任务](../../scheduler.md)注册了内置的 `workflow` 执行目标：定时任务负责“什么时候执行”，工作流负责“执行哪些步骤”，定时任务的配置中只需引用工作流目录名和输入。直接告诉 Agent，例如：

```text
请让<工作流的业务名称>每天 1 点（Asia/Shanghai）自动执行一次，使用定时任务的内置 workflow 执行目标，完成后告诉我如何在界面中确认执行记录。
```

每次定时执行会以该次调度作为事件身份，不会重复运行。工作流不存在、已停用或输入不符合要求时，定时任务的执行记录中会显示失败或跳过原因。

## 自定义节点

优先使用已安装的节点。应用自己的计算、增删改查、发送通知或调用外部接口，用 Run 加类型化 Service 即可，一次邮件调用本身不需要新的节点类型。只有下面两种情况才考虑自定义节点（Instruction）：

- 多个工作流需要同一种可复用操作，并且它有自己需要校验的配置和结果；
- 需要 Run 无法表达的流程控制语义。注意，持久等待、审批、循环和子流程需要专门的生命周期支持，仅实现一个同步完成的节点并不能提供这些能力。

一个自定义节点由三部分组成，Agent 会按 Skill 中的完整示例实现，你只需确认这三部分都已到位：

1. **服务端 Instruction 类**：继承 `@nocobase/app-plugin-workflow/server` 导出的 `WorkflowInstruction`，提供唯一的 `type`、`branches`（顺序节点为 `null`）、同步的 `validateConfig()` 和异步的 `run()`；
2. **定义端工厂函数**：用 `@nocobase/app-plugin-workflow/dsl` 导出的 `createNode()` 包装一个工厂，让 `workflow.ts` 可以像内置节点一样通过 `addNode()` 添加它，同时不会在定义中加载服务端代码；
3. **注册**：在应用 Provider 的 `boot()` 中调用 `workflow.registerInstruction(CustomInstruction)`。重复的 type 会被拒绝。

```ts
// server/providers/workflow-instructions.ts
export default class WorkflowInstructionsProvider extends ServiceProvider<Application> {
  readonly name: string = 'workflow-instructions';

  async boot(): Promise<void> {
    const { LabelInstruction } =
      await import('../workflow-instructions/label.js');
    this.app.container
      .resolve(workflowServiceToken)
      .registerInstruction(LabelInstruction);
  }
}
```

只在运行时注册还不够：源码检查和 Artifact 构建也必须使用同一组节点类型。默认的 `pnpm nocobase workflow check` 只认识 Run、Condition 和 Terminate，它拒绝一个自定义节点并不说明该节点无效；使用自定义节点的工作流需要通过 `@nocobase/app-plugin-workflow/build` 的 `checkWorkflowPackage()` 和 `buildApplicationWorkflows()`，传入包含内置节点和所有扩展节点的同一组合同。开发环境（`pnpm dev`）按运行时实际注册的节点校验，不需要额外配置。

完整的可运行示例（节点类、工厂、Provider、检查与构建脚本）在工作流 Skill 的 `references/custom-instructions.md` 中。

## 常见问题

### 为什么没有通用的公开 HTTP 触发接口

不同业务事件的认证、授权、输入构造和幂等规则都不同。应由拥有该事件的 Route、Service、Webhook 或任务负责这些边界，再调用内部 Service。

### 为什么相同 eventKey 没有创建第二次运行

这是事件去重的预期行为。如果它确实是一个新的业务事件，应使用能区分新事件的稳定身份，而不是随机生成一个值来绕过去重。

### Service API 能否用来启停或修改工作流

不能。公开 Service 只用于业务触发和注册节点。启停、参数、版本和手动运行由管理界面和认证的管理 API 负责。
