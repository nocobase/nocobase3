# @nocobase/ai-employee

## 0.2.0-beta.8

### Minor Changes

- c2aceaa: Give an agent execution one state, one context and a result contract

  **Breaking.** An agent execution is now described once and reached through public types:

  - **One `AgentState`.** `parseAgentState()` builds it where the request body is parsed, and it reaches `createAIEmployee()` whole. `sessionId` is required, `model` is `{ llmService, model }`, and `messages` is `handoffMessages`, the message a sub-agent receives when the user answers its pending question with a new turn. `AgentServiceFactory` replaces `model` once, against the employee's own policy, and `SubAgentsDispatcher` replaces `sessionId` for a sub-agent's own conversation. `AgentRequest` keeps only what varies per call — `userMessages`, `userDecisions`, `messageId`, `writer`, `signal`, and `runtime` for middleware data — so a request can no longer ask for a model the employee does not allow.
  - **One `AgentContext`**: `actor`, `state`, `deps`, `runtime` (the host's `logger`, `translate` and `getHeader`) and `availableSkills`. `ai`, `database`, `repositories` and `services` are gone. A tool declares the container tokens it needs in `dependencies` and reads them, resolved and typed, from `ctx.deps`; a token the container cannot resolve fails the run naming the tool and the token. The context is bound when a tool is built, so an `agentContext` key on a request reaches nothing. The data tools declare an authorized, read-only reader rather than the database.
  - **Required identity.** `CreateEmployeeOptions` and `CreateAgentOptions` require `actor` and `runtime`, and `createAgent()` requires `sessionId`; neither fills in an implicit root any more. `CreateEmployeeOptions.tools`, which nothing could fill, is removed: an employee's tools come from its own `skillSettings`, narrowed by the conversation's `skillSettings`.
  - **A result contract.** `invoke()`, `resumeInvoke()` and `forkInvoke()` return `AgentInvokeResult`: the assistant turn as `message` in this package's `AIMessageInput` shape, or `null`; `structuredResponse` when the request passes a Zod `responseFormat`; and `interrupt: { id, actions }` when a tool paused the run for approval. An interrupted `invoke()` records the paused calls as `stream()` does, so a decision can be attached to them and the run resumed with `interrupt.id`.
  - **A conversation to run in.** `AIConversationsManager.create()` resolves to `CreatedAIConversation`, whose `sessionId` is a `string`.
  - **Exports.** `AgentRequest`, `AgentInvokeRequest`, `AgentInvokeResult`, `AgentInvokeInterrupt`, `AgentInterruptAction`, `AgentStreamEvent` and `CreatedAIConversation` are exported from `@nocobase/app-plugin-ai-employee/server`.

  Migrating: pass `state` and `runtime` to `createAIEmployee()` instead of `sessionId`, `webSearch`, `frontendTools` or `execution`; read `ctx.runtime.logger` rather than `ctx.logger`, and `ctx.state.handoffMessages` rather than `ctx.state.messages`; declare a token in `dependencies` wherever a tool read `ctx.ai`, `ctx.database`, `ctx.repositories` or `ctx.services`; pass the bound context as `buildTool(entity, ctx)`'s second argument; read `result.message` rather than `result.messages`; and pass an `actor` everywhere one was left out.

- c2aceaa: Keep LLM services, provider model lists and an employee's model limits consistent

  - **`overrideEnabledModels`.** A configured LLM service kept the `enabledModels` stored in the database once it existed, so a model list in `config.yml` took effect only when the service was first created, and a service created without one stayed at zero models whatever was added later. A service that sets `overrideEnabledModels: true` has its configured list reapplied on every load; edits made in AI settings are then overwritten. It governs the list alone: a service an administrator disabled stays disabled even when its entry says `enabled: true`. It defaults to `false`.
  - **What `enabledModels` constrains.** It scopes the model selector, `ai:listAllEnabledModels` and the model `resolveModel()` falls back to; a caller that names a model is not checked against it. The documentation now says so, and `ModelService` loses `requireModel()`, an unreachable check that suggested otherwise.
  - **An employee's own models.** For an employee with its own model settings, the chat offers only the models it lists that are currently enabled, in its order, opens on the first, and sends the one it shows; the server runs no other. When none of them is enabled, the chat offers no model and cannot send, and the server rejects the run with a `CONFIGURATION_ERROR` rather than falling back to another model. Installed copies of the `nocobase-ai` Registry item get the chat half by updating.
  - **Breaking: provider model lists.** `LLMProviderMeta.models` is typed for embedding model suggestions alone, and `ai:listModels` answers only `model=EMBEDDING`. Chat models are listed from each provider's own API through `ai:listProviderModels`, and the hard-coded chat model lists nothing read are removed, as is the Tongyi provider, which was commented out and exported nothing.

- c2aceaa: Fix attachments, direct provider calls, and web search on a provider that cannot search

  - **Attachments.** DeepSeek received no images, and a user dropping a screenshot was told the type is unsupported; images now go to the model as content blocks. Ollama failed the whole turn on a PDF; it now sends images as content blocks and documents through the document loader. An uploaded file kept only the ASCII characters of its name, so `客户截图.png` was stored as `.png`, and once a message was sent its attachments came back from history with no preview address, so an image showed as a plain file; `DriveFileStorage` now stores the name as given, minus any directory part, while only the storage key is reduced to safe characters, and history gives every stored attachment the preview address its upload returned.
  - **Web search that cannot search.** `subAgentWebSearch` asked for built-in search and invoked the model even on a provider that ignores the request, which then answered from training data with sources that looked real, reported as success. It now checks `supportWebSearch` and `webSearchModels` first, and returns an error naming what did not happen and what to use instead.
  - **Tools on a direct call.** `LLMProvider.prepareChain()` — and so `invoke()` and `stream()` — built `context.tools` with each tool's position in the list where its context belongs, and never resolved its `dependencies`. `AIChatContext` gains an optional `toolContext` (`{ agentContext, container? }`), and tools are built with the new `buildAgentTools()`, giving each the context and resolved `deps` an agent does; `createToolContext()` and `ToolRuntimeContext` are exported beside it, and the plugin's agents use the same function. Without `toolContext` a tool that requires a context fails when called. Built-in web search is meant for a call without tools: passing both now logs a warning, and binding is otherwise unchanged.
  - **Breaking (types only).** `AIChatContext.systemPrompt`, `decisions` and `middleware`, which a provider never read, are removed, and so is the unused `AIChatContextOptions`. A direct call's system prompt is a `role: 'system'` message at the start of `messages`; a paused run is resumed through `AgentService.resumeInvoke()`.

### Patch Changes

- c2aceaa: Make MCP servers configurable only in `config.yml`, and keep their state

  - **Environment references.** `${NAME}` in `ai.mcpServers` — `headers`, `args`, `env` and `url` — was sent to the server literally; it is now expanded as it is for LLM services, and a missing variable becomes an empty string.
  - **Persistent state.** The enable switch and tool permissions set in AI settings reset at every start. Servers are now stored in `aiMcpClients`: `enabled` in `config.yml` applies when a server is first created and the switch is the administrator's after that, and tool permissions are saved on the server's row in a new `toolPermissions` column, added by a migration. Both belong to the server's name, so removing or renaming a server in `config.yml` discards them. The row holds the configuration with every `${NAME}` expanded, so a credential in `headers` or `env` is stored in plain text and is part of database backups.
  - **An unreachable server.** One server that did not answer stopped the application from starting. It is now skipped with a warning naming it, whose reason reduces any URL to its origin, and the other servers keep their tools. Nothing retries until the client is rebuilt — at start, or when a server is switched on or off.
  - **Unknown tools.** Setting the permission of a tool no connected server exposes answered success and kept nothing; `aiMcpServers:updateToolPermission` now answers 404, and `MCPServerManager.updateMCPToolPermission()` throws.
  - **Breaking:** `AIResourceRegistrarOptions.mcpDirectory` and the protected `AIResourceRegistrar.loadMCP()` are removed, since the configuration sync deleted any server registered that way on its next run. Move such servers into `config.yml`. `registerAIResources()` runs tools, then Skills, then employees.

## 0.2.0-beta.7

### Patch Changes

- ff158aa: Replace the legacy translation marker in the commented Tongyi provider metadata example with a plain English title to match the v3 metadata contract.
- ff158aa: Add employee skill enable switches backed by an optional `skillSettings.enabledSkills` allowlist. Omitted or null selections retain inherited GENERAL and registered skills, while an empty list disables every skill. Preserve explicit selections across built-in registration and repository reloads, intersect session restrictions, and reject unavailable skill content and persisted tool activations. Existing skill and tool settings remain compatible without a database migration.
- ff158aa: Add persistent employee tool selection with legacy inheritance for omitted or null selections and explicit disabling with an empty selection. Apply selections to discovered, injected, and skill-activated tools without allowing session settings to broaden access, preserve saved custom tool approval settings across registration and restart independently of explicit tool selections, and retain unknown saved names for future registrations. Selected optional tools still require their runtime capabilities, including current-user knowledge-base access.
- ff158aa: Support package-owned i18n metadata for Tools and Skills, preserving English source text for model execution while translating display titles, Tool introductions, and Skill descriptions. Localize built-in resources in English and Chinese, sort catalogs by localized titles in the current locale with stable name tie-breakers, and document Client locale ownership and exact source-text keys.

## 0.2.0-beta.6

### Patch Changes

- 028dd7c: Use host-provided peers for shared database types, authorization errors, service tokens, cache registries, and repository filter metadata. Declare their production providers in all application templates so deployments with automatic peer installation disabled retain the required runtime packages. Document the provider contract for generated plugins.

  Existing applications upgrading these packages must add compatible versions of their required shared peers to production dependencies: @nocobase/db, @nocobase/service-provider, @nocobase/repository-input, @nocobase/authorization, @nocobase/caching, @nocobase/i18n, and @nocobase/queue for the standard server stack, plus @nocobase/ai-employee when using its plugin. Update the lockfile and verify the production install; peer declarations do not remove incompatible historical versions automatically.

- Updated dependencies [028dd7c]
  - @nocobase/db@1.0.0-beta.8

## 0.2.0-beta.5

### Patch Changes

- e067113: Depend on one zod major, so a deployment can resolve better-auth

  An application that installed both the AI employee plugin and the API keys plugin failed to start with `z.ipv4 is not a function`, thrown while loading `@better-auth/core`. Nothing in better-auth was wrong: the AI employee packages asked for `zod: ^3` while better-auth asks for `^4`, and a deployment installs `dist/` with `nodeLinker: hoisted`, where one version of a package takes the root slot and the rest are nested underneath whoever depends on them. zod 3 won the root, which forced better-auth's whole subtree to be nested, and a `@better-auth/core` that ended up next to the root zod bound to the wrong major.

  The same collision has a second failure mode that is harder to read. `@better-auth/api-key` declares `@better-auth/core`, `better-call`, `jose`, `kysely` and `nanostores` as peer dependencies, and a deployment sets `autoInstallPeers: false` so it installs none of them. It works anyway when better-auth's dependencies hoist to the root, because the peers are then sitting where the resolver looks; it stops working the moment the zod conflict pushes them down into `node_modules/better-auth/node_modules`, and the application fails with `Cannot find package '@better-auth/core'`.

  So the fix is not to declare better-auth's internals somewhere. `@nocobase/ai-employee` never imported zod at all and no longer declares it, `@nocobase/app-plugin-ai-employee` moves to zod 4, and all three templates and the plugin now take it from the `zod` catalog entry, so one version is what an application gets. Its schemas use `z.object`, `z.string`, `z.number`, `z.array`, `z.record`, `z.coerce`, `z.any` and `z.unknown`, all of which carry over unchanged; `buildStandardAgentMiddleware` gained an explicit `AgentMiddleware[]` return type, which the new resolution made necessary.

  A deployment tree now holds a single `zod` and a single `@better-auth/core`, hoisted to the root where `@better-auth/api-key` resolves them.

- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [a60decd]
- Updated dependencies [1c70f60]
- Updated dependencies [63db898]
  - @nocobase/db@1.0.0-beta.7

## 0.2.0-beta.4

### Minor Changes

- c8f8a93: Encapsulate conversation thread reads and updates in AIChatConversation while preserving transactional message persistence.

### Patch Changes

- d566dde: Add a read-only MCP settings page backed by declarative `config.yml` configuration, with connection testing and tool inspection.
- d566dde: Register AI Employees and Tools explicitly from server-side resource aggregators, and load plugin and configured Skills from `SKILL.md` directories.
- 28132fd: Forward web search selections, complete execution context for AI employee tools, and recognize DeepSeek's `deepseek-flash` model as web-search capable.
- c8f8a93: Remove the empty recommended-model mechanism and use explicit provider or custom model configuration.
- c8f8a93: Refactor AI employee execution around an execution-scoped `DiscoveredTools` result, request-selected LLM models, and a simplified system prompt contract.
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [590861e]
- Updated dependencies [e11b855]
- Updated dependencies [72ed008]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [e11b855]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [590861e]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
  - @nocobase/db@1.0.0-beta.5
  - @nocobase/logging@0.1.0-beta.4

## 0.2.0-beta.3

### Patch Changes

- dc517b1: Restore AI knowledge-base cleanup and vectorization parity by removing document and shard objects with their database records, deleting vectors with the correct knowledge-base and document selectors, persisting segment edits and deletions back to shard files, tracking segment revisions during rebuilds, and allowing stale queue jobs to exit safely.

## 0.2.0-beta.2

### Patch Changes

- 8b18b47: Fixed knowledge-base document uploads in ESM applications, made parsed-document cache paths filesystem-safe, corrected embedding-model API requests and database boolean handling, and prevented non-image chat attachments from rendering as broken image previews.

## 0.2.0-beta.1

### Minor Changes

- 8d88ff4: Replace the public AI Employee LLM service filesystem loader with the application `config.yml` contract at `ai.llmServices`. Configured model entries use a simple label/value array and are converted internally to custom mode. The App plugin validates and synchronizes declarative service definitions at startup and on application-config reload while preserving repository-managed enabled state for matching services. The default App template includes a commented configuration example, and the App config validator supports unique object properties for rejecting duplicate service names.
- 81c6d6d: Replace the temporary AI file manager with metadata-aware, drive-backed file storage factories, configurable storage disks, and per-domain metadata repositories.

## 0.1.1-beta.0

### Patch Changes

- Updated dependencies [174eab5]
  - @nocobase/db@1.0.0-beta.2

## 0.1.0

### Minor Changes

- Refactor AI Employee into a framework-neutral core runtime with reusable managers, loaders, providers, contracts, repositories, and file managers.
- Remove application-specific and redundant `Runtime*` public types, and expose the native `@nocobase/caching` and `@nocobase/logging` types from Core APIs instead.

### Patch Changes

- Remove the obsolete document manager, its public API, and the direct FlexSearch dependency.
