---
title: '扩展 AgentService'
description: '在服务端使用 AIConversationsManager 和 AgentServiceFactory 创建会话、调用 AI 员工并扩展持久化。'
keywords: 'AIConversationsManager,AgentServiceFactory,AgentContextProvider,ConversationPersistence'
---

# 扩展 `AgentService`

普通页面优先使用 `nocobase-ai` Registry 和 `/api/ai`。只有工作流适配器、服务端 Service、定时任务或应用自有 API 需要在服务端直接调用 Agent 时，才使用 `AIConversationsManager` 和 `AgentServiceFactory`。

这些 API 不是浏览器 API。Agent 应该在应用服务端代码中调用，并明确当前 actor、权限和生命周期。

## 创建带 AI 员工的会话

先创建会话，再把返回的 `sessionId` 传给 `createAIEmployee`：

```ts
import {
  aiConversationsManagerToken,
  agentServiceFactoryToken,
} from '@nocobase/app-plugin-ai-employee/server';

const conversations = container.resolve(aiConversationsManagerToken);
const factory = container.resolve(agentServiceFactoryToken);

const conversation = await conversations.create({
  userId: actor.id,
  aiEmployee: { username: 'customer-support' },
  title: '客户支持请求',
});

const agent = await factory.createAIEmployee({
  username: 'customer-support',
  sessionId: conversation.sessionId,
  actor,
});

const result = await agent.invoke({
  userMessages: [{ role: 'user', content: '请总结这个订单的售后问题。' }],
});
```

`sessionId` 连接会话、消息、工具状态、流式缓存和恢复流程。不要把它转换成数字，也不要跨用户复用。

## 直接调用模型

如果不需要预先创建或选择 AI 员工，可以用 `createAgent` 创建固定上下文的 Agent：

```ts
const conversation = await conversations.create({
  userId: actor.id,
  title: '临时分析',
});

const agent = await factory.createAgent({
  sessionId: conversation.sessionId,
  model: { llmService: 'openai', model: 'gpt-4.1' },
  systemPrompt: '只根据传入的业务数据回答。',
});

const result = await agent.invoke({
  userMessages: [{ role: 'user', content: '分析本月的销售趋势。' }],
});
```

`createAgent` 不会查找一个预先创建的员工。它适合一次性的固定角色、后台任务或应用自有服务。

## 实时流式响应

需要实时输出时使用 `stream()`，并把取消信号传给 Agent：

```ts
for await (const event of agent.stream({
  userMessages: [{ role: 'user', content: '生成一份摘要。' }],
  signal: request.signal,
})) {
  writer.write(event);
}
```

不要在断线后盲目重新创建会话并重复执行写操作。先读取会话状态，再决定是否恢复。

## 实现 `AgentContextProvider`

如果应用需要扩展 Agent 的模型、提示词或工具发现，可以实现 `AgentContextProvider`。它只提供四类结果：

```ts
interface AgentContextProvider {
  currentConversation(): CurrentConversation;
  resolveLLM(request: AgentRequest): Promise<ResolvedAgentLLM>;
  getSystemPrompt(
    messages: readonly AIMessageInput[],
  ): Promise<string | undefined>;
  discoveredTools(): Promise<DiscoveredTools>;
}
```

实现时注意：

- `currentConversation()` 的 `sessionId` 在 Agent 生命周期内保持稳定
- 模型解析失败时抛出清晰错误，不要静默创建另一个 AI Manager
- 只返回已注册、可序列化的工具
- 不要在 Context Provider 中读取或保存消息
- 授权放在工具代码和服务策略中，不要只写进 prompt

通常来说，应用只在拥有自己的 Agent 组装边界时才实现这个扩展点。不要为了覆盖一个方法而导入插件私有源码。

## 使用 `ConversationPersistence` 扩展持久化

如果应用需要把会话保存到其他存储，可以实现 `ConversationPersistence`：

```ts
interface ConversationPersistence {
  readonly conversations: AIConversationRepository;
  readonly messages: AIMessageRepository;
  readonly toolMessages: AIToolMessageRepository;
  readonly usageEvents: AIUsageEventRepository;
  createChatConversation(options: { sessionId: string }): AIChatConversation;
}
```

四类 repository 分别负责会话、普通消息、工具消息和 usage 事件。实现必须保持：

- assistant 消息和 usage 事件使用同一个事务边界
- usage 写入失败时回滚对应消息
- 工具状态和调用顺序不变
- message ID 保持字符串语义，不转换成 JavaScript `number`
- 重试、恢复、分支和 checkpoint 仍然可用

`ConversationPersistence` 只替换存储方式，不要重新实现另一套会话状态机。

:::warning 安全边界

只从 `@nocobase/app-plugin-ai-employee/server` 导入公开 token。不要从插件内部路径 deep-import，也不要把 `AgentService` 直接暴露给未经授权的请求参数。

:::

## 相关链接

- [在前端使用 AI 员工](./frontend.md) — 普通页面集成优先使用方式
- [声明 AI 员工并添加技能和工具](./resources.md) — 应用资源定义
- [管理 AI 员工](../management/index.md) — 会话使用前的模型和权限准备
