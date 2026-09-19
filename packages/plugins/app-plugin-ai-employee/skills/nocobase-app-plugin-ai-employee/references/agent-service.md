# AgentService Runtime Integration for NocoBase Apps

## Table of contents

- [When to use this API](#when-to-use-this-api)
- [Public container services](#public-container-services)
- [Required creation order](#required-creation-order)
- [`AIConversationsManager`](#aiconversationsmanager)
- [`createAIEmployee`](#agentservicefactorycreateaiemployee)
- [`createAgent`](#agentservicefactorycreateagent)
- [Executing `AgentService`](#executing-agentservice)
- [Implementing `AgentContextProvider`](#implementing-agentcontextprovider)
- [Extending persistence](#extending-persistence-with-conversationpersistence)
- [Security and lifecycle](#security-and-lifecycle-checklist)

Use this reference when an App plugin needs server-side agent execution rather than the normal `/api/ai` chat surface. Assume the consuming agent cannot inspect `@nocobase/app-plugin-ai-employee` source. The contracts below are the API boundary; do not infer additional fields from implementation details.

## When to use this API

Prefer the normal App path first:

```text
App ai/ resources + client/extensions/nocobase-ai
        ↓
@nocobase/app-plugin-ai-employee
        ↓
/api/ai and persisted conversations
```

Use `AgentServiceFactory` only for an App-owned server integration that must invoke an agent directly—for example a workflow adapter, an App server service, a scheduled job adapter, or an application-owned API route. The caller must already have a clear actor, authorization policy, and lifecycle for the work.

Do not create a second `AIManager` for normal App runtime work. Resolve the factory and conversation manager from the App service container so the integration uses the plugin's configured LLM services, repositories, skills, tools, and database.

## Public container services

The AI Employee plugin registers two App-container services:

```ts
import {
  aiConversationsManagerToken,
  agentServiceFactoryToken,
} from '@nocobase/app-plugin-ai-employee/server';

const conversations = container.resolve(aiConversationsManagerToken);
const factory = container.resolve(agentServiceFactoryToken);
```

The tokens are identity-sensitive. Always import the original token from the package export. Never call `createServiceToken()` again with the same string and never deep-import a plugin source file.

`AgentServiceFactory` is an App-level singleton. Every `createAIEmployee()` or `createAgent()` call creates a new session-scoped `AgentService` and its private context/conversation execution objects. Do not cache an `AgentService` globally or register one as another singleton.

## Required creation order

For a new persisted session, create the conversation first, then create the agent with the returned session id:

```ts
const conversation = await conversations.create({
  userId: actor.id,
  aiEmployee: { username: 'customer-support' },
  title: 'Support request',
});

const agent = await factory.createAIEmployee({
  username: 'customer-support',
  sessionId: conversation.sessionId,
  actor,
});

const result = await agent.invoke({
  userMessages: [{ role: 'user', content: 'Summarize the open issues.' }],
});
```

For a model-only session, `aiEmployee` can be omitted. The same session creation rule applies:

```ts
const conversation = await conversations.create({
  userId: actor.id,
  title: 'Ad hoc analysis',
});

const agent = await factory.createAgent({
  sessionId: conversation.sessionId,
  model: { llmService: 'openai', model: 'gpt-4.1' },
  systemPrompt: 'Answer using the supplied business data.',
});

const result = await agent.invoke({
  userMessages: [{ role: 'user', content: 'Analyze this request.' }],
});
```

`sessionId` is the identity shared by the conversation, message persistence, stream cache, tool state, abort handling, usage events, and checkpoints. If the caller intentionally needs an ephemeral/non-persisted execution, document that decision and understand that creating a conversation is still the normal integration path for the plugin-backed session lifecycle.

## `AIConversationsManager`

### Token and creation contract

```ts
export type CreateAIConversationParams = {
  userId?: string | number;
  aiEmployee?: { username: string };
  title?: string;
  options?: AIConversationsOptions;
  from?: 'main-agent' | 'sub-agent';
  scope?: string;
  transaction?: DatabaseConnection;
};

export type AIConversationsOptions = {
  systemMessage?: unknown;
  skillSettings?: unknown;
  conversationSettings?: unknown;
  modelSettings?: unknown;
  frontendTools?: FrontendToolManifest[];
  [key: string]: unknown;
};
```

`aiEmployee` is optional by design. Supply it when the conversation belongs to a named AI Employee. Omit it for an ad hoc `createAgent()` session that selects a model and context directly. `userId` is the owning application user; do not accept an arbitrary model-provided user id. `transaction` is only for a caller that already owns a database transaction and understands the plugin's transaction boundary.

The manager creates a chat conversation and returns an `AIConversationEntity`. Important fields include:

```ts
type AIConversationEntity = {
  id?: string | number | bigint;
  sessionId?: string;
  thread?: number;
  topicId?: string;
  from?: string;
  scope?: string;
  userId?: string | number | bigint;
  aiEmployeeUsername?: string;
  aiEmployee?: Partial<AIEmployeeEntity>;
  title?: string;
  options?: Record<string, unknown>;
  llmActiveState?: string;
  category?: string;
  read?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
```

Treat the returned `sessionId` as an opaque string. Do not convert it to a number, expose it without authorization, or reuse it for a different user.

### Conversation manager methods

The manager also provides the existing conversation operations:

```ts
create(options: CreateAIConversationParams): Promise<AIConversationEntity>;

update(options: {
  userId: string | number;
  sessionId: string;
  title?: string;
  options?: AIConversationsOptions;
}): Promise<AIConversationEntity | null>;

getConversation(options: {
  sessionId: string;
  userId?: string | number;
}): Promise<AIConversationEntity | null>;

getMessages(options: {
  userId: string | number;
  sessionId: string;
  cursor?: string;
  paginate?: boolean;
  updateRead?: boolean;
}): Promise<{
  rows: AIMessage[];
  hasMore?: boolean;
  cursor?: string | null;
}>;
```

Use `userId` when reading or mutating user-owned conversations. A missing or mismatched owner must not be treated as a successful lookup.

## `AgentServiceFactory.createAIEmployee()`

Use this entry point when the employee is a persisted or built-in AI Employee selected by stable `username`:

```ts
interface CreateAIEmployeeOptions {
  readonly username: string;
  readonly sessionId?: string;
  readonly systemPrompt?: string;
  readonly actor?: Actor;
  readonly frontendTools?: readonly unknown[];
  readonly from?: 'main-agent' | 'sub-agent';
  readonly translate?: Translate;
  readonly getHeader?: (name: string) => string | undefined;
  readonly skillSettings?: AIEmployeeSkillSettings;
  readonly webSearch?: boolean;
  readonly tools?: readonly { name: string }[];
}

createAIEmployee(options: CreateAIEmployeeOptions): Promise<AgentService>;
```

Parameter rules:

- `username` is required and must identify an accessible employee. Do not copy a built-in employee definition into the App.
- `sessionId` should normally be the value returned by `AIConversationsManager.create()`.
- `actor` is the authorization identity used by tools and employee access checks. Construct it from the authenticated request or trusted server job context, not from request JSON.
- `systemPrompt` is a request-level addition/override for this service instance; keep secrets and authorization rules out of model-controlled prompt text.
- `frontendTools` is a serializable manifest of currently available browser tools. It is not a place to send callbacks, DOM nodes, or executable functions.
- `from` identifies main-agent versus sub-agent execution and affects persistence/checkpoint behavior.
- `translate` and `getHeader` are optional App adapters for localization and trusted request headers.
- `skillSettings`, `webSearch`, and `tools` narrow or extend the employee's configured capabilities; they do not bypass permission checks.

The factory resolves the employee, model, tools, skills, knowledge-base behavior, conversation persistence, and default middleware. The caller should not instantiate those internal objects separately.

## `AgentServiceFactory.createAgent()`

Use this entry point when no AI Employee needs to be pre-created or selected. It creates a fixed-context AgentService that can call a configured LLM directly:

```ts
interface CreateAgentOptions {
  readonly sessionId?: string;
  readonly username?: string;
  readonly model?: ModelRef;
  readonly systemPrompt?: string;
  readonly tools?: readonly string[];
  readonly skills?: readonly string[];
  readonly persistence?: ConversationPersistence;
}

createAgent(options?: CreateAgentOptions): Promise<AgentService>;
```

Rules:

- `messages` is not a creation option. Supply the current turn's messages to `invoke()` or `stream()`.
- `model` is the default model for this service. A request-level `AgentRequest.model` can override it.
- `username` is optional metadata/context identity; it does not make this an AI Employee lookup.
- `systemPrompt` is the fixed context prompt.
- `tools` contains registered tool names to activate; `skills` contains registered skill names whose tools should be activated.
- `persistence` replaces the default database persistence. Use it only when the integration owns a compatible storage implementation; see the Persistence section below.
- If no model is supplied, the service must receive a usable model through the supported configuration path before execution.

## Executing `AgentService`

The service exposes the same execution object for multiple turns:

```ts
interface AgentRequest {
  model?: ModelRef;
  messageId?: string;
  userMessages?: AIMessageInput[];
  userDecisions?: {
    interruptId?: string;
    decisions: UserDecision[];
  };
  context?: Record<string, unknown>;
  writer?: (chunk: unknown) => void;
  signal?: AbortSignal;
}

interface AgentService {
  invoke(request?: AgentRequest): Promise<unknown>;
  stream(request?: AgentRequest): AsyncGenerator<AgentStreamEvent>;
  resumeInvoke(request: AgentRequest): Promise<unknown>;
  resumeStream(request: AgentRequest): AsyncGenerator<AgentStreamEvent>;
  forkInvoke(request: AgentRequest): Promise<unknown>;
  forkStream(request: AgentRequest): AsyncGenerator<AgentStreamEvent>;
  cancelToolCall(): Promise<AIMessageInput[] | undefined>;
  abort(reason?: unknown): void;
}
```

`AIMessageInput` is:

```ts
interface AIMessageInput {
  role: string;
  content: unknown;
  createdAt?: string | Date;
  toolCalls?: AIToolCall[];
  attachments?: unknown[];
  workContext?: WorkContext[];
  metadata?: Record<string, unknown>;
  // messageId and sessionId are server-assigned; omit them.
}
```

Use `userMessages` for the current user turn. Use `messageId` when the plugin must load a persisted history/thread. Use `userDecisions` only to resume an interrupt. Use `signal` for request cancellation and consume `stream()` with `for await`. Do not parse or persist stream events manually when the surrounding App service already owns that transport.

## Implementing `AgentContextProvider`

`AgentContextProvider` is the extension point for the context an `AgentService` consumes. It is not a database service and it must not expose repositories or the App container to the agent:

```ts
interface AgentContextProvider {
  currentConversation(): CurrentConversation;
  resolveLLM(request: AgentRequest): Promise<ResolvedAgentLLM>;
  getSystemPrompt(
    messages: readonly AIMessageInput[],
  ): Promise<string | undefined>;
  discoveredTools(): Promise<DiscoveredTools>;
}

interface CurrentConversation {
  sessionId: string;
  username?: string;
  from?: string;
  metadata?: Record<string, unknown>;
}

interface ResolvedAgentLLM {
  readonly providerName: string;
  readonly llmService?: string;
  readonly model: string;
  readonly provider: LLMProvider;
}

interface DiscoveredTools {
  readonly tools: ReadonlyMap<string, ToolsEntity>;
  activeTools(): Promise<ReadonlySet<string>>;
}
```

Implementations should follow these rules:

1. Keep `currentConversation()` stable for the lifetime of the service. Its `sessionId` must match the ConversationPersistence/session created for the agent.
2. Resolve the model from the request first, then from the provider's fixed/default context. Throw a clear error when no model can be resolved; do not silently create another AI manager.
3. Return a prompt string or `undefined`. Do not put authorization decisions solely in a prompt; enforce them in tool code and service policy.
4. Return only registered, serializable tool definitions. `activeTools()` controls which discovered tools are enabled for this execution.
5. Do not load or save messages in the context provider. Message history and tool state belong to the ConversationProvider.
6. Do not put `DatabaseManager`, repositories, `ServiceFactory`, `ConversationProvider`, or a mutable aggregate options object into the public context contract. Keep infrastructure dependencies private inside the App-owned adapter and expose only the four results above.
7. If context is request-sensitive, snapshot the trusted actor/request data when constructing the provider and never trust equivalent fields from model output.

A fixed context normally stores `sessionId`, optional `username`, optional `from`, a default `ModelRef`, a resolved `LLMProvider`, prompt text, a read-only tool map, and active tool names. An employee context additionally resolves the employee, model, configured skills/tools, knowledge-base prompt, frontend-tool manifest, and actor policy. These are implementation choices behind the contract, not extra fields for callers to pass to `AgentService`.

The factory's standard construction path owns the `AgentContextProvider` selection. An App should implement a custom provider only in an App-owned server integration that also owns a compatible AgentService assembly boundary; do not deep-import private plugin implementation classes merely to replace one method.

## Extending persistence with `ConversationPersistence`

`ConversationPersistence` is the narrow storage replacement contract:

```ts
interface ConversationPersistence {
  readonly conversations: AIConversationRepository;
  readonly messages: AIMessageRepository;
  readonly toolMessages: AIToolMessageRepository;
  readonly usageEvents: AIUsageEventRepository;
  createChatConversation(options: { sessionId: string }): AIChatConversation;
}
```

The four repositories have distinct responsibilities:

- `conversations`: chat conversation records, ownership, title, options, thread/category metadata, and conversation-level updates;
- `messages`: user, assistant, and other persisted messages;
- `toolMessages`: tool-call arguments/results and tool state transitions;
- `usageEvents`: assistant response usage records and idempotent usage updates.

`createChatConversation()` must return the conversation adapter used by the default ConversationProvider for the supplied session id. It must not create a different session id or silently switch users.

A database implementation normally stores these direct dependencies:

```ts
class DatabaseConversationPersistence implements ConversationPersistence {
  private readonly connection: DatabaseConnection;
  private readonly snowflake: IdGeneratorService;
  private readonly conversations: AIConversationRepository;
  private readonly messages: AIMessageRepository;
  private readonly toolMessages: AIToolMessageRepository;
  private readonly usageEvents: AIUsageEventRepository;

  constructor(
    connection: DatabaseConnection,
    snowflake: IdGeneratorService,
    conversations: AIConversationRepository,
    messages: AIMessageRepository,
    toolMessages: AIToolMessageRepository,
    usageEvents: AIUsageEventRepository,
  ) {
    this.connection = connection;
    this.snowflake = snowflake;
    this.conversations = conversations;
    this.messages = messages;
    this.toolMessages = toolMessages;
    this.usageEvents = usageEvents;
  }

  createChatConversation(options: { sessionId: string }): AIChatConversation {
    return new AIChatConversation(/* implementation-specific direct deps */);
  }
}
```

The constructor shape is illustrative: use the installed declaration for the concrete `AIChatConversation` constructor. The contract and invariants are mandatory.

A custom persistence implementation must preserve the default ConversationProvider behavior:

- assistant message and usage-event writes share one transaction connection;
- a failure writing a usage event rolls back the related message transaction;
- tool statuses and tool-call ordering remain intact;
- message ids retain string semantics and are never converted to JavaScript `number`;
- concurrent uniqueness/conflict handling stays in the repository implementation;
- stream-cache session isolation, abort handling, event handling, thread/fork/resume behavior, and checkpoint behavior are unchanged;
- persistence methods must be safe for repeated calls where the default flow is idempotent.

Do not replace persistence with fire-and-forget writes, an asynchronous post-commit usage job, a repository aggregate with hidden semantics, or a second ConversationProvider state machine. `ConversationPersistence` changes storage only; it does not change agent orchestration.

## Security and lifecycle checklist

- Resolve both tokens from the App container; do not construct competing managers.
- Authorize `userId`, employee username, session id, tool activation, and persisted conversation access.
- Create a conversation before creating a session-bound agent when using the plugin's persisted conversation flow.
- Keep every context value and tool result serializable.
- Pass an `AbortSignal` from HTTP/workflow/job cancellation and call `abort()` only for the owned service.
- Do not expose `AgentService` directly to untrusted request input without an App-owned route policy.
- Dispose or stop any App-owned resources when the App service/job lifecycle ends.
- Test the complete chain: conversation creation, agent creation, invoke/stream, persistence, errors, abort, and resume where applicable.
