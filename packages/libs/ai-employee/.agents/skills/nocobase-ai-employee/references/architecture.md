# App Integration and Structure

## Contents

- [Application Perspective](#application-perspective)
- [App Locations](#app-locations)
- [Three Extension Paths](#three-extension-paths)
- [Shared `deps.ai`](#shared-depsai)
- [AI Plugin Initialization](#ai-plugin-initialization)
- [Ownership Rules](#ownership-rules)
- [Validation](#validation)

## Application Perspective

This skill assumes the coding agent is working inside an App source directory created through the public quickstart:

```bash
pnpm create @nocobase/app crm
cd crm
pnpm install
```

The directory containing the generated `package.json`, `client/`, and `server/` is `<appRoot>`. Do not require the user to know which internal package or template produced it.

Before making AI changes, inspect the generated App and confirm:

- `@nocobase/ai-employee` is available to application/server plugin code;
- the AI employee application plugin is enabled in the App configuration;
- the App exposes one shared `AIManager` through `context.deps.ai`.

Treat `@nocobase/ai-employee` as a public dependency. Extend the application through resource files and enabled plugins rather than editing dependency source.

## App Locations

| Application path                          | Purpose                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `package.json`                            | Declares the dependency and enables `@nocobase/app-plugin-ai-employee`.                                            |
| `config.yml` → `ai.llmServices`           | Sole declarative LLM-service source; authoritative and live-reloadable.                                            |
| `ai/`                                     | App-owned declarative employees, tools, skills, and MCP resource layer.                                            |
| `server/runtime/deps.ts`                  | Creates and exposes the shared `deps.ai` aggregate. Infrastructure reference, not the default customization point. |
| `server/plugins/`                         | Resolves enabled plugins and invokes their `server/bootstrap.ts`. Infrastructure reference.                        |
| an enabled plugin's `server/bootstrap.ts` | Preferred owner for executable AI registration and custom providers.                                               |
| `tests/`                                  | App-level logic and integration coverage.                                                                          |
| `e2e/`                                    | Browser/runtime acceptance tests when the feature needs them.                                                      |

## Three Extension Paths

### 1. App declarative configuration and resources

Use `config.yml` `ai.llmServices` for declarative LLM services. Use `ai/` only for employees, tools, skills, and MCP definitions. After editing LLM configuration, invoke application config reload; no process restart or resource rescan is required.

The App resource path is simple, declarative, and automatically loaded by the enabled AI employee plugin.

### 2. Enabled App plugin bootstrap

Use for executable logic:

- dynamic/context-sensitive tools;
- resources computed from another application service;
- custom LLM provider registration;
- feature-port registration;
- lifecycle-dependent MCP or manager changes.

The generated App discovers `server/bootstrap.ts` in enabled plugin packages. Bootstrap receives `context.deps`, including the shared `ai` aggregate.

### 3. AI plugin/client facade

Use the enabled AI employee App plugin and generated client integration for chat UI, routes, request context, persistence, and HTTP services. `@nocobase/ai-employee` supplies framework-neutral contracts and managers; it is not by itself the full App UI/API feature.

## Shared `deps.ai`

The generated App's server runtime constructs the application aggregate once. The implementation is infrastructure to inspect when necessary, not an application customization point:

```ts
const ai = createAIManager(aiLogger);
return { ai /* other App dependencies */ };
```

An App plugin consumes that same instance:

```ts
import type { AppPluginServerContext } from '@nocobase/app-server/plugins';
import type { AIManager } from '@nocobase/ai-employee';

type PluginDeps = {
  ai: AIManager;
};

export default function bootstrap(
  context: AppPluginServerContext<PluginDeps>,
): void {
  const { ai } = context.deps;
  // Register application behavior here.
}
```

Never call `createAIManager()` inside a plugin just to register App behavior. That creates a disconnected manager aggregate.

## AI Plugin Initialization

The enabled `@nocobase/app-plugin-ai-employee` provider initializes persistence, configuration synchronization, and resource loading. Its runtime:

1. subscribes to the `ai` application-config namespace;
2. synchronizes the initial `ai.llmServices` snapshot before switching to database persistence;
3. loads package-owned defaults and the App's `ai/` employee/tool/skill/MCP extension layer;
4. serializes later config-reload synchronizations against the active database repository;
5. exposes request/runtime services through the App plugin.

Application code should rely on these extension points instead of reproducing the initialization pipeline.

## Ownership Rules

- App-specific static resource → `<appRoot>/ai/`.
- App-specific executable behavior → an enabled App plugin.
- Shared UI/API integration → `@nocobase/app-plugin-ai-employee` surfaces.
- Credentials → environment/configuration, never source.
- Changes needed by every consumer → separate dependency-package task, outside this skill's default scope.

## Validation

Inspect `<appRoot>/package.json` and run the validation scripts it declares. A generated App commonly supports commands such as:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do not assume every script exists; run the available equivalents. Also validate every enabled App plugin modified to register AI behavior. Use `pnpm dev` for local runtime verification, matching the public App quickstart.
