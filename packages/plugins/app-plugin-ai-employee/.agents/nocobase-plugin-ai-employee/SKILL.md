---
name: nocobase-plugin-ai-employee
description: Use when code agents develop a CLI-created NocoBase App and need to consume @nocobase/ai-employee for application employees, skills, tools, MCP resources, AI frontend experiences, settings pages, or server integrations.
argument-hint: '[area: resources|frontend|api|settings|runtime] [task: inspect|implement|extend|verify]'
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 1.4.0
last-reviewed: 2026-04-09
risk-level: low
---

# Goal

Guide a code agent working inside a NocoBase App created with the CLI:

```bash
pnpm create @nocobase/app crm
cd crm
pnpm install
pnpm dev
```

Treat the current directory as the App source root. Build application-owned AI features through public `@nocobase/ai-employee` APIs, the enabled AI Employee plugin, and the App's installed AI frontend extension. Do not continue development of NocoBase framework packages.

# Architectural View

Use these layers in order:

1. **App source** — edit the current App's `ai/`, `client/`, `server/`, and tests.
2. **Core dependency** — import framework-neutral definitions and managers from the public root `@nocobase/ai-employee`.
3. **AI Employee App plugin** — keep `@nocobase/app-plugin-ai-employee` enabled for application resource loading, conversation persistence, and `/api/ai`.
4. **AI frontend extension** — use the App-owned `client/extensions/nocobase-ai` source for chat, context, forms, and browser tools.
5. **Framework internals** — never deep-import or modify internal dependency/plugin source to complete an App feature.

`@nocobase/ai-employee` provides contracts, resource definitions/loaders/managers, LLM providers, repositories, and helpers. The enabled `@nocobase/app-plugin-ai-employee` additionally provides authenticated `/api/ai`, database-backed conversations, and a public server-container integration surface: `AIConversationsManager` and `AgentServiceFactory`.

# Scope

- Add App-owned employees, skills, backend tools, MCP definitions, and LLM configurations under `ai/`.
- Use built-in employees and tools without copying their definitions into the App.
- Build chat, page context, form filling, tasks, shortcuts, frontend tools, and result renderers in the App's AI frontend extension.
- Consume `/api/ai` through the existing `NocoBaseAIService` and chat transport.
- Add a page to the shared `/settings/ai` tabs from an App plugin.
- Use `createAIManager()` only for isolated server code that deliberately does not need the plugin's App runtime.
- For trusted App server integrations, resolve `aiConversationsManagerToken` and `agentServiceFactoryToken` from the public plugin server entry; create a conversation first, then call `createAIEmployee()` or `createAgent`.

# Non-Goals

- Do not modify or patch `@nocobase/ai-employee` or `@nocobase/app-plugin-ai-employee` for an App feature.
- Do not copy built-in employees/tools into `ai/`.
- Do not import private plugin server/agent paths.
- Do not rebuild chat streaming, conversation storage, tool approval, or frontend-tool protocol.
- Do not present `AgentService` as a browser/client API; direct use belongs to an App-owned server integration and must use the public server container tokens.

# Input Contract

| Input    | Required             | Default     | Validation                                               | Clarification Question                               |
| -------- | -------------------- | ----------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `area`   | yes                  | none        | `resources`, `frontend`, `api`, `settings`, or `runtime` | "Which App AI area should be implemented?"           |
| `task`   | yes                  | `implement` | `inspect`, `implement`, `extend`, or `verify`            | "Should I inspect, implement, extend, or verify it?" |
| `target` | implementation tasks | none        | employee, skill, tool, page, route, tab, or service      | "What App feature should be changed?"                |

Resolve whether the target belongs in:

- `ai/` for server-loaded AI resources;
- `client/extensions/nocobase-ai/` for installed AI UI behavior;
- `client/` for App routes/providers/pages;
- `server/` for App server services;
- an App plugin for reusable server/client/database/settings contributions.

