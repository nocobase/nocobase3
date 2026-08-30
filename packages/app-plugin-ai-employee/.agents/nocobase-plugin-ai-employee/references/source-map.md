# NocoBase App AI Source Map

## Table of contents

- [Identify the App root](#identify-the-app-root)
- [App AI resources](#app-ai-resources)
- [App frontend](#app-frontend)
- [App server](#app-server)
- [Installed public dependency](#installed-public-dependency)
- [Tests and validation](#tests-and-validation)

## Identify the App root

A NocoBase App is normally created with:

```bash
pnpm create @nocobase/app crm
cd crm
pnpm install
```

The current directory is the App root when it contains `client/`, `server/`, and `package.json`. Work relative to this root. Do not require users to know which npm template package generated it.

Read these App-local files when present:

- `README.md`: App setup and development notes.
- `AGENTS.md`: App-specific coding rules.
- `package.json`: enabled plugins, dependencies, and scripts.
- `ai/README.md`: AI resource layer and build behavior.
- `client/extensions/nocobase-ai/README.md`: installed AI frontend capabilities.

## App AI resources

- `ai/models.json`: LLM service manifest with environment placeholders.
- `ai/employees/<name>/index.ts`: App employee definition.
- `ai/employees/<name>/prompt.md`: optional long prompt.
- `ai/tools/<name>.ts`: App backend tool.
- `ai/skills/<name>/SKILLS.md`: App skill.
- `ai/skills/<name>/tools/`: skill-local tools.
- `ai/mcp/<name>.ts`: MCP server definition; filename is the resource name.

Use any existing validation/example resources in these directories as local examples. Keep App resources separate from package built-ins; built-ins are loaded by the enabled plugin.

## App frontend

Active App source is under `client/`. Common extension points:

- `client/routes.ts`: App-owned routes.
- `client/providers.ts`: App providers.
- `client/pages/`: App pages.
- `client/extensions/nocobase-ai/`: installed, App-owned AI frontend source.

Inside the AI frontend extension, inspect:

- `index.ts`: exports.
- `global-ai-chat.tsx`: global provider/chat entry.
- `services/types.ts`: `AIService` contract.
- `services/nocobase-ai-service.ts`: `/api/ai` adapter.
- `providers/ai-provider.tsx`: configuration, transport, invokers.
- `providers/chat-transport.ts`: requests and SSE transport.
- `providers/page-context.tsx`: context scopes and tool/form allowlists.
- `providers/frontend-tool-registry.tsx`: browser tool registration/execution.
- `providers/form-registry.tsx`: form validation/filling.
- `components/page-elements/`: page-element and form hooks.
- `components/surfaces/`: inline/page/dialog/side-panel chat.
- `components/chat/`: chat UI.
- `components/tools/`: result renderers.
- `demo/` or example pages: complete integration examples when installed.

If `client/extensions/nocobase-ai` is not installed, inspect the App's Registry/extension installation mechanism rather than importing UI from `@nocobase/ai-employee`.

## App server

- `server/`: App-owned services, routes, runtime, and plugin integration.
- `package.json#nocobase.plugins`: enabled App plugins.
- The App runtime normally owns a single `AIManager` used by the enabled AI Employee plugin.

Use the plugin runtime for authenticated conversations, persistence, `/api/ai`, SSE, and settings. Direct manager use is for isolated server integrations only.

## Installed public dependency

Inspect installed declarations and exports for `@nocobase/ai-employee` through editor navigation or `node_modules/@nocobase/ai-employee` when necessary. Application code must import only from the package's public root:

```ts
import {
  createAIManager,
  defineAIEmployee,
  defineMCP,
  defineTools,
} from '@nocobase/ai-employee';
```

Relevant public areas include:

- employee options/managers;
- tool options/managers and `AgentContext`;
- MCP options/managers;
- resource loaders;
- repositories;
- LLM providers and helpers;
- knowledge/vector feature contracts.

Never import `@nocobase/ai-employee/src/...` or plugin-private server/agent paths.

## Tests and validation

Follow the App's existing test layout. Common locations include:

- `tests/logic/` or `tests/` for unit/integration tests;
- `e2e/` for authenticated browser/API flows;
- tests colocated inside the installed AI extension only when that extension already follows that convention.

Use App-local scripts:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If a script is absent, inspect `package.json` and run the closest available check. Verify that built App output includes the `ai/` resources and that the enabled AI Employee plugin loads them.
