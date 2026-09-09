---
title: 'Workflow Service API'
description: '从应用业务代码触发工作流，并为工作流注册扩展节点能力。'
keywords: 'NocoBase,Workflow Service API,trigger,eventKey'
---

# Workflow Service API

应用业务代码通过公开的 Workflow Service 触发流程。管理界面的查询、启停和手动运行走认证管理 API，不属于这个面向业务模块的 Service 合同。

## 获取工作流服务

从工作流插件的服务端入口导入原始 token，再通过应用容器解析：

```ts
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';

if (!app.container.has(workflowServiceToken)) {
  throw new Error('Workflow service is not configured.');
}

const workflow = app.container.resolve(workflowServiceToken);
```

公开合同只提供 `trigger()` 和 `registerInstruction()`。不要从插件内部路径导入管理 Repository，也不要创建同名 token。

## 从业务代码触发工作流

```ts
const receipt = await workflow.trigger(
  'quotation-decision',
  {
    quotationId: quotation.id,
    amount: quotation.amount,
  },
  {
    eventKey: `quotation-submitted:${quotation.id}:${quotation.revision}`,
  },
);
```

第一个参数是工作流源码目录名。编写新接入时，应枚举配置的工作流 source root，并根据 `workflow.ts` 的标题和说明选择流程；最终以目录名调用。不要根据管理界面标题或数据库 definition id 猜测。

输入必须是 JSON 对象并符合所选工作流的 `inputSchema`，序列化后不能超过 65,536 字节。调用来源负责自己的认证、授权和业务校验。

## 处理触发结果

```ts
if (receipt.status === 'skipped') {
  if (receipt.reason === 'disabled') {
    // 按业务约定记录或返回“流程已停用”。
  }
  return receipt;
}

const { eventKey } = receipt;
// accepted 只表示运行已被接受并获得事件身份；执行仍在后台继续。
```

可能的结果：

- `accepted`：已接受，返回 eventKey；
- `skipped: not-found`：没有当前定义；
- `skipped: disabled`：当前定义已停用。

即使流程存在并启用，输入无效、输入过大、父运行不存在或嵌套超限仍可能抛出精确错误。`accepted` 不是业务成功，最终状态需要从运行记录读取。

## 使用 eventKey 避免重复运行

eventKey 表示一次业务事件的身份：

- 同一事件因网络或队列重试再次调用时，复用同一个 key；
- 真正的新事件使用新 key；
- 省略时运行时会生成随机 key，但调用方将无法稳定表达重试身份。

例如同一版报价可以使用 `quotation-submitted:<id>:<revision>`。不要使用每次调用都变化的时间戳表示同一个业务事件。

## 工作流去重与业务幂等

eventKey 防止同一事件产生重复流程，但 Run 节点可能因恢复或人工操作再次执行。创建补货记录、发起支付或发送通知仍要使用业务唯一键、数据库唯一约束或外部系统幂等键。

这两层解决不同问题：

```text
eventKey：这是不是同一次流程调用？
业务幂等：这个具体副作用是不是已经完成？
```

## 注册自定义 Instruction

服务端插件可以注册一个公开的 Instruction class：

```ts
const workflow = app.container.resolve(workflowServiceToken);
workflow.registerInstruction(CustomInstruction);
```

重复 type 会被拒绝。运行时注册并不足够：应用的源码检查和 Artifact 构建也必须使用同一个合同，否则定义可能在一个阶段通过、另一个阶段失败。

优先让应用 Agent 使用 Workflow Skill 检查是否已有插件提供所需能力。只有可复用的流程控制语义才适合成为 Instruction；普通业务动作继续使用 Run + Service。

## 接入示例

### 从领域 Service 触发

在领域写入成功后触发，使用领域记录的稳定 ID 构造输入和 eventKey。若写入与触发需要更强的一致性，应按应用的事务与 outbox 设计处理，不要假设一次函数调用天然原子。

### 从受保护的 HTTP Route 触发

Route 先完成认证、授权、参数校验和领域操作，再调用内部 Workflow Service。插件刻意不提供任意用户都能调用的通用 trigger HTTP 端点。

### 从后台任务触发

后台任务可以调用同一个 Service，但仍需使用稳定事件身份，并处理 `skipped`。不要因为调用方已经在队列中，就省略业务幂等设计。

## 常见问题

### 为什么没有通用的公开 HTTP 触发接口

不同业务事件有不同认证、授权、输入构造和幂等规则。拥有该事件的 Route、Service、Webhook 或任务应负责边界，再调用内部 Service。

### accepted 是否表示工作流已经成功

不是。它只确认调用被接受并返回 eventKey，工作流随后异步执行。

### skipped 后是否需要轮询运行记录

不需要。`skipped` 不包含 eventKey，也不会为这次调用创建可轮询运行。应根据 `not-found` 或 `disabled` 修正部署或业务处理。

### 为什么相同 eventKey 没有创建第二次运行

这是事件去重的预期行为。若它确实是一个新的业务事件，应使用能够区分新事件的稳定身份，而不是随意生成随机值绕过去重。

### Service API 是否用于启停和修改工作流

不是。公开 Service 面向业务触发和扩展注册。启停、参数、版本和手动运行由认证管理 API 与管理界面负责。
