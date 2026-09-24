# Exact `/api/ai` and AI Service Contracts

Prefer the installed `nocobaseAIService` and chat transport. Use direct routes only from a centralized App adapter. All route paths below are relative to `/api/ai` and use `resource:action` notation.

## Table of contents

- [Model reference](#model-reference)
- [AIService](#aiservice)
- [Employees and models](#employees-and-models)
- [Conversation lifecycle](#conversation-lifecycle)
- [HTTP conversation walkthrough](#http-conversation-walkthrough)
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
  llmService: string; // LLM service name from config.yml/settings
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
{ keyword?: string }
```

Returns a direct JSON array of the current user's main-agent chat conversation records, newest `updatedAt` first; there is no `{ data }` or `{ rows }` wrapper. The HTTP route reads `keyword`, not a `scope` query parameter. Records use `sessionId`, `aiEmployeeUsername`, `read`, and `options.modelSettings`; `title` can be `null` before the first text prompt. The Registry normalizes each item to:

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
  cursor?: string;            // opaque message id from the previous page
  paginate?: boolean;         // query literal false disables pagination; default true
  updateRead?: boolean;       // query literal true marks read; default false
}
```

#### History response envelope and pagination

The response is a direct JSON object, not an array and not `{ data: ... }`:

```ts
type GetMessagesResponse =
  | { rows: HistoryMessage[]; hasMore: boolean; cursor: string | null }
  | { rows: HistoryMessage[] }; // paginate=false only
```

With pagination enabled, the server returns at most 10 rows in descending message-id order (newest first). `cursor` is the oldest returned row's id, even when `hasMore` is false; an empty page returns `{ "rows": [], "hasMore": false, "cursor": null }`. Request older messages with the returned `cursor` only while `hasMore` is true. There is no total, page number, or configurable page size. `paginate=false` still returns `{ rows }`, omits `hasMore` and `cursor`, ignores an input cursor, and is capped at the latest 200 non-tool messages; it does not promise the entire conversation.

`updateRead=true` marks the conversation read before loading messages. A missing or unowned conversation is an error, not an empty history. Standalone `role: 'tool'` rows are excluded; their results are joined into assistant tool calls. System rows are not filtered out by this endpoint. Nested sub-agent messages are ordered oldest first within their own session, unlike the top-level rows.

#### History message schema

These are parsed response rows, not raw database `AIMessage` records, incoming send-message objects, or Registry `AIChatMessage` objects. The built-in parsers expose the following JSON-facing shape; optional properties can be omitted and nullable persisted fields can be `null`. `unknown` below means provider/application-defined JSON, not an executable value.

```ts
type HistoryMessage = {
  key: string; // stable persisted message id; keep it as a string
  role?: string | null; // normally user, assistant, or system; not an employee username
  createdAt?: string | null; // serialized timestamp, normally ISO 8601; not a JS Date
  content: HistoryContent; // object even when stored content is null
};

type HistoryContent = {
  messageId: string; // same persisted id as the outer key
  from: 'main-agent' | 'sub-agent';
  type?: string | null; // normally text; not guaranteed for every stored message
  content?: unknown; // usually text, but may be null, absent, or structured JSON
  metadata?: Record<string, unknown> | null;
  attachments?: unknown[] | null;
  workContext?: HistoryWorkContext[] | null;
  tool_calls?: HistoryToolCall[] | null;
  reasoning?: unknown;
  reference?: { title?: string; url?: string }[] | null;
  subAgentConversations?: {
    sessionId: string;
    toolCallId: string;
    status: 'pending' | 'completed';
    messages: HistoryMessage[];
  }[];
  [key: string]: unknown; // retained content and provider-specific extensions
};

type HistoryWorkContext = {
  type: string;
  uid: string;
  title?: string;
  content?: unknown;
  [key: string]: unknown;
};

type HistoryToolCall = {
  id: string; // tool-call id, NOT the containing message id
  name: string;
  type: string;
  args: unknown;
  invokeStatus?: string | null;
  invokeStartTime?: number | string | null; // epoch milliseconds, possibly a decimal string
  invokeEndTime?: number | string | null;
  auto?: boolean | null;
  status?: string | null;
  content?: unknown; // joined tool result, possibly null or absent
  execution?: 'frontend' | 'backend';
  willInterrupt?: boolean;
  defaultPermission?: 'ASK' | 'ALLOW';
  [key: string]: unknown;
};
```

| Field                                           | Meaning and absence handling                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`, `content.messageId`                      | Both identify the same persisted message. There is **no top-level `messageId`**, `id`, or `sessionId` in the built-in parsed row. Use `key` for stable rendering/deduplication and as the `messageId` for resend, tool decisions, or resume; send/edit uses `editingMessageId`. Keep the conversation's `sessionId` separately. Never convert a message id or cursor to `number`.                                                                                           |
| `role`, `createdAt`                             | Passed through from persistence. Normal writes provide a role and creation time, but storage allows nulls; tolerate missing/null values from older or custom records. Do not infer chronological order from timestamps or use an array index as a persistent id.                                                                                                                                                                                                            |
| `content.type`, `content.content`               | Structured content wrapper and its payload. Display text only after checking `typeof row.content.content === 'string'`. An assistant tool-only message can have empty text; provider parsers can retain structured content or omit a text payload.                                                                                                                                                                                                                          |
| `content.metadata`                              | Optional/nullable persisted metadata, such as `model`, `provider`, `llmService`, usage, response metadata, and interrupt state. Provider-dependent; not a required display contract.                                                                                                                                                                                                                                                                                        |
| `content.attachments`                           | Optional/nullable array of persisted attachment JSON. Normal uploaded references contain `filename` and may include `id`, `uid`, `size`, `mimetype`, `url`, `preview`, and `source`; see [Files](#files) and `IncomingAttachmentRef` below. No attachment is guaranteed on a row, and URLs are not necessarily absolute.                                                                                                                                                    |
| `content.workContext`                           | Optional/nullable array of resolved context snapshots. `type` and `uid` identify normal context items; their content and additional fields depend on the App. This is not a live DOM/page handle.                                                                                                                                                                                                                                                                           |
| `content.tool_calls`                            | Response spelling is snake case, unlike incoming/persisted `toolCalls`. Normally absent when persisted `toolCalls` is null, or `[]` when an empty array was stored; raw/provider content can also carry null. Join fields can be absent/null when no tool result exists, and execution/permission can be absent if the tool is no longer registered. `willInterrupt` reflects frontend execution or `auto === false`, not proof that a call is currently awaiting approval. |
| `content.from`, `content.subAgentConversations` | Top-level rows are marked `main-agent`. When sub-agent metadata exists, nested sessions carry `sessionId`, the dispatch `toolCallId`, status, and parsed messages marked `sub-agent`; a session can have an empty `messages` array.                                                                                                                                                                                                                                         |
| `content.reasoning`, `content.reference`        | Optional provider additions. Reasoning can include `{ status: 'stop', content: string }`; references can include titles/URLs. Do not require them or assume every provider returns the same structure.                                                                                                                                                                                                                                                                      |

Normalize optional arrays with an array check rather than assuming every response contains `[]`. The Registry service requests `paginate=false`, reverses the rows, removes tool/system roles, and maps them to UI messages; its `AIChatMessage[]` return value is not the HTTP response schema. See the [HTTP walkthrough](#http-conversation-walkthrough), [message boundary pitfalls](contracts.md#message-input-and-history-boundaries), and [server manager history boundary](agent-service.md#conversation-manager-methods).

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

- `GET aiConversations:unreadCounts` → `{ conversationUnreadCount: number }`.
- `GET aiConversations:unreadCount` → `number`.

## HTTP conversation walkthrough

This sequence uses a cookie-authenticated App mounted at its origin root. For a path-mounted App, include its public base path in `BASE_URL`. Prerequisites: an existing enabled user, an enabled/access-authorized employee, and a configured LLM service/model with valid credentials. Replace `atlas`, `openai`, and `gpt-4.1` with values available from `aiEmployees:listByUser` and `ai:listAllEnabledModels`; they are example identifiers, not automatic configuration. Responses below are illustrative snapshots, not fixed ids, timestamps, or guaranteed model text. JSON actions return HTTP 200 with `Content-Type: application/json`; they do not use a generic `data` envelope.

### 1. Authenticate and retain the session cookie

Authentication is under `/api/auth`, not `/api/ai`. Use the App's configured login mechanism; the standard username/password endpoint is:

```bash
BASE_URL='http://localhost:3000'
# Use an existing local account. Keep the password and cookie jar out of source control.
curl -i -c /tmp/nocobase-ai.cookies \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"REPLACE_WITH_YOUR_PASSWORD"}' \
  "$BASE_URL/api/auth/sign-in/username"
```

Example JSON response (the user object can include additional configured fields):

```json
{
  "redirect": false,
  "token": "REDACTED_SESSION_TOKEN",
  "user": {
    "id": "user-alice",
    "name": "Alice",
    "username": "alice",
    "email": "alice@example.com",
    "emailVerified": false,
    "image": null,
    "createdAt": "2026-04-09T09:00:00.000Z",
    "updatedAt": "2026-04-09T09:00:00.000Z"
  }
}
```

The response also sets the session cookie; `curl -c` saves it and subsequent `-b` options send it. Cookie names, secure prefixes, and paths depend on deployment configuration. Do not assume the JSON `token` enables Bearer authentication: that requires an explicitly configured authentication integration. Do not use legacy `/api/auth:signIn` or manually invent cookie values.

### 2. Create a conversation

```bash
curl -sS -b /tmp/nocobase-ai.cookies \
  -H 'Content-Type: application/json' \
  -d '{"aiEmployee":{"username":"atlas"},"modelSettings":{"llmService":"openai","model":"gpt-4.1"}}' \
  "$BASE_URL/api/ai/aiConversations:create"
```

Example response:

```json
{
  "userId": "user-alice",
  "aiEmployeeUsername": "atlas",
  "options": {
    "modelSettings": { "llmService": "openai", "model": "gpt-4.1" }
  },
  "thread": 1,
  "from": "main-agent",
  "category": "chat",
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "createdAt": "2026-04-09T10:00:00.000Z",
  "updatedAt": "2026-04-09T10:00:00.000Z"
}
```

Keep the returned `sessionId` verbatim. Creation returns the inserted record, not just `{ sessionId }`; database defaults such as `read` and `llmActiveState` need not appear until a later read. The HTTP create endpoint requires an employee even though the trusted server manager also supports model-only sessions.

### 3. List conversations

```bash
curl -sS -b /tmp/nocobase-ai.cookies \
  "$BASE_URL/api/ai/aiConversations:list"
```

Example response when this is the user's only conversation:

```json
[
  {
    "sessionId": "11111111-1111-4111-8111-111111111111",
    "thread": 1,
    "topicId": null,
    "from": "main-agent",
    "scope": null,
    "userId": "user-alice",
    "aiEmployeeUsername": "atlas",
    "title": null,
    "options": {
      "modelSettings": { "llmService": "openai", "model": "gpt-4.1" }
    },
    "llmActiveState": "idle",
    "category": "chat",
    "read": true,
    "createdAt": "2026-04-09T10:00:00.000Z",
    "updatedAt": "2026-04-09T10:00:00.000Z"
  }
]
```

### 4. Read the new conversation's history

Set `SESSION_ID` to the value returned in step 2, not to the example value when calling a real App:

```bash
SESSION_ID='11111111-1111-4111-8111-111111111111'
curl -sS -b /tmp/nocobase-ai.cookies --get \
  --data-urlencode "sessionId=$SESSION_ID" \
  "$BASE_URL/api/ai/aiConversations:getMessages"
```

Response before sending any messages:

```json
{ "rows": [], "hasMore": false, "cursor": null }
```

Add `--data-urlencode 'paginate=false'` to receive `{ "rows": [] }` instead. Add `--data-urlencode 'updateRead=true'` only when the caller intends to mark the conversation read.

### 5. Send a message with `stream: false`

```bash
curl -i -N -b /tmp/nocobase-ai.cookies \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"aiEmployee\":\"atlas\",\"model\":{\"llmService\":\"openai\",\"model\":\"gpt-4.1\"},\"messages\":[{\"role\":\"user\",\"content\":{\"type\":\"text\",\"content\":\"Say hello in one short sentence.\"}}],\"stream\":false}" \
  "$BASE_URL/api/ai/aiConversations:sendMessages"
```

**Current HTTP limitation:** `stream: false` selects `agent.invoke()` internally, but the route still opens an SSE response and does not serialize the returned invocation value. A successful invocation closes with an empty response body, not a JSON assistant message:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no

```

Do not call `response.json()` on this response. If invocation throws after the SSE response opens, the body instead contains an error frame such as `data: {"type":"error","body":"conversation not found"}` followed by two newlines; HTTP 200 alone does not prove execution succeeded. Prefer the normal streaming transport for chat. For this non-streaming execution example, wait for the response to close, inspect any SSE error frames, and read persisted history. Do not resend automatically if the request disconnects or the result is uncertain.

### 6. Read persisted user and assistant messages

```bash
curl -sS -b /tmp/nocobase-ai.cookies --get \
  --data-urlencode "sessionId=$SESSION_ID" \
  --data-urlencode 'updateRead=true' \
  "$BASE_URL/api/ai/aiConversations:getMessages"
```

Illustrative text-only result after successful completion (metadata varies by provider, and tool use can produce additional rows):

```json
{
  "rows": [
    {
      "key": "2030000000000000002",
      "createdAt": "2026-04-09T10:00:02.000Z",
      "role": "assistant",
      "content": {
        "type": "text",
        "content": "Hello! How can I help you today?",
        "messageId": "2030000000000000002",
        "metadata": {
          "provider": "openai",
          "model": "gpt-4.1",
          "llmService": "openai"
        },
        "attachments": null,
        "workContext": null,
        "tool_calls": [],
        "from": "main-agent"
      }
    },
    {
      "key": "2030000000000000001",
      "createdAt": "2026-04-09T10:00:01.000Z",
      "role": "user",
      "content": {
        "type": "text",
        "content": "Say hello in one short sentence.",
        "messageId": "2030000000000000001",
        "metadata": null,
        "attachments": null,
        "workContext": null,
        "from": "main-agent"
      }
    }
  ],
  "hasMore": false,
  "cursor": "2030000000000000001"
}
```

`paginate=false` returns the same rows for this two-message conversation, but without `hasMore` or `cursor`. Render oldest first by reversing a copy of the rows; retain `key` as the stable id. Remove the local cookie jar when finished.

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
  stream?: boolean; // Registry omits; false invokes internally but HTTP still returns SSE
};
```

Registry normal flow sends exactly one latest user message with content `{ type: 'text', content: string }`, completed attachments only, and resolved work context. The HTTP response is SSE, including when a custom caller sends `stream: false`; see the [non-streaming execution example and limitation](#5-send-a-message-with-stream-false). For the JSON history response after execution, use [getMessages](#get-aiconversationsgetmessages).

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

A managed backend tool cannot be created from JSON alone without an existing executable `invoke` function. Define executable App tools in `server/ai/tools`; use management APIs primarily to edit registered metadata/frontend tools.

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
  enabledModels?: {
    mode: 'provider' | 'custom';
    models: { label: string; value: string }[];
  };
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
