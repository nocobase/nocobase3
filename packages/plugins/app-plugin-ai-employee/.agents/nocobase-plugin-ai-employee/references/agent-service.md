# Runtime Boundaries for NocoBase Apps

## Table of contents

- [Normal App path](#normal-app-path)
- [Public core APIs](#public-core-apis)
- [AI Employee plugin responsibilities](#ai-employee-plugin-responsibilities)
- [Direct manager use](#direct-manager-use)
- [AgentService boundary](#agentservice-boundary)
- [Capability selection](#capability-selection)
- [Verification](#verification)

## Normal App path

```text
App ai/ resources
        ↓
@nocobase/app-plugin-ai-employee
        ↓
/api/ai + persisted conversations
        ↓
client/extensions/nocobase-ai
```

Use App resource files for employees, skills, backend tools, and MCP. Use `config.yml` `ai.llmServices` for declarative model services, and use the installed AI frontend service/transport for chat. Use the enabled plugin instead of creating a second AI runtime.

## Public core APIs

Import from the public root `@nocobase/ai-employee`. Public capabilities include:

- `createAIManager()` and `createAIManagerWithRepositories()`;
- `defineAIEmployee()` and employee manager/types;
- `defineTools()` and tool manager/types;
- `defineMCP()` and MCP manager/types;
- resource loaders;
- repositories and framework-neutral types;
- LLM providers/helpers;
- knowledge/vector feature contracts.

Never import `@nocobase/ai-employee/src/...` or an undocumented subpath. Use installed declarations/editor navigation to inspect exact current types.

## AI Employee plugin responsibilities

The enabled `@nocobase/app-plugin-ai-employee` supplies:

- built-in employees/tools;
- loading of the App's `ai/` directory;
- database repositories and conversation persistence;
- authenticated `/api/ai` routes;
- LLM service management;
- file upload/preview;
- SSE, approval, and tool-call resume;
- internal agent execution.

The App runtime normally owns a single `AIManager` used by this plugin. Do not create another manager for ordinary App chat.

## Direct manager use

Use `createAIManager()` only for an isolated worker, CLI, test, or integration that intentionally does not need plugin conversation persistence, current-user authentication, `/api/ai`, SSE, settings UI, or Registry chat:

```ts
import { createAIManager } from '@nocobase/ai-employee';

const ai = createAIManager(logger);
await ai.employeeManager.registerEmployee(employeeDefinition);
await ai.toolsManager.registerTools(toolDefinition);
```

The default manager uses in-memory repositories. If durable state is required, use a public repository factory or the enabled plugin. Do not register a competing manager in normal App startup.

## AgentService boundary

`AgentService` is internal to the AI Employee plugin implementation. It is not exported by `@nocobase/ai-employee` as a stable App API.

An App code agent must not:

- deep-import plugin server/agent files;
- import dependency source through filesystem paths;
- instantiate plugin-internal runtime classes;
- copy plugin persistence/middleware into the App;
- promise custom AgentService integration as a normal App resource feature.

When diagnosing `/api/ai`, streams, approvals, or sub-agents, inspect installed/public behavior and tests first. If a feature truly requires direct AgentService access, report a public API gap rather than coupling the App to internals.

## Capability selection

Choose the least invasive public extension point:

1. Prompt/persona → `ai/employees/<name>/index.ts` and optional `prompt.md`.
2. Backend operation → `ai/tools/<name>.ts` with `defineTools`.
3. Reusable instructions → `ai/skills/<name>/SKILLS.md`.
4. External service/process → `ai/mcp/<name>.ts` with `defineMCP`.
5. Provider/model setup → `config.yml` `ai.llmServices` and environment variables.
6. Chat/page experience → `client/extensions/nocobase-ai`.
7. Browser action → `defineAIFrontendTool` in page context.
8. Form population → `useAIForm` and built-in `formFiller`.
9. AI settings UI → public `registerAISettingsTabs` client API.
10. New execution lifecycle → identify the missing public API; do not deep-import.

## Verification

For App resources:

- file is under `ai/` and default-exports a valid public definition;
- built output includes the resource;
- the enabled plugin loads it after built-ins;
- a focused App test passes.

For frontend features:

- one root/chat provider is mounted per scene;
- the installed service/transport is reused;
- context/results are serializable;
- `ASK` actions use approval/resume;
- form filler never submits/saves;
- browser code has no private imports.

Run the App's available checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
