# App Source Map

Where each piece of AI work goes in a CLI-created App, and what to read before choosing an extension point.

## Table of contents

- [Identify the App root](#identify-the-app-root)
- [App AI resources](#app-ai-resources)
- [App frontend](#app-frontend)
- [App server](#app-server)
- [The installed dependency](#the-installed-dependency)
- [Tests and validation](#tests-and-validation)

## Identify the App root

```bash
pnpm create @nocobase/app my-app
cd my-app
pnpm install
```

The current directory is the App root when it holds `client/`, `server/`, and `package.json`. Work relative to it, and do not require the user to know which npm template generated it.

Read these App-local files when present, before writing anything:

- `README.md` — setup and development notes.
- `AGENTS.md` — App-specific coding rules; they outrank this Skill's defaults.
- `package.json` — dependencies and scripts. Plugin registration is in `server/plugins.ts` and `client/plugins.ts`, not here.
- `config.yml` — the `ai` block; see [capabilities.md](capabilities.md#llm-services-configyml).
- `.env` and `.gitignore` — confirm secrets are ignored before adding a variable.
- `ai/README.md` — the AI resource layer and its build behavior.
- `client/extensions/nocobase-ai/README.md` — the installed AI frontend. Its absence means the Registry item is not installed yet, not that the App cannot have AI UI.

## App AI resources

| Path                                  | Holds                                                           |
| ------------------------------------- | --------------------------------------------------------------- |
| `config.yml` `ai.llmServices`         | LLM services, with `${NAME}` environment placeholders           |
| `config.yml` `ai.mcpServers`          | MCP connections — the only place they can be configured         |
| `config.yml` `ai.aiEmployee.storage`  | the disk chat attachments are written to                        |
| `config.yml` `ai.skills.paths`        | extra Skill directories beyond the App root's `ai/skills`       |
| `server/ai/employees/<name>/index.ts` | one `defineAIEmployee()` with an inline `systemPrompt`          |
| `server/ai/tools/<name>.ts`           | one `defineTools()` backend tool                                |
| `server/ai/index.ts`                  | static imports, aggregated by an `AIResourceRegistrar` subclass |
| `server/providers/ai-resources.ts`    | the `ServiceProvider` that calls `registerAIResources()`        |
| `ai/skills/<name>/SKILL.md`           | one Skill; it names tools, and defines none                     |

The application build copies the Markdown under `ai/skills` into `dist/ai/skills`, which is where a deployed server looks — it resolves the application root from `dist/server`. That covers a Skill's `references/` pages as well as its `SKILL.md`; nothing else in the directory is copied, because tools are registered in code and a Skill only names them. A directory listed in `ai.skills.paths` is not copied, so point those at a path the deployment itself provides.

There is no filesystem scan for employees or tools, and no employee-local prompt, skill, or tool auto-binding. See [capabilities.md § Where each resource is registered](capabilities.md#where-each-resource-is-registered) and [server-runs.md § Register App resources](server-runs.md#register-app-resources).

## App frontend

App source lives under `client/`. The usual extension points are `client/routes.ts`, `client/providers.ts`, `client/pages/`, `client/locales/`, and the installed `client/extensions/nocobase-ai/`.

Inside the extension, the files worth opening:

| Path                                                                           | What it is                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `index.ts`                                                                     | the export surface                                               |
| `components/ai-root-provider.tsx`                                              | `NocoBaseAIRootProvider`, the composition of the three providers |
| `providers/ai-provider.tsx`                                                    | discovery, transport, invokers                                   |
| `providers/ai-context.ts`                                                      | the `useAI()` contract, including the readiness fields           |
| `providers/chat-transport.ts`                                                  | requests and the SSE transport                                   |
| `providers/page-context.tsx`, `page-context-store.ts`, `page-context-utils.ts` | context scopes and tool/form allowlists                          |
| `providers/frontend-tool-registry.ts`                                          | browser tool registration and execution                          |
| `providers/form-registry.ts`                                                   | form validation and filling                                      |
| `services/types.ts`                                                            | the `AIService` contract                                         |
| `services/nocobase-ai-service.ts`                                              | the `/api/ai` adapter                                            |
| `components/chat/`                                                             | the chat UI, composer, attachments                               |
| `components/surfaces/`                                                         | inline, page, dialog, side-panel containers                      |
| `components/page-elements/`                                                    | page-element and form hooks                                      |
| `components/tools/`                                                            | tool result renderers                                            |
| `adapters/react-hook-form.ts`                                                  | `applyReactHookFormValues`, for `useAIForm.setValues`            |

A module that exports a component exports nothing else: an App lints this source with its own Portal configuration, and Fast Refresh requires it. A component's context, hooks, and helpers live in a sibling module — `page-element-store.ts` beside `page-element-provider.tsx`, `tool-call-utils.ts` beside `tool-call-card.tsx` — so import a hook or helper from that sibling, and put new non-component exports there too.

If `client/extensions/nocobase-ai` is missing, install the Registry item before doing frontend work; see [chat-surfaces.md § Install the extension](chat-surfaces.md#install-the-extension). A missing extension is never a reason to import UI from `@nocobase/ai-employee` or to rebuild chat under `client/`.

## App server

`server/` holds the App's own services, routes, runtime, and plugin integration. `server/plugins.ts` and `client/plugins.ts` are where a plugin is registered. The App runtime owns one `AIManager`, created by the AI Employee plugin.

Use the plugin runtime for authenticated conversations, persistence, `/api/ai`, SSE, and settings. Direct `AgentService` use is for isolated App-owned server integrations only — see [server-runs.md](server-runs.md#when-to-drive-an-agent-directly).

An App backend tool reaches App services through its declared `dependencies`, so a service the tool needs must be registered in the App container under a token the tool can import — by convention a provider under `server/providers/`, with its token exported from `server/providers/index.ts`.

## The installed dependency

App code imports `@nocobase/ai-employee` from its public root only:

```ts
import { defineAIEmployee, defineTools } from '@nocobase/ai-employee';
```

The root also covers employee and tool managers, `AgentContext`, resource loaders, repositories, LLM providers and helpers, and the knowledge/vector contracts. Inspect the installed declarations under `node_modules/@nocobase/ai-employee` when a shape is in doubt.

Two exports look useful and are not. `createAIManager()` builds a second manager; it is only for an isolated worker, CLI, or test that deliberately wants no App runtime. `defineMCP()` belongs to the loader, not to an App: configure MCP in `config.yml` `ai.mcpServers`, which is the one supported path.

The enabled plugin exposes its server entry at `@nocobase/app-plugin-ai-employee/server`. Import only `aiManagerToken`, `aiConversationsManagerToken`, `agentServiceFactoryToken`, `AIResourceRegistrar`, the config types and helpers, and the agent request/result types.

Never import `@nocobase/ai-employee/src/...` or a plugin-private server, agent, or factory path. An importable subpath is not a runtime contribution: importing the server entry registers nothing, and registration happens only in the App's own Provider.

## Tests and validation

Follow the App's existing test layout — commonly `tests/logic/` or `tests/` for unit and integration tests, and `e2e/` for authenticated browser or API flows. Colocate tests inside the installed AI extension only if that extension already does.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If a script is absent, read `package.json` and run the closest equivalent. Employees and tools are TypeScript compiled into the build, so they deploy normally. `ai/skills` does not — check for it explicitly rather than assuming the build carried it.
