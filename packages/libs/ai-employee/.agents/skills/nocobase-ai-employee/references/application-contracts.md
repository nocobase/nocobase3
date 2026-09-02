# Exact Application Contracts

## Contents

- [How to Use This Reference](#how-to-use-this-reference)
- [Tool Definition](#tool-definition)
- [Skill Configuration](#skill-configuration)
- [AI Employee Definition](#ai-employee-definition)
- [MCP Definition](#mcp-definition)
- [LLM Service Application Config](#llm-service-configuration)
- [AIManager Shape](#aimanager-shape)
- [Manager Return Entities](#manager-return-entities)
- [Tools Manager Signatures](#tools-manager-signatures)
- [Skills Manager Signatures](#skills-manager-signatures)
- [Employee Manager Signatures](#employee-manager-signatures)
- [MCP Manager Signatures](#mcp-manager-signatures)
- [LLM Service Manager Signatures](#llm-service-manager-signatures)
- [LLM Provider Manager Signatures](#llm-provider-manager-signatures)
- [Custom Provider Base Signatures](#custom-provider-base-signatures)
- [MCP Action Tool Manager Signatures](#mcp-action-tool-manager-signatures)
- [Feature Manager Signatures](#feature-manager-signatures)
- [AgentContext Shape](#agentcontext-shape)
- [Common Parameter Errors](#common-parameter-errors)

## How to Use This Reference

Assume the coding agent cannot open `@nocobase/ai-employee` source. Use the definitions below as the parameter contract. Do not guess field names, enum casing, required fields, callback argument order, or return shapes.

All TypeScript imports come from:

```ts
import type {} from /* contract */ '@nocobase/ai-employee';
```

## Tool Definition

Use `defineTools<TContext>(options)` and default-export the result.

```ts
type ToolsOptions<TContext = unknown> = {
  scope: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  execution?: 'frontend' | 'backend';
  requiresContext?: boolean;
  defaultPermission?: 'ASK' | 'ALLOW';
  silence?: boolean;
  introduction?: {
    title: string;
    about?: string;
  };
  definition: {
    name: string;
    description: string;
    schema?: any;
  };
  invoke: (
    ctx: TContext,
    args: any,
    runtime: {
      toolCallId: string;
      writer: (chunk: any) => void;
    },
  ) => Promise<any>;
};
```

Field rules:

| Field                    | Required | Meaning and constraints                                                                                                                                                     |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scope`                  | yes      | Exact uppercase enum: `SPECIFIED`, `GENERAL`, or `CUSTOM`.                                                                                                                  |
| `definition`             | yes      | Model-facing tool definition.                                                                                                                                               |
| `definition.name`        | yes      | Must be non-empty for validation. For filesystem resources, the loader replaces it with the filename/directory key. Still provide a non-empty placeholder or intended name. |
| `definition.description` | yes      | Model-facing usage description. A sibling `description.md` replaces it when loaded from a tool directory.                                                                   |
| `definition.schema`      | no       | Input schema, commonly a Zod object. `null` is accepted by existing resources but a precise schema is preferred.                                                            |
| `invoke`                 | yes      | Async callback. Argument order is `(ctx, args, runtime)`. Must return a Promise.                                                                                            |
| `defaultPermission`      | no       | `ASK` by default; use `ALLOW` only for safe automatic calls.                                                                                                                |
| `execution`              | no       | Defaults to `backend`. Use `frontend` only when the client runtime owns execution.                                                                                          |
| `requiresContext`        | no       | Set `false` only when the tool genuinely does not need application context.                                                                                                 |
| `silence`                | no       | Normalized to `false` unless exactly `true`.                                                                                                                                |
| `introduction.title`     | no       | Human-readable title; defaults to `definition.name`.                                                                                                                        |

Filesystem key examples:

- `ai/tools/search.ts` → registered name `search`.
- `ai/tools/search/index.ts` → registered name `search`.
- `ai/tools/search/description.md` → description for `search`.

Minimal valid definition:

```ts
import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import { z } from 'zod';

export default defineTools<AgentContext>({
  scope: 'SPECIFIED',
  defaultPermission: 'ASK',
  definition: {
    name: 'search',
    description: 'Search application records.',
    schema: z.object({ query: z.string().min(1) }),
  },
  async invoke(ctx, args, runtime) {
    return {
      status: 'success',
      content: await searchRecords(ctx, args.query),
    };
  },
});
```

## Skill Configuration

A skill is a `SKILLS.md` file parsed as Markdown with YAML frontmatter.

```yaml
---
name: reporting
description: Build and explain business reports.
scope: SPECIFIED
introduction:
  title: Reporting
  about: Create reports from application data.
tools:
  - query-records
---
Skill instructions go here.
```

Exact fields:

| Field          | Required | Type/default                                                                            |
| -------------- | -------- | --------------------------------------------------------------------------------------- |
| `name`         | yes      | `string`; unique registration key. Do not rely on directory name as the registered key. |
| `description`  | yes      | `string`; concise model-facing description.                                             |
| `scope`        | no       | `SPECIFIED                                                                              | GENERAL                                   | CUSTOM`; defaults to `SPECIFIED`. |
| `introduction` | no       | `{ title: string; about?: string }`.                                                    |
| `tools`        | no       | `string[]`; defaults to `[]`; local `tools/**/*.ts                                      | js` names are appended and de-duplicated. |

The Markdown body becomes `content`. When nested below an employee, keep the skill directory name equal to frontmatter `name`, because employee discovery uses the directory name while skill registration uses frontmatter `name`.

## AI Employee Definition

Use `defineAIEmployee(options)` and default-export it.

```ts
type AIEmployeeOptions = {
  username: string;
  category?: string;
  description?: string;
  skills?: string[];
  tools?: Array<{
    name: string;
    autoCall?: boolean;
  }>;
  chatSettings?: {
    systemPromptMode?: 'default' | 'raw' | 'none';
    enableSkills?: boolean;
    enableTools?: boolean;
    [key: string]: unknown;
  };
  avatar?: string;
  nickname?: string;
  position?: string;
  bio?: string;
  greeting?: string;
  systemPrompt?: string | null;
  sort?: number;
};
```

Field rules:

| Field                           | Required | Meaning                                                                                                                                                                                                   |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `username`                      | yes      | Stable unique key used by lookup, conversations, and overrides.                                                                                                                                           |
| `category`                      | no       | Defaults to `business` for a newly registered built-in employee.                                                                                                                                          |
| `description`                   | no       | Internal/selection description.                                                                                                                                                                           |
| `skills`                        | no       | Skill names, not paths. Defaults to `[]`.                                                                                                                                                                 |
| `tools`                         | no       | Tool settings. Each item requires `name`; `autoCall` is optional boolean. A bare string is accepted only by the normalization helper, not by the declared `AIEmployeeOptions.tools` type. Prefer objects. |
| `chatSettings.systemPromptMode` | no       | Exact values: `default`, `raw`, or `none`.                                                                                                                                                                |
| `chatSettings.enableSkills`     | no       | Enables skill behavior when true.                                                                                                                                                                         |
| `chatSettings.enableTools`      | no       | Enables tool behavior when true.                                                                                                                                                                          |
| `systemPrompt`                  | no       | String, `null`, or omitted. A colocated `prompt.md` replaces this value.                                                                                                                                  |
| profile fields                  | no       | `avatar`, `nickname`, `position`, `bio`, `greeting`.                                                                                                                                                      |
| `sort`                          | no       | Number used before username in employee ordering.                                                                                                                                                         |

Example:

```ts
import { defineAIEmployee } from '@nocobase/ai-employee';

export default defineAIEmployee({
  username: 'support-agent',
  category: 'business',
  nickname: 'Support Agent',
  description: 'Answers support questions and checks ticket status.',
  skills: ['support-policy'],
  tools: [
    { name: 'lookup-ticket', autoCall: true },
    { name: 'search-documents' },
  ],
  chatSettings: {
    systemPromptMode: 'default',
    enableSkills: true,
    enableTools: true,
  },
  sort: 10,
});
```

## MCP Definition

Use `defineMCP(options)` and default-export it.

```ts
type MCPOptions = {
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  restart?: Record<string, any>;
};
```

Transport requirements:

| Transport | Required                                   | Ignored/cleared                           |
| --------- | ------------------------------------------ | ----------------------------------------- |
| `stdio`   | `command`; `args` optional; `env` optional | `url` is cleared; `headers` becomes `{}`. |
| `http`    | `url`                                      | `command` is unused.                      |
| `sse`     | `url`                                      | `command` is unused.                      |

Normalization converts non-null `args` items to strings and converts `env`/`headers` values to strings. Provide correct string values anyway.

```ts
import { defineMCP } from '@nocobase/ai-employee';

export default defineMCP({
  transport: 'http',
  url: process.env.COMPANY_MCP_URL ?? '',
  headers: {
    Authorization: `Bearer ${process.env.COMPANY_MCP_TOKEN ?? ''}`,
  },
});
```

The registered server name is the module filename. After programmatic MCP changes, call `rebuildClient()`.

## LLM Service Application Config

Preferred file: `<appRoot>/config.yml` under `ai.llmServices`.

```ts
type LLMServiceOptions = {
  name: string;
  title?: string;
  provider: string;
  options?: Record<string, unknown>;
  enabledModels?:
    | string[]
    | null
    | {
        mode: 'recommended' | 'provider' | 'custom';
        models: Array<{
          label: string;
          value: string;
        }>;
      };
  modelOptions?: Record<string, unknown>;
  enabled?: boolean;
  sort?: number;
};
```

Configuration rules:

- `ai.llmServices` defaults to an empty array and is authoritative.
- `name` and `provider` must be non-empty strings; validation rejects the whole snapshot before repository mutation.
- Duplicate names reject the whole snapshot.
- `options` and `modelOptions` preserve provider-specific nested values.
- `${ENV_NAME}` expands recursively after validation. A missing environment variable becomes an empty string.
- Existing repository records preserve `enabled` and `enabledModels`; other definition fields come from config.
- New records use config `enabled` and `enabledModels`, or manager defaults when omitted.
- Additions and updates occur before stale configured names are deleted.

Recommended explicit model configuration:

```yaml
ai:
  llmServices:
    - name: company-openai
      title: Company OpenAI
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
        baseURL: ${OPENAI_BASE_URL}
      enabledModels:
        mode: custom
        models:
          - label: GPT-4.1
            value: gpt-4.1
      modelOptions:
        temperature: 0.3
      enabled: true
      sort: 10
```

After editing `config.yml`, invoke the application config reload mechanism. The live subscription reconciles the new snapshot without a process restart or AI resource rescan.

`enabledModels` modes:

- `recommended`: manager uses the package's recommended model registry.
- `provider`: uses the explicit `models` array supplied for provider-selected models.
- `custom`: uses the explicit `models` array supplied by the App.
- Legacy `string[]`: normalized to `custom` with identical labels/values.
- `null` or omitted: normalized to `recommended`.

## AIManager Shape

```ts
class AIManager {
  toolsManager: ToolsManager;
  skillsManager: SkillsManager;
  employeeManager: AIEmployeeManager;
  mcpServerManager: MCPServerManager;
  llmServiceManager: LLMServiceManager;
  llmProviderManager: LLMProviderManager;
  mcpToolsManager: McpToolsManager;
  features: AIFeatureManager;
}
```

Use the existing `context.deps.ai` instance.

## Manager Return Entities

These are the principal values returned by manager lookups/lists:

```ts
type ToolsEntity<TContext = unknown> = {
  scope: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  execution?: 'frontend' | 'backend';
  requiresContext?: boolean;
  defaultPermission?: 'ASK' | 'ALLOW';
  silence?: boolean;
  introduction?: { title: string; about?: string };
  definition: {
    name: string;
    description: string;
    schema?: any;
  };
  invoke: (
    ctx: TContext,
    args: any,
    runtime: { toolCallId: string; writer: (chunk: any) => void },
  ) => Promise<any>;
};

type SkillsEntity = {
  scope: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  name: string;
  description: string;
  content: string;
  tools?: string[];
  introduction?: { title: string; about?: string };
  sort?: number;
};

type MCPEntity = {
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  restart?: Record<string, any>;
  sort?: number;
};

type LLMServiceEntity = {
  name: string;
  title: string;
  provider: string;
  options: Record<string, unknown>;
  enabledModels: EnabledModelsConfig | string[] | null;
  modelOptions?: Record<string, unknown>;
  enabled: boolean;
  sort: number;
};
```

`AIEmployeeEntity` is broader than `AIEmployeeOptions`. For normal App creation/update, use `registerEmployee(AIEmployeeOptions)` rather than manually constructing the entity.

## Tools Manager Signatures

```ts
interface ToolsFilter<TContext = unknown> {
  scope?: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  defaultPermission?: 'ASK' | 'ALLOW';
  silence?: boolean;
  sessionId?: string;
  ctx?: TContext;
}

interface ToolsManager<TContext = unknown> {
  getTools(
    toolName: string,
    filter?: ToolsFilter<TContext>,
  ): Promise<ToolsEntity<TContext> | undefined>;
  listTools(filter?: ToolsFilter<TContext>): Promise<ToolsEntity<TContext>[]>;
  isToolsExisted(toolName: string): Promise<boolean>;
  unregisterTools(toolName: string | string[]): Promise<number>;
  registerTools(
    options: ToolsOptions<TContext> | ToolsOptions<TContext>[],
  ): Promise<void>;
  registerDynamicTools(
    provider: (
      register: ToolsRegistration<TContext>,
      filter?: ToolsFilter<TContext>,
    ) => Promise<void>,
  ): void;
}
```

`unregisterTools` returns the number of existing tools deleted. Dynamic providers must call the supplied `register.registerTools`; they cannot register nested dynamic providers.

## Skills Manager Signatures

```ts
interface SkillsOptions {
  scope: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  name: string;
  description: string;
  content: string;
  tools?: string[];
  introduction?: { title: string; about?: string };
  from?: string;
}

interface SkillsFilter {
  scope?: 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
  name?: string;
}

interface SkillsManager {
  getSkills(name: string): Promise<SkillsEntity | undefined>;
  getSkills(name: string[]): Promise<SkillsEntity[]>;
  listSkills(filter?: SkillsFilter): Promise<SkillsEntity[]>;
  registerSkills(options: SkillsOptions): Promise<void>;
  deleteSkills(name: string): Promise<void>;
}
```

`listSkills({ name })` performs manager/repository filtering according to the active adapter; use `getSkills` for exact key lookup.

## Employee Manager Signatures

```ts
interface AIEmployeeFilter {
  builtIn?: boolean;
  username?: string;
}

interface AIEmployeeManager {
  getEmployee(username: string): Promise<AIEmployeeEntity | undefined>;
  listEmployees(filter?: AIEmployeeFilter): Promise<AIEmployeeEntity[]>;
  registerEmployee(options: AIEmployeeOptions): Promise<void>;
  upsertEmployee(entry: AIEmployeeEntity): Promise<AIEmployeeEntity>;
  deleteEmployee(username: string): Promise<void>;
}
```

`listEmployees({ username })` performs substring matching. `registerEmployee` is the normal App API. `upsertEmployee` requires a complete entity including `skillSettings`.

## MCP Manager Signatures

```ts
interface MCPFilter {
  name?: string;
  enabled?: boolean;
  transport?: 'stdio' | 'sse' | 'http';
}

type MCPTestResult = {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
  toolsCount?: number;
  tools?: string[];
  toolsTruncated?: boolean;
};

type MCPToolEntry = {
  name: string;
  title: string;
  description?: string;
  serverName: string;
  permission: 'ASK' | 'ALLOW';
};

interface MCPServerManager {
  registerMCP(registration: Record<string, MCPOptions>): Promise<void>;
  getMCP(name: string): Promise<MCPEntity | undefined>;
  listMCP(filter?: MCPFilter): Promise<MCPEntity[]>;
  deleteMCP(name: string): Promise<void>;
  testConnection(options: MCPOptions): Promise<MCPTestResult>;
  rebuildClient(): Promise<void>;
  getClient(): MultiServerMCPClient | null;
  getMCPToolsProvider(): DynamicToolsProvider;
  listMCPTools(): Promise<Record<string, MCPToolEntry[]>>;
  updateMCPToolPermission(
    toolName: string,
    permission: 'ASK' | 'ALLOW',
  ): Promise<void>;
}
```

`registerMCP` input keys are server names. `listMCP({ name })` uses substring matching. `testConnection` requires `command` for `stdio` and `url` for `http`/`sse`.

## LLM Service Manager Signatures

```ts
interface LLMServiceQuery {
  name?: string;
  provider?: string;
  enabled?: boolean;
}

interface LLMServiceManager {
  getLLMService(name: string): Promise<LLMServiceEntity | undefined>;
  listLLMServices(query?: LLMServiceQuery): Promise<LLMServiceEntity[]>;
  registerLLMService(
    options: LLMServiceOptions,
    behavior?: { preserveUserState?: boolean },
  ): Promise<LLMServiceEntity>;
  deleteLLMService(name: string): Promise<void>;
}
```

`preserveUserState: true` preserves an existing service's `enabled` and `enabledModels`. `listLLMServices({ name })` performs substring matching.

## LLM Provider Manager Signatures

```ts
enum SupportedModel {
  LLM = 'LLM',
  EMBEDDING = 'EMBEDDING',
}

type LLMModelOptions = {
  llmService: string;
  model: string;
  webSearch?: boolean;
  reasoning?: {
    mode: 'default' | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  };
};

type LLMProviderMeta = {
  title: string;
  supportedModel?: SupportedModel[];
  models?: Partial<Record<SupportedModel, string[]>>;
  provider: new (options: LLMProviderOptions) => LLMProvider;
  embedding?: new (options: EmbeddingProviderOptions) => EmbeddingProvider;
  supportWebSearch?: boolean;
  webSearchModels?: string[];
};
```

Manager functions:

```ts
registerLLMProvider(name: string, meta: LLMProviderMeta): void;
listLLMProviders(): Array<{
  name: string;
  title: string;
  supportedModel: SupportedModel[];
  supportWebSearch: boolean;
  webSearchModels?: string[];
  recommendedModels: Array<{ label: string; value: string }>;
}>;
getSupportedProvider(model: SupportedModel): string[];
listAllEnabledModels(): Promise<Array<{
  llmService: string;
  llmServiceTitle: string;
  provider: string;
  providerTitle?: string;
  enabledModels: Array<{ label: string; value: string }>;
  supportWebSearch: boolean;
  webSearchModels?: string[];
  isToolConflict: boolean;
}>>;
resolveModel(model?: LLMModelOptions | null): Promise<LLMModelOptions>;
createEmbedding(options: LLMModelOptions): Promise<EmbeddingsInterface>;
getLLMService(options: LLMModelOptions): Promise<{
  provider: LLMProvider;
  model: string;
  service: LLMServiceEntity;
}>;
```

Important errors:

- Missing `llmService` or `model` → `LLM service not configured`.
- Unknown service → `LLM service not found`.
- Unknown provider key → `LLM service provider not found`.
- Unsupported web search model → an error naming that model.
- Embedding without an embedding constructor → provider does not support embeddings.

## Custom Provider Base Signatures

```ts
interface LLMProviderOptions {
  serviceOptions?: Record<string, any>;
  modelOptions?: Record<string, any>;
}

type LLMProviderInvokeOptions = {
  modelKwargs?: Record<string, any>;
  modelRequestParams?: Record<string, any>;
  [key: string]: any;
};

abstract class LLMProvider {
  serviceOptions: Record<string, any>;
  modelOptions: Record<string, any> | undefined;
  chatModel: any;

  constructor(options: LLMProviderOptions);
  abstract createModel(): BaseChatModel | any;
  get baseURL(): string | null;

  prepareChain(context: AIChatContext): any;
  invoke(
    context: AIChatContext,
    options?: LLMProviderInvokeOptions,
  ): Promise<any>;
  stream(context: AIChatContext, options?: any): Promise<any>;
  listModels(): Promise<{
    models?: Array<{ id: string }>;
    code?: number;
    errMsg?: string;
  }>;
  parseResponseMessage(message: any): any;
  parseResponseChunk(chunk: any): any;
  parseAttachment(
    attachment: AIFileAttachment,
    runtime: {
      fileStorage: FileStorage;
      documentLoader: {
        load(
          attachment: AIFileAttachment,
          options?: Record<string, unknown>,
        ): Promise<{ supported: boolean; text: string }>;
      };
      caching?: Caching;
      getHeader?(name: string): string | undefined;
    },
  ): Promise<{ placement: string; content: any }>;
  testFlight(): Promise<{
    status: 'success' | 'error';
    code: number;
    message?: string;
  }>;
  isToolConflict(): boolean;
  resolveTools(toolDefinitions: any[]): any[];
  parseWebSearchAction(
    chunk: AIMessageChunk,
  ): Array<{ type: string; query: string }>;
  parseReasoningContent(
    chunk: AIMessageChunk,
  ): { status: string; content: string } | null;
  parseResponseMetadata(output: LLMResult): any;
  parseResponseError(error: any): any;
}
```

Provider constructor behavior:

- `serviceOptions` defaults to `{}` and configured `baseURL` is normalized/validated.
- `modelOptions` may be absent. `createModel()` is called by the base constructor only when `modelOptions` is supplied.
- Internal `_reasoning` is removed from public `modelOptions` and retained separately by the base class.
- Provider metadata listing may construct the class with `{}`; never require an API key/model in field initializers or the constructor itself.

Embedding contract:

```ts
interface EmbeddingProviderOptions {
  serviceOptions?: Record<string, any>;
  modelOptions?: Record<string, any>;
}

abstract class EmbeddingProvider {
  constructor(options: EmbeddingProviderOptions);
  abstract createEmbedding(): EmbeddingsInterface;
  protected abstract getDefaultUrl(): string;
  protected get apiKey(): string;
  protected get baseURL(): string;
  protected get model(): string;
}
```

The embedding getters throw when `apiKey`, URL, or model is missing.

## MCP Action Tool Manager Signatures

```ts
type McpTool = {
  name: string;
  description: string;
  inputSchema?: any;
  resourceName?: string;
  actionName?: string;
  path?: string;
  method?: string;
  call: (
    args: Record<string, any>,
    context?: {
      token?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
  ) => Promise<any>;
};
```

Functions:

```ts
registerTools(tools: McpTool[]): void;
registerToolResultPostProcessor(
  resourceName: string,
  actionName: string,
  processor: (
    result: any,
    context: {
      tool: McpTool;
      args: Record<string, any>;
      callContext?: McpToolCallContext;
      response?: {
        statusCode?: number;
        headers?: Record<string, any>;
        body?: any;
      };
    },
  ) => any | Promise<any>,
): void;
postProcessToolResult(
  tool: McpTool,
  result: any,
  context: Omit<McpToolResultPostProcessorContext, 'tool'>,
): Promise<any>;
listTools(): McpTool[];
getTool(name: string): McpTool | undefined;
```

Postprocessors run sequentially in registration order and only run when the tool has both `resourceName` and `actionName`.

## Feature Manager Signatures

```ts
interface AIFeatureManager {
  enableFeatures(features: Partial<AIFeatures>): void;
  disableFeatures(features: Array<keyof AIFeatures>): void;
  isFeaturesEnabled(features: Array<keyof AIFeatures>): boolean;
  readonly vectorDatabase: VectorDatabaseFeature;
  readonly vectorDatabaseProvider: VectorDatabaseProviderFeature;
  readonly vectorStoreProvider: VectorStoreProviderFeature;
  readonly knowledgeBase: KnowledgeBaseFeature;
}
```

Feature keys are:

```ts
EEFeatures.vectorDatabase;
EEFeatures.vectorDatabaseProvider;
EEFeatures.vectorStoreProvider;
EEFeatures.knowledgeBase;
```

A typed feature getter throws `<featureName> is not supported` when not enabled. Check `isFeaturesEnabled` first for optional capabilities.

## AgentContext Shape

Use this as the default tool context only when the App AI runtime supplies it:

```ts
interface AgentContext<TRepositories = unknown, TServices = unknown> {
  ai: AIManager;
  database: DatabaseManager;
  logger: Logger;
  repositories: TRepositories;
  services: TServices;
  state: {
    sessionId?: string;
    messageId?: string;
    messages?: AIMessageInput[];
    model?: Record<string, unknown>;
    webSearch?: boolean;
    important?: string;
    frontendTools?: unknown[];
    toolCallResults?: Array<{ id: string; result: unknown }>;
    timezone?: string;
  };
  actor: {
    id: string | number;
    roles: string[];
    isRoot: boolean;
    locale?: string;
  };
  translate?: (key: string, options?: Record<string, unknown>) => string;
}
```

Do not assume optional state fields exist. Check them before use.

## Common Parameter Errors

- Writing `general` instead of `GENERAL` for scope.
- Writing `allow` instead of `ALLOW` for permission.
- Using `streamable-http`; the accepted MCP value is `http`.
- Passing MCP registration as a single `MCPOptions` object instead of `{ [serverName]: options }`.
- Omitting `command` for `stdio` or `url` for `http`/`sse`.
- Using employee tool strings instead of `{ name, autoCall? }` objects.
- Pointing employee `skills` at a path instead of the registered skill `name`.
- Making an employee-local skill directory differ from frontmatter `name`.
- Assuming `definition.name` controls a filesystem-loaded tool key; the file/directory controls it.
- Using an LLM service provider title instead of the provider registry key.
- Treating `config.yml` `ai.llmServices` as a partial patch; it is an authoritative replacement configuration when successfully loaded.
- Omitting required `name` or `provider` from an LLM service entry.
- Expecting a plugin's async bootstrap return value to be awaited.
- Calling a feature getter without checking that the feature is enabled.