# Mandatory Clarification Gate

- Stop if the requested App feature or client/server boundary is unclear.
- For tools, confirm execution location (`backend` or `frontend`) and permission (`ASK` or `ALLOW`).
- For frontend actions, confirm whether they change only local UI or persist business data.
- For server integrations, confirm whether existing `/api/ai` behavior is sufficient before proposing direct manager access.
- If required input is missing or ambiguous, stop before any mutation and ask the user; never guess a target, permission, execution location, or persistence behavior.

Clarification bounds: max clarification rounds = 2; max questions per round = 3. If the user says “you decide”, use the safest defaults: normal `/api/ai` transport for UI, `SPECIFIED` + backend + `ASK` for application tools, and conversation-first creation with the default database persistence for direct server agents.

# Workflow

1. Confirm the current directory is the CLI-created App root (`client/`, `server/`, `package.json`).
2. Read App-local `ai/README.md` and `client/extensions/nocobase-ai/README.md` when present.
3. Load [Exact contracts](references/contracts.md). If installed declarations are available, compare them before coding; otherwise treat the documented shapes as authoritative and never guess a field name, enum, nullability, default, request body, or return shape.
4. Choose an App-owned extension point; never start by editing a dependency.
5. Implement the smallest App change and add tests in the App's existing test layout.
6. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` when available; every write path requires immediate readback of the changed file or a focused check that proves the intended content is present.
7. For direct AgentService integrations, verify conversation-first creation, session id continuity, authorization, persistence, and failure/abort behavior separately from ordinary UI checks.
8. Report App files changed, public APIs consumed, and any missing framework capability separately.

# Reference Loading Map

| Reference                                         | Use When                                | Notes                                                                                                       |
| ------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [App source map](references/source-map.md)        | starting every task                     | Choose App-local paths and public package boundaries.                                                       |
| [Frontend guide](references/frontend-registry.md) | building App UI                         | Chat, context, forms, tasks, browser tools, and settings.                                                   |
| [API guide](references/api-reference.md)          | integrating backend actions             | Prefer existing service/transport over handwritten requests.                                                |
| [Runtime boundaries](references/agent-service.md) | direct server AgentService integrations | Container tokens, conversation-first creation, `createAIEmployee`, `createAgent`, context, and persistence. |

# App AI Resources

The App's `ai/` directory extends package built-ins. Built-ins load first and App resources load afterward. Do not copy built-ins. Use this layout:

- `ai/employees/<name>/index.ts` and optional `prompt.md`;
- `ai/tools/<name>.ts`;
- `ai/skills/<name>/SKILLS.md` and optional `tools/`;
- `ai/mcp/<name>.ts`;
- `config.yml` `ai.llmServices`.

## Employee

```ts
import { defineAIEmployee } from '@nocobase/ai-employee';

