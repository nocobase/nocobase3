---
title: '扩展服务端 AI 服务'
description: '在 NocoBase Server 中解析 AgentServiceFactory，创建会话，并通过 AI 员工或固定 Agent 执行任务。'
keywords: 'AgentServiceFactory,AIConversationsManager,AgentService,createAIEmployee,createAgent'
---

# 扩展服务端 AI 服务

普通页面应优先使用 `client/extensions/nocobase-ai` 中的组件和现有 `/api/ai` Transport。工作流适配器、定时任务、应用 Service 或受保护的服务端 Route 需要直接运行 Agent 时，才使用服务端 Factory。

`AgentService` 是应用 Server 内部 API，不是浏览器 API。调用方必须自己确定可信 actor、业务授权、取消和重试策略，不能把 Factory 直接暴露给未经校验的请求参数。

## 公开入口

从插件 Server barrel 只导入公开 Token 和会话管理器：

```ts
import {
  agentServiceFactoryToken,
  aiConversationsManagerToken,
} from '@nocobase/app-plugin-ai-employee/server';

const conversations = container.resolve(aiConversationsManagerToken);
const factory = container.resolve(agentServiceFactoryToken);
```

不要从 `server/agent/*` deep import `AgentServiceFactory`、`AgentContextProvider`、`ConversationProvider` 或持久化实现。当前公开扩展面是 Container 中的 Factory Token；这些内部 Contract 用来解释架构，不代表应用可以从 Server barrel 直接导入。

## 调用一个 AI 员工

为需要保留历史的服务端任务，先创建会话，再把 `sessionId` 交给 `createAIEmployee()`：

```ts
const conversation = await conversations.create({
  userId: actor.id,
  aiEmployee: { username: 'customer-success' },
  title: 'Customer follow-up',
  from: 'main-agent',
});

const agent = await factory.createAIEmployee({
  username: 'customer-success',
  sessionId: conversation.sessionId,
  actor: {
    id: actor.id,
    roles: actor.roles,
    isRoot: actor.isRoot,
  },
  from: 'main-agent',
});

try {
  const result = await agent.invoke({
    userMessages: [
      {
        role: 'user',
        content: 'Review the customer context and propose the next action.',
      },
    ],
  });
  // Consume the structured Agent result here.
} finally {
  agent.abort('request finished');
}
```

`username` 必须是已经注册的员工。`sessionId` 是字符串，连接会话、消息、Tool 状态、分支和 Checkpoint；不要把它转换成 JavaScript `number`，也不要在不同用户之间复用。

`actor` 决定这个调用以谁的身份读取业务资源。省略时 Factory 会创建 Root actor，因此应用代码不应依赖默认值处理来自用户的请求。

## 创建固定 Agent

不需要员工角色、知识库和用户上下文，只需要一个固定模型、Prompt、Skill 和 Tool 集合时，可以使用 `createAgent()`：

```ts
const conversation = await conversations.create({
  userId: actor.id,
  title: 'Nightly service summary',
  scope: 'jobs/nightly-summary',
});

const agent = await factory.createAgent({
  sessionId: conversation.sessionId,
  username: 'nightly-summary',
  model: { llmService: 'gpt', model: 'gpt-5.6' },
  systemPrompt: 'Summarize only the records supplied by approved Tools.',
  skills: ['service-summary'],
  tools: ['list-service-metrics'],
});

const result = await agent.invoke({
  userMessages: [{ role: 'user', content: 'Prepare the nightly summary.' }],
});
```

`createAgent()` 不查找 Employee，也不接收 actor。它会解析模型、已注册 Tool 和 Skill 绑定的 Tool，并默认使用数据库会话持久化。它适合系统拥有的后台任务；需要按用户身份执行 Tool 时，使用 `createAIEmployee()` 或在调用前建立应用自己的受控授权边界。

## 流式执行和取消

`stream()` 返回异步迭代器。把请求取消信号传给 Agent，并在连接关闭时调用 `abort()`：

```ts
try {
  for await (const event of agent.stream({
    userMessages: [{ role: 'user', content: 'Generate a service summary.' }],
    signal: request.signal,
  })) {
    await output.write(event);
  }
} finally {
  agent.abort('stream closed');
}
```

HTTP Route 不应直接把内部事件对象原样暴露给客户端。普通聊天已经由插件的 SSE Adapter 处理缓存、恢复和协议转换；自定义 Route 需要定义自己的稳定响应 Contract。

## Agent 的内部边界

Factory 创建的 `AgentService` 组合四个职责：

| Contract                 | 职责                                                      |
| ------------------------ | --------------------------------------------------------- |
| Agent Context Provider   | 解析当前会话、模型、系统 Prompt 和本次可发现 Tool         |
| Conversation Provider    | 编排消息、Tool 决策、线程和流式缓存                       |
| Conversation Persistence | 保存会话、普通消息、Tool 消息和 Usage Event               |
| Agent Service            | 构建标准中间件顺序，并提供 invoke、stream、resume 和 fork |

标准调用不要替换这些边界。特别是中间件排序由 `AgentService` 拥有，应用不能通过传入任意 middleware 改写安全和持久化顺序。

## 自定义持久化

`createAgent()` 内部支持自定义 `ConversationPersistence`，但该 Contract 当前没有从插件 Server barrel 导出。没有稳定公开扩展包时，不要通过 deep import 实现自定义存储。

需要新增正式持久化后端时，应先把 Contract 作为公开 API 提升，并保持以下不变量：

- assistant 消息和 Usage Event 在同一事务边界写入
- Usage 写入失败时回滚对应消息
- Tool 调用状态和消息顺序保持不变
- Snowflake 和 Message ID 始终保持字符串精度
- 重试、恢复、分支和 Checkpoint 语义保持一致

## 生命周期和错误处理

在 ServiceProvider 的 `boot()` 或业务方法中通过 Container 解析 Factory，不要在模块顶层缓存跨应用实例的对象。长时间任务要响应应用 Shutdown，停止输入、取消活动执行，再释放调用方自己拥有的资源。

模型、员工、Tool 或 Skill 不存在时让调用明确失败，不要静默切换另一模型或新建一套 `AIManager`。带写入副作用的任务在重试前先检查会话和 Tool 状态，避免网络断开造成重复执行。

## 相关链接

- [定义自己的 AI 员工](./development/index.md) — 注册 Factory 可以使用的 Employee、Skill 和 Tool
- [注册 Tool](./development/tool.md) — 实现 actor 和权限边界
- [LLM 服务配置](./configuration/llm.md) — 准备 `ModelRef` 引用的服务
- [聊天框](./components/chat.md) — 普通页面的首选接入方式
