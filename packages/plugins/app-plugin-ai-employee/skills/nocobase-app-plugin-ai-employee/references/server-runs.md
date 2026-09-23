# Running AI from App Server Code

Two different jobs: getting the App's own employees and tools into the runtime the plugin already created, and — much more rarely — driving an agent directly from App server code instead of through the chat UI.

## Table of contents

- [Register App resources](#register-app-resources)
- [When to drive an agent directly](#when-to-drive-an-agent-directly)
- [Public container tokens](#public-container-tokens)
- [Conversation first, then agent](#conversation-first-then-agent)
- [`AIConversationsManager`](#aiconversationsmanager)
- [`createAIEmployee()`](#createaiemployee)
- [`createAgent()`](#createagent)
- [Executing an agent](#executing-an-agent)
- [Running unattended](#running-unattended)
- [Replacing the context provider](#replacing-the-context-provider)
- [Replacing persistence](#replacing-persistence)
- [Security and lifecycle](#security-and-lifecycle)

## Register App resources

The App does not create an `AIManager`. The plugin already made one; the App hands it resources. Do not call `createAIManager()` for ordinary App work.

**1. Aggregate with static imports** in `server/ai/index.ts`, subclassing the public `AIResourceRegistrar`:

```ts
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import orderDesk from './employees/order-desk/index.js';
import createOrder from './tools/create-order.js';

export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(orderDesk);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(createOrder);
  }
}
```

**2. Call it from an App `ServiceProvider.boot()`**, resolving the original `aiManagerToken`:

```ts
import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';
import AppAIResources from '../ai/index.js';

export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/ai-resources';

  public override async boot(): Promise<void> {
    const ai = this.app.container.resolve(aiManagerToken);
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
```

**3. Add it to `serviceProviders` in `server/providers/index.ts`**, after the AI Employee plugin's own provider has booted. The App runtime drives `register → boot → start → ready → shutdown`; never register at module top level.

Notes that decide whether this works:

- Import `aiManagerToken` from the package export. `createServiceToken` keys the container by object identity, so recreating a token with the same name yields a different key that resolves nothing.
- `registerAIResources()` runs tools, then MCP, then skills, then employees. Do not reason from that order: names are resolved when the agent runs, not when it registers, so the App's employees can name the plugin's built-ins even though the plugin's own Provider booted first. What the order does buy is that one registrar's own resources are in place before its employees are read.
- The App root's `ai/skills` is already a default Skill directory; do not add it again. Add further directories through `config.yml` `ai.skills.paths`, not through the registrar's constructor.
- `AIResourceRegistrarOptions` also accepts `logger`, `mcpDirectory`, and `skillsDirectories`. Only `logger` and `source` are worth setting from an App: MCP belongs in `config.yml`, and Skill paths belong in `config.yml`.
- Two tools registered under one name is a decision, not an accident. Make it explicit rather than relying on registration order.

## When to drive an agent directly

The normal path covers almost everything:

```text
App ai/ resources + client/extensions/nocobase-ai
        ↓  @nocobase/app-plugin-ai-employee
   /api/ai, persisted conversations, SSE, tool approval
```

Reach for `AgentServiceFactory` only for an App-owned server integration that must invoke an agent with no browser present — a workflow adapter, a scheduled job, an App-owned API route, a server service. The caller must already have a clear actor, an authorization policy, and a lifecycle for the work. Confirm the existing `/api/ai` behavior is genuinely insufficient before proposing this.

## Public container tokens

```ts
import {
  aiConversationsManagerToken,
  agentServiceFactoryToken,
} from '@nocobase/app-plugin-ai-employee/server';

const conversations = container.resolve(aiConversationsManagerToken);
const factory = container.resolve(agentServiceFactoryToken);
```

These two, plus `aiManagerToken`, are the whole public server surface, along with the `AgentRequest`, `AgentInvokeRequest`, `AgentInvokeResult`, `AgentInvokeInterrupt`, `AgentInterruptAction`, `AgentStreamEvent`, and `AgentServiceErrorCode` types and the `AgentServiceError` class exported from the same entry. The plugin's internal factories — its repository, manager, service, and data-service tokens — are not exported and are not part of the contract; an App tool declares the App's own service tokens instead. Never deep-import a plugin server or agent source file.

`AgentServiceFactory` is an App-level singleton, but every `createAIEmployee()` or `createAgent()` call produces a new session-scoped `AgentService` with its own private context and conversation objects. Do not cache an `AgentService` globally or register one as a singleton.

## Conversation first, then agent

```ts
const conversation = await conversations.create({
  userId: actor.id,
  aiEmployee: { username: 'order-desk' },
  title: 'Order enquiry',
});

const agent = await factory.createAIEmployee({
  username: 'order-desk',
  state: { sessionId: conversation.sessionId },
  actor,
  runtime: { logger },
});

const { message } = await agent.invoke({
  userMessages: [{ role: 'user', content: 'How many orders are still open?' }],
});
```

`sessionId` is the identity shared by the conversation, message persistence, stream cache, tool state, abort handling, usage events, and checkpoints, so it has to exist before the agent does. Treat it as an opaque string: never coerce it to a number, expose it without authorization, or reuse it across users.

## `AIConversationsManager`

```ts
type CreateAIConversationParams = {
  userId?: string | number;
  aiEmployee?: { username: string };     // omit for a model-only createAgent() session
  title?: string;
  options?: AIConversationsOptions;      // systemMessage, skillSettings,
                                         // conversationSettings, modelSettings, frontendTools
  from?: 'main-agent' | 'sub-agent';
  scope?: string;
  transaction?: DatabaseConnection;      // only when the caller already owns one
};

create(options: CreateAIConversationParams): Promise<AIConversationEntity>;
update(options: { userId; sessionId; title?; options? }): Promise<AIConversationEntity | null>;
getConversation(options: { sessionId; userId? }): Promise<AIConversationEntity | null>;
getMessages(options: { userId; sessionId; cursor?; paginate?; updateRead? }):
  Promise<{ rows: HistoryMessage[]; hasMore?: boolean; cursor?: string | null }>;
```

`userId` is the owning application user — never a user id a model supplied. Always pass `userId` when reading or mutating a user-owned conversation; a missing or mismatched owner is not a successful lookup.

`getMessages` returns parsed history rows, not raw persistence records and not the Registry's already-normalized `AIChatMessage[]`. A row exposes `key` and a nested `content.messageId`; there is no top-level `messageId` or `sessionId`. Pagination matches HTTP: newest-first, 10 per page by default, `{ rows }` with a 200-row cap for `paginate=false`, tool rows joined into `content.tool_calls`, and `updateRead=true` marking the conversation read. Keep ids as strings, take the session id from the authorized conversation rather than from a row, and read [api-reference.md § History message schema](api-reference.md#history-message-schema) before adapting history into a new request.

## `createAIEmployee()`

```ts
interface CreateEmployeeOptions {
  readonly username: string;
  readonly state: AgentState; // its sessionId is the conversation the agent runs in
  readonly actor: Actor; // required; there is no implicit root
  readonly runtime: AgentRuntime; // required; logger, and the caller's locale and headers
  readonly from?: 'main-agent' | 'sub-agent';
  readonly systemPrompt?: string;
  readonly skillSettings?: AIEmployeeSkillSettings;
}
```

- `username` must identify an accessible employee. Do not copy a built-in definition into the App to reach one.
- `state` is what the execution _is_, built where the request is parsed rather than assembled field by field at the call site. It becomes the agent context every backend tool receives. Its `frontendTools` is a serializable manifest of available browser tools — never callbacks, DOM nodes, or functions.
- `actor` comes from the authenticated request or a trusted server job context, never from request JSON. Both factories used to fill a missing actor in with root; they no longer do, and that is deliberate.
- `systemPrompt` and `skillSettings` are the conversation's own configuration. They narrow or extend the employee's capabilities without bypassing permission checks.
- The model is the employee's, not the caller's. The factory resolves `state.model` against the employee's policy once, when the agent is created — honouring a requested model only when the employee's configuration allows it, and resolving the employee's own when the state names none.

**The tool context is fixed here.** `AgentServiceFactory` builds it once from `actor`, `state`, and `runtime`, and the service supplies the same one on every execution. A caller never passes it, and an `agentContext` key on `AgentRequest.runtime` is ignored — so request data cannot substitute another actor, session, or set of dependencies. A tool that needs the session id or the resolved model reads `ctx.state`, which is why an integration that activates tools must supply a real `state` rather than an empty one.

## `createAgent()`

For an execution with no AI Employee behind it — a fixed prompt, a fixed model, a named set of tools:

```ts
interface CreateAgentOptions {
  readonly sessionId: string; // required
  readonly actor: Actor; // required
  readonly runtime: AgentRuntime; // required
  readonly model?: ModelRef;
  readonly systemPrompt?: string;
  readonly tools?: readonly string[];
  readonly skills?: readonly string[];
  readonly persistence?: ConversationPersistence;
}
```

All three of `sessionId`, `actor`, and `runtime` are required: a fixed agent has nowhere to persist without a session, and there is no implicit root. `model` is fixed at creation and a request cannot override it; if none is supplied, the service must receive a usable model through configuration before it executes. `tools` and `skills` name registered resources to activate. A fixed agent has no employee presets, so each tool's own `defaultPermission` decides: `ALLOW` runs without asking, and `ASK` — which is also what a tool declaring nothing gets — pauses the run exactly as it does for an employee, reported as `interrupt` from `invoke()` and continued with `resumeInvoke()`. `autoCall` does not exist here. The pause is checkpointed in the plugin's own tables under the default persistence, and in the process beside a `persistence` the caller supplies, so a run paused under a custom persistence can be resumed only by the same `AgentService`. `messages` is not a creation option — the turn's messages go to `invoke()` or `stream()`.

## Executing an agent

```ts
interface AgentRequest {
  messageId?: string;                  // the message this operation forks from
  userMessages?: AIMessageInput[];
  userDecisions?: { interruptId?: string; decisions: UserDecision[] };
  runtime?: Record<string, unknown>;   // per-call middleware channel, e.g. appendMessages
  writer?: (chunk: unknown) => void;
  signal?: AbortSignal;
}

interface AgentInvokeRequest<T = never> extends AgentRequest { responseFormat?: ZodType<T>; }
interface AgentInvokeInterrupt { id: string; actions: AgentInterruptAction[]; }
interface AgentInvokeResult<T = never> { message: AIMessageInput | null; structuredResponse?: T; interrupt?: AgentInvokeInterrupt; }

invoke<T>(request?: AgentInvokeRequest<T>): Promise<AgentInvokeResult<T>>;
stream(request?: AgentRequest): AsyncGenerator<AgentStreamEvent>;
resumeInvoke<T>(request: AgentInvokeRequest<T>): Promise<AgentInvokeResult<T>>;
resumeStream(request: AgentRequest): AsyncGenerator<AgentStreamEvent>;
forkInvoke<T>(request: AgentInvokeRequest<T>): Promise<AgentInvokeResult<T>>;
forkStream(request: AgentRequest): AsyncGenerator<AgentStreamEvent>;
cancelToolCall(): Promise<AIMessageInput[] | undefined>;
abort(reason?: unknown): void;
```

`AIMessageInput` is `{ role, content, createdAt?, toolCalls?, attachments?, workContext?, metadata? }`; `messageId` and `sessionId` are server-assigned, so omit them.

`invoke()` reports the assistant turn it produced as `message`, in this package's own message shape rather than the underlying graph state. `message` is `null` when the execution produced no assistant content. A turn that paused for a human decision resolves rather than rejects, with `interrupt` set: its `id` is what a resume passes as `interruptId`, `actions` lists the paused tool calls in decision order, and `message` is the assistant turn that requested them rather than a finished answer. Before `invoke()` returns, those tool calls are already recorded as `interrupted` on the conversation, so a decision can be attached to each of them through the HTTP API as well. `interrupt` is absent when the execution finished, so check it before treating `message` as the answer. Only an agent nested inside another agent's tool, such as a sub-agent, rejects with a `GraphInterrupt` instead, for the enclosing agent to record.

When the integration needs data rather than prose, supply a Zod `responseFormat` and read `structuredResponse`:

```ts
const { structuredResponse } = await agent.invoke({
  userMessages: [{ role: 'user', content: 'Summarize this month of orders.' }],
  responseFormat: z.object({
    total: z.number(),
    openCount: z.number(),
  }),
});
```

Read the value from `structuredResponse`, never by parsing `message.content`. How the schema is satisfied depends on the model — one with native JSON-schema output answers with the JSON as content, one without is handed the schema as a tool and the final assistant message is that tool call with empty content. `structuredResponse` holds the parsed value either way. `stream()` takes no `responseFormat`; it reports the answer as content events and has nowhere to put a structured value.

Use `messageId` when forking from a persisted message, `userDecisions` only to resume an interrupt, and `signal` for cancellation from HTTP, a workflow, or a job. Consume `stream()` with `for await`, and do not hand-parse or persist stream events when the surrounding App service already owns that transport.

Do not infer HTTP behavior from this return value: `sendMessages` with `stream: false` currently invokes internally but still responds over SSE without serializing the result. For external callers use the [HTTP walkthrough](api-reference.md#http-conversation-walkthrough); for an App-owned integration that genuinely needs the direct result, use this API.

## Running unattended

An agent driven from a job, a schedule, a workflow node, or any other caller with nobody watching differs from a chat in four ways. What the surrounding system is — how it schedules, where it writes its result — is its own concern and not this plugin's; what follows is only what this plugin requires of it.

**Use `invoke()`, not `stream()`.** `stream()` is an async generator: the run advances only while something consumes it, so an unattended caller that forgets to drain it stalls holding an open conversation. `invoke()` runs the loop to completion and returns the result. Use `responseFormat` when the caller needs data rather than prose — it is simpler and more reliable than instructing the model to put its answer somewhere.

**Pass an `AbortSignal` and own the cancellation.** `AgentRequest.signal` is merged with the service's own controller, so either can stop the run. Give it the signal the surrounding system already cancels with — a job timeout, a shutdown hook, a user cancelling upstream — rather than inventing a second timer. There is no built-in wall-clock limit; the only automatic stop is a graph recursion limit of 200 steps, which surfaces as its own error code. On abort the run rejects with `code: 'ABORTED'`, and only the assistant turn in progress at that moment is dropped. Everything before it stays: the user message is saved when the run starts, each earlier step's assistant message and tool results are saved as the run goes, and a tool that already ran has already had its effect. So before retrying, read the conversation to see how far the run got, and rely on the tools being safe to call twice rather than on the run having left nothing behind.

**Decide what an interrupt means before it happens.** A tool that is not allowed to run on its own suspends the run to ask a person, and in an unattended run there is nobody to ask. `invoke()` then resolves with `interrupt` set and the paused tool calls recorded, and the run stays suspended until someone resumes it. So the reliable arrangement is not to interrupt at all, which means knowing every tool the run can reach:

- **`createAgent()`** reaches only the tools it names and the ones its Skills name. Name only tools declaring `defaultPermission: 'ALLOW'`.
- **`createAIEmployee()`** also reaches every `GENERAL` tool, and two of those always pause: `suggestions` asks, and `formFiller` runs in a browser, which an unattended run does not have. A model commonly ends a turn by offering suggestions, so an employee run that does not exclude them stops there. Exclude them by naming the session's tools in `skillSettings`, as an allowlist:

```ts
const agent = await factory.createAIEmployee({
  username: 'order-desk',
  state: { sessionId: conversation.sessionId },
  actor,
  runtime: { logger },
  // Every tool this run may use, including the ones a Skill activates.
  skillSettings: { toolsVersion: 1, tools: ['getSkill', 'dataQuery'] },
});
```

The list narrows what the employee already allows; it never adds a tool the employee does not have. It covers tools a Skill activates as well as base tools, so a Skill's tools have to be on it too. The system tools — `getSkill`, `subAgentWebSearch`, `knowledge-base-retrieve` and `aiEmployeeWorkflowTaskOutput` — pass it regardless, each still subject to its own switch. `toolsVersion` matters only for an empty list: with it, `tools: []` leaves only the system tools; without it, an empty list means no filter at all.

If a tool that asks is genuinely required, the caller is deciding on the user's behalf and should say so — resume with an explicit decision per action rather than a blanket approval, and make only a decision the action allows:

```ts
const { interrupt } = await agent.invoke({ userMessages });
if (interrupt) {
  await agent.resumeInvoke({
    userDecisions: {
      interruptId: interrupt.id,
      // One decision per action, in `interrupt.actions` order.
      decisions: interrupt.actions.map((action) =>
        action.toolCall?.name === 'draft-reply' &&
        action.allowedDecisions?.includes('approve')
          ? { type: 'approve' }
          : { type: 'reject', message: 'Not allowed in an unattended run' },
      ), // 'edit' with editedAction is the third choice
    },
  });
}
```

Approving whatever is pending, unconditionally, turns every `ASK` into an `ALLOW` without the tool or the employee saying so. If that is the intent, make it the tool's declared permission instead, where it is visible.

An action identifies its tool call — `toolCall.id` and `toolCall.name` — but does not carry the arguments. A caller that decides on what the tool was about to do, rather than on which tool it is, reads the arguments from `message.toolCalls` on the same result and joins them on `id`: `message` is the assistant turn that requested the paused calls.

A run that is neither resumed nor revisited stays paused, with its calls recorded as `interrupted`. Do not send a new turn into that conversation as it stands: `invoke()` does not clear pending calls. `agent.cancelToolCall()` does — it closes them as declined and returns the tool messages that close them — but the chat route also puts the closed turn ahead of the next message, which is not part of the public API. For an unattended run, start a new conversation instead, or resume the one that paused.

**Give the run a way out, if it needs one.** Anything the agent should do _during_ the run — report progress, notify a channel, hand a partial result onward — is an ordinary backend tool: register it in code, declare what it needs on `dependencies`, and activate it by name for this agent. The model calls it like any other tool. This is for effects that must happen while the run is going; when all the caller wants is the answer at the end, `responseFormat` already delivers it and a tool adds a failure mode for nothing.

### Failures a caller has to tell apart

`AgentServiceError` carries a typed code, and an unattended caller needs it because retrying is its decision to make. Import it from the public entry and check it by class:

```ts
import { AgentServiceError } from '@nocobase/app-plugin-ai-employee/server';

try {
  await agent.invoke({ userMessages });
} catch (error) {
  if (!(error instanceof AgentServiceError)) throw error;
  logger.warn(
    { code: error.code, cause: error.rootMessage },
    'agent run failed',
  );
  if (error.retryable) scheduleRetry();
}
```

`retryable` says whether an immediate second attempt could plausibly differ:

| Code                    | What happened                                     | `retryable` |
| ----------------------- | ------------------------------------------------- | ----------- |
| `GRAPH_RECURSION_ERROR` | The 200-step limit was reached                    | `true`      |
| `EMPTY_RESPONSE`        | `stream()` produced nothing at all                | `true`      |
| `CONFIGURATION_ERROR`   | No usable model, LLM service, or provider         | `false`     |
| `PROVIDER_ERROR`        | Anything else that failed, including the provider | `false`     |
| `ABORTED`               | The signal fired; `aborted` is also set           | `false`     |

The two retryable ones are retryable because a model is not deterministic: another attempt may take fewer steps or actually answer. `EMPTY_RESPONSE` comes only from `stream()`; the same outcome from `invoke()` resolves with `message: null` instead of rejecting, so check for it. `CONFIGURATION_ERROR` fails the same way until someone changes the configuration. `PROVIDER_ERROR` is the catch-all — a provider outage, a rate limit, a network failure, and also a tool dependency the container cannot resolve — and `false` means only that an immediate retry is not worth it, because the provider client has already retried transient failures itself. A retry the caller schedules minutes later, with backoff, can still succeed; read `rootMessage` to tell an outage from a mistake before deciding.

`AgentServiceErrorCode` also declares `MODEL_RESPONSE_ERROR` and `PERSISTENCE_ERROR`, which this package maps to HTTP statuses but never raises from the agent path. Handle them if switching exhaustively; do not wait for them.

Read `rootMessage` rather than walking `cause`: it returns the deepest message in the chain, guarding against cycles, and it is the one worth logging — the wrapper's own message is usually the least specific thing available.

A paused run is none of these either: `invoke()` resolves with `interrupt` set rather than rejecting. Only a nested agent rejects with a `GraphInterrupt`, which is not an `AgentServiceError` and has no code — match the error `name` if calling one directly.

## Replacing the context provider

`AgentContextProvider` is the extension point for the context an `AgentService` consumes:

```ts
interface AgentContextProvider {
  currentConversation(): CurrentConversation; // { sessionId, username?, from?, metadata? }
  resolveLLM(): Promise<ResolvedAgentLLM>; // no argument: the model comes from the state
  getSystemPrompt(
    messages: readonly AIMessageInput[],
  ): Promise<string | undefined>;
  discoveredTools(): Promise<DiscoveredTools>; // { tools: ReadonlyMap<…>; activeTools() }
  readonly agentContext: AgentContext; // a property, fixed at creation
}
```

Rules an implementation must hold:

1. Keep `currentConversation()` stable for the service's lifetime, and its `sessionId` matching the session the agent was created for.
2. Resolve the model by applying the provider's policy to the model in `agentContext.state`, falling back to its own default. Do not reject a state that names no model while one can be resolved, and do not accept a named model the policy disallows. Throw a clear error when nothing resolves; never quietly create another AI manager.
3. Return a prompt string or `undefined`. A prompt is not an authorization mechanism — enforce access in tool code and service policy.
4. Return only registered, serializable tool definitions; `activeTools()` decides which are enabled for this execution.
5. Hold one `agentContext` for the service's lifetime, snapshotting the trusted actor and execution state at construction. It being a property rather than a method is what makes that literal: there is nothing to recompute per call.
6. Do not load or save messages here. History and tool state belong to the conversation provider.
7. Do not put `DatabaseManager`, repositories, a service factory, a conversation provider, or a mutable options aggregate into the public contract. Keep infrastructure private inside the App-owned adapter.

The factory's standard path owns provider selection. Implement a custom one only inside an App-owned integration that also owns a compatible assembly boundary; do not deep-import a private implementation class to replace one method.

## Replacing persistence

```ts
interface ConversationPersistence {
  readonly conversations: AIConversationRepository; // records, ownership, title, options
  readonly messages: AIMessageRepository; // user, assistant, other messages
  readonly toolMessages: AIToolMessageRepository; // tool arguments, results, state
  readonly usageEvents: AIUsageEventRepository; // usage records, idempotent updates
  createChatConversation(options: { sessionId: string }): AIChatConversation;
}
```

`createChatConversation()` must return the adapter for the supplied session id — never a different session id, never a different user.

A replacement must preserve the default provider's behavior: assistant message and usage-event writes share one transaction connection; a usage-event failure rolls back the related message; tool statuses and call ordering stay intact; message ids keep string semantics and are never converted to `number`; uniqueness and conflict handling stay in the repository; stream-cache isolation, abort handling, thread/fork/resume, and checkpoints are unchanged; and methods are safe to call again where the default flow is idempotent.

`ConversationPersistence` changes storage only. It does not change orchestration, so do not substitute fire-and-forget writes, an async post-commit usage job, an aggregate with hidden semantics, or a second state machine. If a custom implementation breaks a transaction or message-id invariant, disable it and return to the default database persistence before investigating further.

## Security and lifecycle

- Resolve both tokens from the App container. Do not construct a competing manager.
- Authorize the user id, the employee username, the session id, tool activation, and conversation access — separately from whatever the prompt says.
- Create the conversation before the session-bound agent.
- Keep every context value and tool result serializable.
- Pass an `AbortSignal` from the surrounding HTTP, workflow, or job cancellation, and call `abort()` only on a service this code owns.
- Never expose `AgentService` to untrusted request input without an App-owned route policy. It is a server API and is deliberately not a browser one.
- If conversation creation succeeds and agent creation then fails, do not retry blindly: record the session id, inspect the conversation state, and use an App-owned cleanup or archive path if the product needs one.
- Dispose App-owned resources when the App service or job lifecycle ends.
- Test the whole chain — conversation creation, agent creation, invoke and stream, persistence, errors, abort, resume — separately from ordinary UI checks.