export default defineAIEmployee({
  username: 'sales-assistant',
  category: 'business',
  nickname: 'Sage',
  description: 'Helps users summarize and qualify leads.',
  systemPrompt: 'Use only supplied context and configured tools.',
  skills: ['lead-qualification'],
  tools: [{ name: 'lookup-lead', autoCall: false }],
});
```

Use a unique stable username. Employee-local tools/skills are discovered and merged. Built-ins such as Atlas, Dex, Ellis, Lexi, Vera, and Viz are selected by username; never import or copy their definitions.

## Backend tool

```ts
import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ASK',
  definition: {
    name: 'lookup-lead',
    description: 'Look up one lead authorized for the current user.',
    schema: z.object({ id: z.string() }),
  },
  invoke: async (_ctx, { id }) => ({
    status: 'success',
    content: { id },
  }),
});
```

Explicitly choose scope, execution, and permission. Validate input, enforce business authorization inside the tool, and return serializable output. Use `GENERAL` only when every employee should see it; otherwise activate a `SPECIFIED` tool from an employee or skill.

## Skill, MCP, and LLM services

- Skill: create `SKILLS.md` with `scope`, `name`, `description`, optional `tools`, and instructions. Skill-local tools are discovered automatically.
- MCP: default-export `defineMCP({...})`; the filename is the server name. Read the installed public `MCPOptions` type and keep credentials in environment/config.
- LLM services: configure `config.yml` `ai.llmServices` with environment placeholders and explicit enabled models. The name set is authoritative; reload application config after edits. No process restart or AI resource rescan is required.

The App runtime already owns its `AIManager`; do not call `createAIManager()` merely to load normal `ai/` resources.

# Built-in Tools

Common built-ins include:

- `formFiller`: fills visible registered fields; never submits or saves.
- `loadFrontendTool` and `executeFrontendTool`: exact-id, allowlisted browser actions.
- `suggestions`: selectable next prompts.
- `chartGenerator`: chart options/result presentation.
- `getSkill`: loads a specified skill.
- `knowledge-base-retrieve`: on-demand retrieval when configured.
- Atlas tools: `list-ai-employees`, `get-ai-employee`, `dispatch-sub-agent-task`.

Do not import their implementation modules. Activate them through employee/skill settings or page context.

# Frontend App Integration

Use the installed `client/extensions/nocobase-ai` source. React UI does not come from `@nocobase/ai-employee`.

```tsx
<NocoBaseAIRootProvider service={nocobaseAIService}>
  <AIChatProvider id='sales-chat' controller={controller}>
    <ChatInline>
      <AIChatWindow />
    </ChatInline>
  </AIChatProvider>
</NocoBaseAIRootProvider>
```

Patterns:

- Global chat: reuse the installed global AI extension/provider.
- Embedded chat: `AIChatProvider` + `ChatInline`/`AIChatWindow`.
- Dialog/side panel/page: existing chat surfaces.
- Employee task: `AIChatProvider.employeeTasks` or `AIEmployeeShortcut`.
- Page context: `useAIPageElementHandle`, `AIPageContextScope`, or picker APIs.
- Form filler: `useAIForm`; do not create a duplicate tool.
- Browser action: `defineAIFrontendTool` in a page-element descriptor.
- Rich result UI: pass custom `toolRenderers` to the root provider.

Context, tool arguments, and results must be serializable. Use `ASK` for frontend tools that persist, navigate with side effects, or change business state. Keep one provider/controller mounted for one conversation scene.

# API Usage

Prefer `nocobaseAIService` and the installed chat transport. They already provide employee/model discovery, conversation lifecycle/history, file uploads, SSE send/resend/resume, tool decisions, frontend-tool results, and reconnect recovery.

Only call `/api/ai` directly from a centralized App service adapter when an operation is not exposed by the existing service. Preserve current-user scope, abort signals, SSE framing, approval/resume, and error handling. Never duplicate the stream parser inside a page component.

# Adding `/settings/ai` Tabs

An App plugin can contribute a tab without replacing the settings page:

```ts
import { registerAISettingsTabs } from '@nocobase/app-plugin-ai-employee/client/ai-settings';

registerAISettingsTabs([
  {
    key: 'sales-ai',
    labelKey: 'Sales AI',
    pageLoader: () => import('./pages/sales-ai-settings.js'),
  },
]);
```

Import the registration module for its side effect from the App plugin's client entry. The lazy module must default-export a React component. Add locale resources, keep `/settings/ai`, and use a unique key.

# Direct Core Runtime Use

Use `createAIManager()` directly only for an isolated worker, CLI, test, or server integration that deliberately does not need App authentication, database conversations, `/api/ai`, SSE, settings UI, or Registry chat.

```ts
import { createAIManager } from '@nocobase/ai-employee';

