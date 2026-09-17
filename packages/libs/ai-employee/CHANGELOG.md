# @nocobase/ai-employee

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
