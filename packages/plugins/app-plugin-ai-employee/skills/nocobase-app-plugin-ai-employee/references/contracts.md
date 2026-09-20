# Exact AI Contracts for App Development

This reference records the parameter shapes an App code agent normally needs when the source package is not available locally. Keep the names and enum values exact. Optional means the property may be omitted; do not substitute `null` unless the type explicitly permits it.

## Table of contents

- [Employee resources](#employee-resources)
- [Backend tools](#backend-tools)
- [Skills](#skills)
- [Tool and Skill display i18n](#tool-and-skill-display-i18n)
- [MCP](#mcp)
- [LLM models](#llm-models)
- [Tool context](#tool-context)
- [Message input and history boundaries](#message-input-and-history-boundaries)
- [Frontend root/provider](#frontend-rootprovider)
- [Chat provider and tasks](#chat-provider-and-tasks)
- [Page context](#page-context)
- [Forms](#forms)
- [Frontend tools](#frontend-tools)
- [Chat UI components](#chat-ui-components)
- [Tool renderers](#tool-renderers)
- [Settings tabs](#settings-tabs)
- [Server container and AgentService](#server-container-and-agentservice)

## Employee resources

`defineAIEmployee(options)` accepts an object with:

```ts
type AIEmployeeOptions = {
  username: string; // required, stable unique key
  category?: string; // e.g. business; service visibility may filter it
  description?: string; // short purpose shown in lists
  avatar?: string; // avatar key or URL understood by the App
  nickname?: string; // display name
  position?: string; // role label
  bio?: string; // profile text
  greeting?: string; // empty-state greeting
  systemPrompt?: string | null; // base behavior; prompt.md is not supported; use the TypeScript systemPrompt field
  skills?: string[]; // registered skill names
  tools?: { name: string; autoCall?: boolean }[];
  chatSettings?: {
    systemPromptMode?: 'default' | 'raw' | 'none';
    enableSkills?: boolean;
    enableTools?: boolean;
    [key: string]: unknown;
  };
  sort?: number;
};
```

`username` is the value used by `AIEmployeeShortcut.aiEmployee`, tasks, conversation requests, and sub-agent dispatch. It must not be changed after users have stored conversations against it. `tools[].name` must match a registered tool name. `autoCall: true` permits the runtime's automatic-call policy; it does not bypass permission or approval rules.

The persisted employee entity may additionally contain `enabled`, `builtIn`, `deprecated`, `about`, `defaultPrompt`, `skillSettings`, `knowledgeBase`, model settings, roles, and sort. Do not put persisted-only fields into a resource definition unless the current public type accepts them.

## Backend tools

`defineTools<TContext>(options)` accepts:

```ts
type ToolsOptions<TContext> = {
  scope: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  from?: 'loader' | 'workflow' | 'mcp';
  execution?: 'frontend' | 'backend'; // application ai/ tools should use backend
  requiresContext?: boolean;
  defaultPermission?: 'ASK' | 'ALLOW';
  silence?: boolean;
  i18n?: { namespace: string }; // actual owning plugin or application package name
  introduction?: {
    title: string; // English source text, not template syntax
    about?: string; // English source text for display only
  };
  definition: {
    name: string; // stable tool key
    description: string; // instructions for the model
    schema?: ZodSchema; // usually a Zod object schema
  };
  invoke: (
    ctx: TContext,
    args: unknown,
    runtime: {
      toolCallId: string;
      writer: (chunk: unknown) => void;
    },
  ) => Promise<unknown>;
};
```

Recommended tool result convention:

```ts
{ status: 'success' | 'error', content: unknown }
```

`scope` controls activation: `GENERAL` is globally available; `SPECIFIED` is activated through employee/skill/conversation settings; `CUSTOM` is reserved for a caller-specific provider. `execution` describes where invocation occurs. `defaultPermission` controls default approval behavior and must be explicit for application tools. The schema must describe the exact argument object the model sends; do not read undeclared positional arguments.

`AgentContext<Repositories, Services>` is:

```ts
type AgentContext<R = unknown, S = unknown> = {
  ai: AIManager;
  database: DatabaseManager;
  logger: Logger;
  repositories: R;
  services: S;
  state: {
    sessionId?: string;
    messageId?: string;
    messages?: AIMessageInput[];
    model?: Record<string, unknown>;
    webSearch?: boolean;
    important?: string;
    frontendTools?: unknown[];
    toolCallResults?: { id: string; result: unknown }[];
    timezone?: string;
  };
  actor: {
    id: string | number;
    roles: string[];
    isRoot: boolean;
    locale?: string;
  };
  translate?: (key: string, options?: Record<string, unknown>) => string;
};
```

Only use `repositories` and `services` members that the App runtime actually supplies. `actor` is the authorization identity; never treat a model-provided id as authorized without checking it.

## Skills

`ai/skills/<name>/SKILL.md` uses YAML frontmatter:

```yaml
scope: SPECIFIED | GENERAL | CUSTOM
name: stable-skill-name
description: One-line model-facing purpose.
i18n:
  namespace: '@acme/sales-app' # Replace with the actual owning package.json name.
tools: ['tool-name']
introduction:
  title: Display title
```

`name`, `description`, and `scope` are required. `tools` is an array of exact registered tool names. The Markdown body is the skill content supplied to the model. A skill-local `tools/` directory is discovered and merged into `tools`; do not use filesystem paths in the frontmatter.

## Tool and Skill display i18n

Top-level `i18n.namespace` opts a resource into display translation using the actual `package.json` name of the plugin or application that owns it. Do not use a display name, Skill name, the renderer's package, or an application namespace sentinel. Dynamic Tool factories must return the namespace on each Tool. A Skill and its referenced Tools remain independent: each resource uses its own namespace even when the resources come from different packages.

Tool `introduction.title` and `introduction.about`, and Skill `introduction.title` and `description`, use readable English source text as flat translation keys. This is a narrow exception to the general semantic-key convention. Match the exact full source string, including punctuation, whitespace, and capitalization; do not put semantic keys or `{{t(...)}}` templates in these fields. Use Skill `description` for its translated summary rather than adding `introduction.about`.

Add every source key to the owner's `client/locales/en-US.ts` with the English text as its value, even when English fallback already looks correct. Add the same flat key with its translation to `client/locales/zh-CN.ts` and other supported locales, and register the owner's Client locale loaders. Server locale resources do not provide these display translations. A source wording change requires updating the exact key in every locale.

Localization happens only when rendering display metadata. Do not translate or rewrite Tool `definition.description`, Tool or Skill names, schemas, Skill Markdown instructions, persisted data, or descriptions passed to the model. Namespace-free resources and missing translations retain their source text. Lists sort by localized display title using the current locale, with the stable `name` as the tie-breaker, and recompute when the locale changes.

See the [Tool example and locale entries](../SKILL.md#tool-and-skill-display-translations) for a complete source-key example.

## MCP

`defineMCP(options)` accepts:

```ts
type MCPOptions = {
  transport: 'stdio' | 'sse' | 'http';
  command?: string; // normally required for stdio
  args?: string[];
  env?: Record<string, string>;
  url?: string; // normally required for sse/http
  headers?: Record<string, string>;
  restart?: Record<string, unknown>;
};
```

Use `stdio` with `command`/`args`, or `sse`/`http` with `url`. Do not commit bearer tokens in `headers`; inject them through environment/configuration. The MCP server name is the resource key used by the manager and settings UI.

## LLM models

Each entry in `config.yml` `ai.llmServices` is:

```ts
type AIEmployeeLLMServiceConfig = {
  name: string; // unique service key
  title?: string; // display title
  provider: string; // registered provider key
  options?: Record<string, unknown>; // provider credentials/config
  enabledModels?: Array<{ label: string; value: string }>; // implicit custom mode
  modelOptions?: Record<string, unknown>;
  enabled?: boolean;
  sort?: number;
};
```

The `ai.llmServices` array is authoritative and defaults to empty. Configured `enabledModels` entries are converted internally to `{ mode: 'custom', models }`. Duplicate names or invalid entries reject the snapshot before repository mutation. Environment placeholders use `${NAME}` and are expanded recursively after validation; a missing variable becomes an empty string. Existing names preserve repository `enabled` and `enabledModels`; new names use config values or manager defaults. Reload application config after editing.

Frontend model values are:

```ts
type AIModel = {
  value: string; // model id
  label: string; // display label
  llmService?: string; // service name
  llmServiceTitle?: string;
  supportWebSearch?: boolean;
  isToolConflict?: boolean;
  configured?: boolean;
};
```

When creating a conversation, use `model.value` as `modelSettings.model` and `model.llmService` as `modelSettings.llmService`.

## Tool context

AI messages use this application-facing shape:

```ts
type AIMessageInput = {
  role: string;
  content: unknown;
  createdAt?: string | Date;
  toolCalls?: AIToolCall[];
  attachments?: unknown[];
  workContext?: WorkContext[];
  metadata?: Record<string, unknown>;
  // messageId and sessionId are server-assigned and must be omitted
};

type AIToolCall = {
  id: string;
  name: string;
  type: string;
  args: unknown;
  [key: string]: unknown;
};

type WorkContext = {
  type: string;
  uid: string;
  title?: string;
  content?: unknown;
  [key: string]: unknown;
};
```

For normal Registry usage, do not construct these manually; let the chat transport do it. If constructing one for an API adapter, use a supported role and structured content and omit server-assigned ids.

## Message input and history boundaries

Do not reuse one message type across these boundaries:

| Boundary                                    | Shape and id contract                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct server `AgentService` input          | `AIMessageInput` above; omit server-assigned `messageId` and `sessionId`.                                                                                                                                                                                                                            |
| HTTP `sendMessages` input                   | `{ sessionId, aiEmployee, model, messages }`; the session id belongs to the request, and a normal user message has `{ role: 'user', content: { type: 'text', content: string } }`. See [send-message contracts](api-reference.md#post-aiconversationssendmessages).                                  |
| HTTP `getMessages` response                 | `{ rows, hasMore, cursor }` by default, or `{ rows }` for `paginate=false`. Each parsed row has `key`, `role`, `createdAt`, and a structured `content` object containing `messageId`. There is no top-level `messageId`. See the [complete history schema](api-reference.md#history-message-schema). |
| Registry `getConversationMessages()` result | `AIChatMessage[]` after unwrapping, reversing, filtering system/tool roles, and converting content to UI parts. This is not the raw HTTP response.                                                                                                                                                   |

History pitfalls: preserve `key`/`content.messageId` and cursors as opaque strings; distinguish the containing message id from `content.tool_calls[].id`; tolerate missing/null timestamps, metadata, attachments, and work context; and check the payload type before rendering `content.content` as text. History's nested `content.tool_calls` is not input's top-level `toolCalls`. Do not echo a whole history row back as a new user message. `paginate=false` is capped at 200 rows, not an unlimited export, and top-level history arrives newest first.

For a complete authenticated create → list → history → send → history exchange, see the [HTTP walkthrough](api-reference.md#http-conversation-walkthrough). In particular, `stream: false` currently changes internal execution but **does not produce a JSON HTTP response**: the route remains SSE and discards the invoke result. Read persisted history after completion or use the installed streaming transport; never retry the mutation blindly.

## Frontend root/provider

```ts
type NocoBaseAIRootProviderProps = AIProviderProps & {
  toolRenderers?: Record<string, AIToolRendererEntry>;
  contextFailurePolicy?: 'throw' | 'omit';
};

type AIProviderProps = {
  children: ReactNode;
  employees?: AIEmployee[]; // if omitted, service.listEmployees()
  models?: AIModel[]; // if omitted, service.listModels()
  service?: AIService; // defaults to nocobaseAIService
  toolInvokers?: Record<string, AIToolInvoker>;
  globalController?: AIChatController;
};
```

Do not override the reserved invoker names `formFiller`, `loadFrontendTool`, or `executeFrontendTool`. If employees/models are supplied, provide both together; otherwise let the service load both.

## Chat provider and tasks

```ts
type AIChatProviderProps = {
  children: ReactNode;
  id: string; // required stable chat id
  controller?: AIChatController;
  defaultEmployee?: string; // employee.username
  defaultTasks?: AIEmployeeTask[];
  employeeTasks?: Record<string, AIEmployeeTask[]>;
  webSearch?: boolean;
};

type AIEmployeeTask = {
  title?: string;
  message?: {
    system?: string;
    user?: string;
    workContext?: AIWorkContextItem[];
  };
  autoSend?: boolean;
  skillSettings?: { skills?: string[]; tools?: string[] };
  webSearch?: boolean;
  model?: { llmService?: string; model: string };
};
```

`employeeTasks` keys are employee usernames. `model.model` is the model id; `llmService` is optional only when the runtime can resolve it. `message.user` is the user prompt, `message.system` is task background, and `message.workContext` contains references, not resolved live data. `autoSend` defaults to false behavior unless explicitly enabled by the trigger/task flow.

`AIChatController` methods:

```ts
type AIChatController = {
  getSnapshot: () => { open: boolean };
  subscribe: (listener: () => void) => () => void;
  setOpen: (open: boolean) => void;
  open: () => void;
  close: () => void;
  triggerTask: (options: AIEmployeeTaskTrigger) => void;
  bindTaskHandler: (
    handler: (options: AIEmployeeTaskTrigger) => void | Promise<void>,
  ) => () => void;
};
```

## Page context

```ts
type AIPageElementDescriptor = {
  id?: string; // use a stable id when referenced by tasks
  title: string; // required display label
  kind?: string;
  getContext: () => unknown | Promise<unknown>;
  tools?: AIFrontendToolRegistration[];
};

type AIPageElementHandle = {
  ref: RefCallback<HTMLElement>;
  context: { type: 'page-element'; id: string; title: string; kind?: string };
};
```

`useAIPageElement(descriptor)` returns a React ref callback. `useAIPageElementHandle(descriptor)` requires `descriptor.id` and returns `{ ref, context }`. Attach `ref` to the actual visible element. `getContext` is evaluated when selected/sent; return plain serializable data. Do not pass resolved data directly into `context` references.

`AIPageContextScope` accepts:

```ts
{
  context: AIWorkContextItem | AIWorkContextItem[]; // required
  mode?: 'replace' | 'append';                       // default 'replace'
  children: ReactNode;
}
```

`AIPageElementPickerOptions` accepts `chatId?`, required `onSelect(item)`, and optional `onCancel()`. `useAIPageElementPicker()` exposes `picking`, `registeredCount`, `startPicking(options)`, and `cancelPicking()`.

## Forms

```ts
type AIFormDescriptor = {
  id: string;
  title: string;
  fields: AIFormField[];
  getValues: () => unknown | Promise<unknown>;
  setValues: (values: Record<string, unknown>) => void | Promise<void>;
};

type AIFormField = {
  name: string;
  title?: string;
  type?: string;
  description?: string;
  readonly?: boolean;
  required?: boolean;
  enum?: unknown;
  [key: string]: unknown;
};
```

`useAIForm(descriptor)` returns `RefCallback<HTMLElement>`; attach it to the visible form. Field `name` values must be unique. Supported built-in type validation includes string/text/textarea/email/url/date/datetime, number/percent, integer, boolean/checkbox, array, and object. `setValues` receives only valid, editable, declared fields. The built-in form filler never submits.

## Frontend tools

```ts
type AIFrontendToolRegistration<TArgs = unknown, TResult = unknown> = {
  name: string; // /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
  title?: string;
  description: string; // non-empty
  permission?: 'ASK' | 'ALLOW'; // default 'ASK'
  inputSchema?: Record<string, unknown>; // JSON-schema-like serializable object
  execute: (args: TArgs) => TResult | Promise<TResult>;
};
```

The generated configuration is:

```ts
type AIFrontendToolConfiguration = {
  id: string; // `${blockUid}:${name}`
  blockUid: string; // page context id
  name: string;
  title?: string;
  description: string;
  permission: 'ASK' | 'ALLOW';
  inputSchema: Record<string, unknown>;
};
```

`defineAIFrontendTool(registration)` returns the same registration with type inference. Register it through a page-element descriptor's `tools` array. `inputSchema` defaults to `{ type: 'object', properties: {} }` and must survive structured cloning. `execute` must return a structured-clone/JSON-serializable value. The exact generated `id` must appear in the current page context catalog before the agent can load or execute it.

## Chat UI components

```ts
type AIChatWindowProps = {
  className?: string;
  headerActions?: ReactNode;
  composerActions?: AIChatComposerAction[];
  showConversationToggle?: boolean; // default true
  showNewConversation?: boolean; // default true
  showEmployeeSelector?: boolean; // default true
  showModelSelector?: boolean; // default true
  showUserPrompt?: boolean; // default true
  enableAttachments?: boolean; // default false
  attachmentActionIndex?: number; // default 0
  placeholder?: string;
  disclaimer?: ReactNode | false;
  onToolCallDecision?: (decision: AIToolCallDecision) => void | Promise<void>;
};

type ChatSurfaceProps = {
  children: ReactNode;
  open: boolean;
  variant: 'side-panel' | 'dialog';
  onOpenChange: (open: boolean) => void;
  side?: 'left' | 'right'; // default right
  width?: number | string; // default 450
  closeOnEscape?: boolean; // default true
  showCloseHandle?: boolean; // default false
};

type ChatSidePanelProps = Omit<ChatSurfaceProps, 'variant'>;
type ChatDialogProps = {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
type ChatInlineProps = { children: ReactNode; className?: string };
type ChatPageProps = { children: ReactNode; className?: string };
```

`AIChatFloatingTrigger` accepts `aiEmployee?: string`, `controller?: AIChatController`, `unreadCount?: number` (default 0), `position?: 'fixed' | 'absolute'` (default fixed), `hideWhenOpen?: boolean` (default true), and `className?: string`.

`AIEmployeeShortcut` accepts:

```ts
type AIEmployeeShortcutProps = {
  aiEmployee: string | AIEmployee; // required username or object
  tasks?: AIEmployeeTask[]; // default []
  context?: AIWorkContextItem[];
  target?: AIChatController; // defaults to global controller
  auto?: boolean;
  size?: number; // default 48
  label?: string;
  showNotice?: boolean; // default false
  className?: string;
  onTrigger?: (task?: AIEmployeeTask) => void;
};
```

## Tool renderers

```ts
type AIToolRendererProps = {
  part: ToolCallPart;
  disabled: boolean;
  onEdit: (input: unknown) => void | Promise<void>;
  onApprove: () => void | Promise<void>;
  onReject: (message?: string) => void | Promise<void>;
  onRevise: () => void;
};

type AIToolRendererDefinition = {
  component: React.ComponentType<AIToolRendererProps>;
  handlesApproval?: boolean;
  standalone?: boolean;
};

type AIToolRendererEntry =
  React.ComponentType<AIToolRendererProps> | AIToolRendererDefinition;

type AIToolRendererMap = Record<string, AIToolRendererEntry>;
```

The renderer map key is the exact tool name. `handlesApproval: true` means the renderer presents approval controls itself. `standalone: true` means it is rendered outside the normal generic card layout. A renderer must call the supplied callbacks rather than mutating persisted tool state directly.

## Server container and AgentService

For direct server-side execution, resolve `aiConversationsManagerToken` and `agentServiceFactoryToken` from `@nocobase/app-plugin-ai-employee/server`. Create a conversation first, then pass its `sessionId` to `createAIEmployee()` or `createAgent()`. The complete contracts, execution methods, context-provider contract, persistence contract, and security invariants are in [agent-service.md](agent-service.md).

These APIs are for App-owned server services, routes, workflow/job adapters, and similar trusted integrations. They are not client/browser APIs, and they do not replace the installed AI chat transport.

## Settings tabs

```ts
type AISettingsTabDefinition = {
  key: string;                        // unique tab key
  labelKey: string;                   // translation key/text
  pageLoader: () => Promise<{
    default: React.ComponentType;
  }>;
};

registerAISettingsTabs(
  tabs: readonly AISettingsTabDefinition[],
): void;
```

This registry and `getAISettingsTabs()` are deprecated compatibility APIs only. They retain definitions for existing callers, but AI Employees and the public shell wrappers no longer render cross-feature tabs or contributed tab content. Contribute `defineSettingsRoutes()` entries with `parent: 'aiGroup'` instead; see [Settings pages](frontend-registry.md#settings-pages). `AISettingsShellProps.activeTabKey` and `onTabChange` remain accepted but have no effect. `getActiveAISettingsTabKey()` remains available for interpreting legacy URLs/state. Knowledge-base list/vector path constants now point to `/settings/ai/knowledge-base` and `/settings/ai/vector-database`; detail path prefixes are unchanged.
