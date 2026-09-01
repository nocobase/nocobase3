# Exact `/api/ai` and AI Service Contracts

Prefer the installed `nocobaseAIService` and chat transport. Use direct routes only from a centralized App adapter. All route paths below are relative to `/api/ai` and use `resource:action` notation.

## Table of contents

- [Model reference](#model-reference)
- [AIService](#aiservice)
- [Employees and models](#employees-and-models)
- [Conversation lifecycle](#conversation-lifecycle)
- [Message streaming](#message-streaming)
- [Tool decisions and resume](#tool-decisions-and-resume)
- [Files](#files)
- [Management resources](#management-resources)
- [SSE](#sse)
- [Errors and security](#errors-and-security)

## Model reference

Every server execution model reference is:

```ts
type ModelRef = {
  llmService: string; // LLM service name from models.json/settings
  model: string; // provider model id
};
```

Do not send the frontend display label. The frontend `AIModel.value` maps to `ModelRef.model`; `AIModel.llmService` maps to `ModelRef.llmService`.

## AIService

```ts
interface AIService {
  listEmployees(): Promise<AIEmployee[]>;
  listModels(): Promise<AIModel[]>;
  updateEmployeeUserPrompt(username: string, prompt: string): Promise<void>;
  listConversations(keyword?: string): Promise<AIConversation[]>;
  getConversationMessages(
    sessionId: string,
    options?: { updateRead?: boolean },
  ): Promise<AIChatMessage[]>;
  getConversationActiveState(
    sessionId: string,
  ): Promise<'idle' | 'streaming' | 'invoking' | undefined>;
  updateConversationTitle(sessionId: string, title: string): Promise<void>;
  destroyConversation(sessionId: string): Promise<void>;
  uploadFile(
    file: File,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
  createConversation(options: {
    employee: AIEmployee;
    model: AIModel;
    systemMessage?: string;
    skillSettings?: { skills?: string[]; tools?: string[] };
  }): Promise<string>; // sessionId
  sendMessagesStream(
    body: SendMessagesRequest,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  resendMessagesStream(
    body: ResendMessagesRequest,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  updateToolCallDecision(
    options: UpdateToolCallDecisionOptions,
  ): Promise<{ updated: number; toolCalls: UpdatedToolCall[] }>;
  resumeToolCallStream(
    body: ResumeToolCallRequest,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  resumeConversationStream(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
}
```

The actual interface uses `unknown` for raw streaming bodies so custom transports remain possible. App code should use the concrete shapes documented below.

## Employees and models

### `GET aiEmployees:listByUser`

No body/query. Returns accessible frontend employee objects:

```ts
type AIEmployee = {
  username: string;
  nickname: string;
  position?: string;
  bio?: string;
  greeting?: string;
  description?: string;
  avatar?: string;
  category?: string;
  deprecated?: boolean;
  builtIn?: boolean;
  userConfig?: { prompt?: string };
  modelSettings?: {
    enabled?: boolean;
    llmService?: string;
    model?: string;
    models?: { llmService?: string; model?: string }[];
  };
};
```

### `POST aiEmployees:updateUserPrompt`

```ts
{
  aiEmployee: string; // required employee username
  prompt?: string;    // omitted/non-string becomes empty string in route handling
}
```

Returns JSON `null`.

### `GET ai:listAllEnabledModels`

No body/query. Returns service groups:

```ts
type EnabledLLMService = {
  llmService: string;
  llmServiceTitle: string;
  provider: string;
  providerTitle?: string;
  enabledModels: { label: string; value: string }[];
  supportWebSearch: boolean;
  webSearchModels?: string[];
  isToolConflict: boolean;
};
```

The Registry flattens each `enabledModels` item into `AIModel`.

Other model actions:

- `GET ai:listLLMProviders`: no input; returns provider metadata.
- `GET ai:listLLMServices?model=<model-id>`: `model` optional.
- `GET ai:listModels?llmService=<service>&model=<model-id>`: `llmService` required by behavior; `model` optional.
- `POST ai:listProviderModels`: body `{ llmService: string; search?: string }`; returns `{ id: string }[]`.

## Conversation lifecycle

### `POST aiConversations:create`

```ts
type CreateConversationRequest = {
  aiEmployee:
    | AIEmployee
    | {
        username: string;
        nickname?: string;
        position?: string;
        bio?: string;
        greeting?: string;
        avatar?: string;
        category?: string;
        enabled?: boolean;
        skills?: string[];
        tools?: { name: string; autoCall?: boolean }[];
        chatSettings?: Record<string, unknown>;
        modelSettings?: Record<string, unknown>;
      };
  modelSettings: ModelRef; // required by normal Registry flow
  systemMessage?: string;
  skillSettings?: {
    skills?: string[];
    tools?: string[];
  };
  conversationSettings?: Record<string, unknown>;
  scope?: string;
};
```

`aiEmployee.username` is required and must resolve to an enabled employee. Returns an object containing `sessionId: string`. Keep that session id for all following actions.

### `GET aiConversations:list`

Query:

```ts
{ scope?: string; keyword?: string }
```

Returns the current user's main chat conversations. The Registry normalizes each item to:

```ts
type AIConversation = {
  id: string; // sessionId
  title: string;
  employeeUsername: string;
  updatedAt: string;
  unread?: boolean;
  model?: { llmService?: string; model: string };
};
```

### `GET aiConversations:getMessages`

Query:

```ts
{
  sessionId: string;          // required
  cursor?: string;
  paginate?: boolean;         // false disables pagination; default true
  updateRead?: boolean;       // true marks read; default false
}
```

### `GET aiConversations:get`

Query `{ sessionId: string }`. Returns:

```ts
{
  llmActiveState: 'idle' | 'streaming' | 'invoking';
}
```

If no conversation row is found, active state falls back to `idle`.

### `PUT aiConversations:update`

Query `{ sessionId: string }`, body `{ title?: string }`.

### `PUT aiConversations:updateOptions`

Query `{ sessionId: string }`, body with at least one truthy option:

```ts
{
  systemMessage?: string;
  skillSettings?: { skills?: string[]; tools?: string[] };
  conversationSettings?: Record<string, unknown>;
  modelSettings?: ModelRef | Record<string, unknown>;
}
```

### `DELETE aiConversations:destroy`

Query `{ sessionId: string }`. Returns `null`.

### Unread counters

- `GET aiConversations:unreadCounts` → `{ conversationUnreadCount: number; workflowTaskUnreadCount: number }`.
- `GET aiConversations:unreadCount` → `number`.

## Message streaming

### `POST aiConversations:sendMessages`

```ts
type IncomingAttachmentRef = {
  id?: string | number;
  uid?: string;
  filename: string; // required
  size?: number;
  mimetype?: string;
  url?: string;
  preview?: string;
  source?: {
    dataSourceKey?: string;
    collectionName?: string;
    field?: string;
    documentCache?: boolean;
  };
  [key: string]: unknown;
};

type IncomingChatMessage = {
  key?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: { type: string; content: unknown };
  attachments?: IncomingAttachmentRef[];
  workContext?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  toolCalls?: Record<string, unknown>[];
};

type SendMessagesRequest = {
  sessionId: string;
  aiEmployee: string; // employee username
  model: ModelRef;
  messages: IncomingChatMessage[]; // must contain a user message
  systemMessage?: string;
  skillSettings?: { skills?: string[]; tools?: string[] };
  editingMessageId?: string;
  webSearch?: boolean;
  stream?: boolean; // Registry omits; route defaults to streaming
};
```

Registry normal flow sends exactly one latest user message with content `{ type: 'text', content: string }`, completed attachments only, and resolved work context. Response is SSE unless `stream: false` is deliberately used by a custom caller.

### `POST aiConversations:resendMessages`

```ts
type ResendMessagesRequest = {
  sessionId: string;
  messageId?: string;
  model: ModelRef;
  webSearch?: boolean;
};
```

Response is SSE.

### `POST aiConversations:resumeStream`

Body `{ sessionId: string }`. Response is SSE. Use for reconnecting to an active/cached stream, not for resending the user prompt.

### `POST aiConversations:abort`

Body `{ sessionId: string }`. Aborts active agent execution for that conversation. Returns a JSON result from the conversation service.

## Tool decisions and resume

### `POST aiConversations:updateUserDecision`

```ts
type ToolCallDecision =
  | { type: 'approve' }
  | { type: 'reject'; message?: string }
  | {
      type: 'edit';
      editedAction: { name: string; args: unknown };
    };

type UpdateToolCallDecisionRequest = {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  userDecision: ToolCallDecision;
};
```

All ids are required. The target tool call must exist and be interrupted. For `executeFrontendTool`, the nested tool id must still exist in current conversation context. Returns:

```ts
{
  updated: number;
  toolCalls: {
    id: string;
    name: string;
    invokeStatus?: string;
    status?: string;
    auto?: boolean;
    execution?: string;
    willInterrupt?: boolean;
    args?: unknown;
  }[];
}
```

### `POST aiConversations:resumeToolCall`

```ts
type ResumeToolCallRequest = {
  sessionId: string;
  messageId?: string; // if omitted, server uses latest message
  toolCallIds?: string[];
  toolCallResults?: { id: string; result: unknown }[];
  model: ModelRef;
  webSearch?: boolean;
};
```

Response is SSE. For browser tools, `toolCallResults[].id` is the original tool-call id and `result` must be serializable.

### `POST aiConversations:updateToolArgs`

```ts
{
  sessionId: string;
  messageId: string;
  tool: {
    id: string;
    args: unknown;
  }
}
```

Updates matching persisted tool-call arguments and returns `null`. This does not itself execute or resume the tool.

## Files

### `POST aiFiles:create`

Multipart form data with exactly one field named `file` whose value is a browser `File`. Returns file metadata such as id/uid, filename, size, mimetype, URL, or preview depending on storage implementation. The Registry resolves returned relative URLs.

### `GET aiFiles:preview`

Query `{ id: string }`. Returns a file preview response, not a JSON envelope.

## Management resources

These are administrative/settings actions and should not be exposed to ordinary users without App authorization.

### Employees

- `GET aiEmployees:list`
- `GET aiEmployees:get?key=<username>`
- `GET aiEmployees:getTemplates`
- `POST aiEmployees:create` with an employee resource body
- `PUT aiEmployees:update?key=<username>` with editable fields; query key forces username
- `DELETE aiEmployees:destroy?key=<username>`

Common editable employee fields:

```ts
{
  enabled?: boolean;
  about?: string | null;
  modelSettings?: {
    enabled?: boolean;
    llmService?: string;
    model?: string;
    models?: ModelRef[];
  };
  skillSettings?: {
    skills?: string[];
    tools?: { name: string; autoCall?: boolean }[];
  };
  enableKnowledgeBase?: boolean;
  knowledgeBasePrompt?: string;
  knowledgeBase?: {
    knowledgeBaseKeys?: string[];
    topK?: number;
    score?: number;
    retrievalStrategy?: 'always' | 'onDemand';
  };
}
```

### Skills

Actions: `list`, `get?key`, `create`, `update?key`, `destroy?key` on resource `aiSkills`.

Managed body:

```ts
{
  name: string;
  scope?: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  description?: string;
  content?: string;
  tools?: string[];
  from?: string;
  introduction?: { title?: string; about?: string };
}
```

### Tools

Actions: `list`, `get?key`, `create`, `update?key`, `destroy?key` on resource `aiTools`.

Managed metadata body:

```ts
{
  scope?: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  from?: 'loader' | 'workflow' | 'mcp';
  execution?: 'frontend' | 'backend';
  defaultPermission?: 'ASK' | 'ALLOW';
  silence?: boolean;
  introduction?: { title?: string; about?: string };
  definition: {
    name: string;
    description?: string;
    schema?: Record<string, unknown>;
  };
}
```

A managed backend tool cannot be created from JSON alone without an existing executable `invoke` function. Define executable App tools in `ai/tools`; use management APIs primarily to edit registered metadata/frontend tools.

### MCP servers

Actions: `list`, `get?key`, `create`, `update?key`, `destroy?key` on resource `aiMcpServers`.

```ts
{
  name: string;
  title?: string;
  description?: string;
  enabled?: boolean;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  restart?: Record<string, unknown>;
}
```

List/get responses redact secret-like environment/header values.

### LLM services

Actions: `list`, `get?key`, `create`, `update?key`, `destroy?key` on resource `llmServices`.

```ts
{
  name?: string; // create requires a usable name; update query key forces it
  title?: string;
  provider?: string;
  options?: Record<string, unknown>;
  enabledModels?:
    | string[]
    | {
        mode: 'recommended' | 'provider' | 'custom';
        models: { label: string; value: string }[];
      }
    | null;
  modelOptions?: Record<string, unknown>;
  enabled?: boolean;
  sort?: number;
}
```

## SSE

Headers:

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

Each frame is:

```text
data: <JSON>\n\n
```

The installed stream parser handles content, reasoning, web search, tool-call chunks/status, interrupts, message persistence, new messages, sub-agent lifecycle, and errors. A stream failure is sent as:

```json
{ "type": "error", "body": "message", "errorName": "optional" }
```

Always pass an `AbortSignal`. After disconnect, inspect active state/history and use resume; never blindly duplicate a mutation.

## Errors and security

JSON failures use an envelope compatible with:

```ts
{
  errors: [{ message: string }];
  error: string;
}
```

Validation commonly returns HTTP 400, not-found 404, and unexpected errors 500. Routes use the authenticated App session and current-user conversation ownership. Backend tools must still enforce business authorization using `ctx.actor` and supplied services/repositories. The presence of a management endpoint does not grant ordinary-user access.
