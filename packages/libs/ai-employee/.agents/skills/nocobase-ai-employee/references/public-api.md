# Application-Facing Public API

## Contents

- [Import Rule](#import-rule)
- [Resource Helpers](#resource-helpers)
- [Shared Manager Type](#shared-manager-type)
- [Manager Contracts](#manager-contracts)
- [Provider Contracts](#provider-contracts)
- [Feature and File Ports](#feature-and-file-ports)
- [Domain Types and Utilities](#domain-types-and-utilities)
- [APIs Applications Usually Should Not Call](#apis-applications-usually-should-not-call)

## Import Rule

Application and plugin code imports from the package root. For exact property types, required fields, callback signatures, return types, defaults, and error cases, use [Exact Application Contracts](application-contracts.md) as the authoritative self-contained reference:

```ts
import {
  defineAIEmployee,
  defineMCP,
  defineTools,
  type AIManager,
} from '@nocobase/ai-employee';
```

Do not import `src/...`, `dist/...`, or private implementation files. The npm package intentionally exposes only its root entry and `package.json`.

## Resource Helpers

Use typed identity helpers in App `ai/` modules:

- `defineTools<TContext>(options)`: defines a backend/frontend tool contract.
- `defineMCP(options)`: defines an MCP server connection.
- `defineAIEmployee(options)`: defines an AI employee.

Example:

```ts
import { defineAIEmployee } from '@nocobase/ai-employee';

export default defineAIEmployee({
  username: 'support-agent',
  nickname: 'Support Agent',
  skills: ['support-policy'],
  tools: [{ name: 'lookup-ticket', autoCall: true }],
});
```

Skills use `SKILLS.md`. Declarative LLM services use the application plugin's exported `aiEmployeeConfig` contract at `config.yml` `ai.llmServices`; the framework-neutral core package intentionally has no config-definition helper.

## Shared Manager Type

Use `AIManager` to type an App plugin dependency:

```ts
interface PluginDeps {
  ai: AIManager;
}
```

The application-created aggregate exposes:

- `toolsManager`
- `skillsManager`
- `employeeManager`
- `mcpServerManager`
- `llmServiceManager`
- `llmProviderManager`
- `mcpToolsManager`
- `features`

Applications normally consume these managers through `context.deps.ai`.

## Manager Contracts

### Tools

Useful exports:

- `ToolsManager`
- `ToolsOptions<TContext>`
- `ToolsFilter<TContext>`
- `DynamicToolsProvider<TContext>`
- `ToolsRuntime`
- `Scope`, `Permission`, `From`

Use for static manager registration, contextual dynamic tools, listing, lookup, and removal.

### Skills

- `SkillsManager`
- `SkillsOptions`
- `SkillsFilter`
- `SkillsScope`

Use when skills must be computed or registered by a plugin instead of loaded from Markdown.

### Employees

- `AIEmployeeManager`
- `AIEmployeeOptions`
- `AIEmployeeFilter`
- `AIEmployeeEntity`
- `AIEmployeeToolSetting`

Use `registerEmployee` for definition-style registration and `upsertEmployee` only when the App owns a complete persisted entity.

### MCP

- `MCPServerManager`
- `MCPOptions`
- `MCPFilter`
- `MCPTestResult`
- `MCPToolEntry`

Use for runtime connection registration, testing, rebuilding, listing tools, and tool permission changes.

### LLM services

- `LLMServiceManager`
- `LLMServiceOptions`
- `LLMServiceQuery`
- enabled-model configuration types

Use when a service must be registered programmatically instead of through `config.yml` `ai.llmServices`.

### LLM providers

- `LLMProviderManager`
- `LLMProviderMeta`
- `SupportedModel`
- `LLMModelOptions`
- enabled service/model types

Use for application-specific provider registration, service/model resolution, and embeddings.

### MCP action tools

- `McpToolsManager`
- `McpTool`
- `McpToolCallContext`
- result postprocessor types

This registry is distinct from remote MCP server management. Use it for application/API action descriptors and ordered result postprocessing.

## Provider Contracts

For a custom backend use:

- `LLMProvider`, `LLMProviderOptions`
- `EmbeddingProvider`, `EmbeddingProviderOptions`
- `LLMProviderMeta`, `SupportedModel`
- reasoning and attachment-related types when needed

The package also root-exports its built-in provider classes and metadata. An App may reuse them, but should not fork or modify them for one application.

## Feature and File Ports

Application integration plugins may use:

- `AIFeatureManager`, `AIFeatures`, `EEFeatures`
- knowledge base and vector feature interfaces
- `FileMetadata`, `FileMetadataRepository`, `FileStorage`, `FileStorageFactory`
- `DriveFileStorage`, `DriveFileStorageFactory`, `fileStorageFactoryToken`
- document loader contracts

These are useful when an App plugin contributes an optional capability to the shared AI runtime.

## Domain Types and Utilities

Application code may import framework-neutral types for:

- `AgentContext`
- AI messages and conversations
- file attachments
- employee entities
- knowledge base data
- tool building and response parsing

Prefer the smallest public type needed by the App code.

## APIs Applications Usually Should Not Call

The package also exports low-level factories, loaders, repositories, memory adapters, and scanners. They are public for framework integrations and standalone consumers, but a normal generated App should let its enabled AI employee application plugin own them.

Do not normally call these from application customization:

- `createAIManager` or `new AIManager(...)`
- `AIEmployeeLoader`, `ToolsLoader`, `SkillsLoader`, `MCPLoader`
- repository switch methods
- `MemoryRepositoryFactory`
- directory scanners

Use App resources and the existing `deps.ai` aggregate instead. Call low-level APIs only when deliberately replacing the generated App's integration architecture.
