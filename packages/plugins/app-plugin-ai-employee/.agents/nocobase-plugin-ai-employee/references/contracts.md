# Exact AI Contracts for App Development

This reference records the parameter shapes an App code agent normally needs when the source package is not available locally. Keep the names and enum values exact. Optional means the property may be omitted; do not substitute `null` unless the type explicitly permits it.

## Table of contents

- [Employee resources](#employee-resources)
- [Backend tools](#backend-tools)
- [Skills](#skills)
- [MCP](#mcp)
- [LLM models](#llm-models)
- [Tool context](#tool-context)
- [Frontend root/provider](#frontend-rootprovider)
- [Chat provider and tasks](#chat-provider-and-tasks)
- [Page context](#page-context)
- [Forms](#forms)
- [Frontend tools](#frontend-tools)
- [Chat UI components](#chat-ui-components)
- [Tool renderers](#tool-renderers)
- [Settings tabs](#settings-tabs)

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
  systemPrompt?: string | null; // base behavior; prompt.md can replace it
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
  introduction?: {
    title: string; // may contain i18n template syntax
    about?: string;
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

`ai/skills/<name>/SKILLS.md` uses YAML frontmatter:

```yaml
scope: SPECIFIED | GENERAL | CUSTOM
name: stable-skill-name
description: One-line model-facing purpose.
tools: ['tool-name']
introduction:
  title: Display title
  about: Optional display description
```

`name`, `description`, and `scope` are required. `tools` is an array of exact registered tool names. The Markdown body is the skill content supplied to the model. A skill-local `tools/` directory is discovered and merged into `tools`; do not use filesystem paths in the frontmatter.

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
type LLMServiceOptions = {
  name: string; // unique service key
  title?: string; // display title
  provider: string; // registered provider key
  options?: Record<string, unknown>; // provider credentials/config
  enabledModels?:
    | string[] // normalized to custom {label,value} entries
    | {
        mode: 'recommended' | 'provider' | 'custom';
        models: {
          label: string;
          value: string;
        }[];
      }
    | null;
  modelOptions?: Record<string, unknown>;
  enabled?: boolean;
  sort?: number;
};
```

The `ai.llmServices` array is authoritative and defaults to empty. Duplicate names or invalid entries reject the snapshot before repository mutation. Environment placeholders use `${NAME}` and are expanded recursively after validation; a missing variable becomes an empty string. Existing names preserve repository `enabled` and `enabledModels`; new names use config values or manager defaults. Reload application config after editing.

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

Register during client module evaluation. Import the registration module for side effects from the App plugin client entry. The lazy module must default-export a React component. The shared route is `/settings/ai`; do not create a replacement settings page for one tab. Core tabs are `ai-employee` and `llm-service`; use a unique application key.