const ai = createAIManager(logger);
await ai.employeeManager.registerEmployee(employeeDefinition);
await ai.toolsManager.registerTools(toolDefinition);
```

For an App-owned server integration that needs the plugin's persisted conversation and configured runtime, do not use a separate manager. Resolve `aiConversationsManagerToken` and `agentServiceFactoryToken` from `@nocobase/app-plugin-ai-employee/server`; read `references/agent-service.md` for the complete contracts and creation order.

The direct `AgentService` API is server-only. It is intentionally not a client/browser resource API.
`AgentService` is available only through the AI Employee plugin's public server-container factory integration described in `references/agent-service.md`; it is not exported by `@nocobase/ai-employee` and is not a browser/client API. Do not deep-import plugin server/agent files.

# Rollback and Recovery for high-impact actions

- If a direct agent integration creates a conversation but agent creation fails, do not retry blindly; record the session id, inspect the conversation state, and use an App-owned cleanup/archive path if the product requires one.
- If streaming disconnects, do not create a second conversation or send the mutation again automatically. Read the existing conversation and resume only when the operation and message state prove it is safe.
- If a custom `ConversationPersistence` violates transaction or message-id invariants, disable that integration and return to the plugin's default database persistence before investigating further.

# Safety Gate

- Keep LLM/MCP credentials out of committed source; use environment placeholders/configuration.
- Never use `ALLOW` for irreversible or persistent actions.
- Never expose arbitrary repository access through a general tool.
- Never send DOM nodes, callbacks, class instances, credentials, or unbounded records as context.
- Never retry a streaming mutation blindly after disconnect; inspect conversation state/history first.
- Never modify or deep-import dependency/plugin internals silently.

# Verification Checklist

- All changes are App-owned or belong to an App plugin.
- `@nocobase/ai-employee` imports use its public root.
- `ai/` resources default-export valid definitions and built-ins are not copied.
- Frontend uses the installed AI extension and existing service/transport.
- Context and tool data are serializable and permission guarded.
- Settings registration is side-effect imported and its lazy page has a default export.
- No private AI Employee plugin server path is imported.
- Run App-local lint, typecheck, test, and build commands.

# Minimal Test Scenarios

1. Add an App employee, skill, and tool; verify they load after built-ins.
2. Use a built-in employee in embedded chat without copying its definition.
3. Send page context and verify the latest serializable values.
4. Fill a registered form and verify no automatic submit/save.
5. Execute an `ASK` frontend tool through approval and resume.
6. Add a `/settings/ai` tab from an App plugin.
7. Verify App code has no private dependency/plugin imports.
8. Create a persisted conversation, create an AI Employee agent with its session id, and verify invoke/stream uses the same session (success path).
9. Create a conversation without `aiEmployee`, create a fixed `AgentService` with `createAgent`, and verify direct model execution (success path).
10. Verify a custom context provider resolves model/prompt/tools without directly loading or saving conversation messages; a missing model must produce a clear error (failure path).
11. Verify a custom persistence implementation keeps assistant messages and usage events atomic and preserves tool status transitions; a usage write error must roll back the message (failure path).
12. Verify unauthorized user/session access is denied and disconnect recovery does not duplicate a mutation (permission/recovery path).

# Output Contract

Final response must include:

- App feature and extension point;
- App-owned files changed;
- public dependency, AI extension, or plugin-client APIs consumed;
- tests/checks run;
- any missing public capability requiring separate framework work.

# References

- [App source map](references/source-map.md): use before choosing an extension point.
- [Frontend guide](references/frontend-registry.md): use for chat, context, forms, tools, tasks, and settings.
- [API guide](references/api-reference.md): use for `/api/ai` behavior and service mapping.
- [Runtime boundaries](references/agent-service.md): use before direct manager or custom agent work.
- [Exact contracts](references/contracts.md): use before writing resource definitions, React props, settings tabs, tool schemas, or request bodies.
- [NocoBase App quickstart](../../../../../docs/docs/en/plugin-development/quick-start.md): use when App creation or local development workflow is unclear.
