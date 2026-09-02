# Application Resources and Load Order

## Contents

- [Application Tree](#application-tree)
- [Overall Load Order](#overall-load-order)
- [LLM Services](#llm-services)
- [Tools](#tools)
- [MCP Servers](#mcp-servers)
- [Skills](#skills)
- [Employees](#employees)
- [Override Semantics](#override-semantics)
- [Production Resolution](#production-resolution)

This file explains placement and order. Before copying any example, read [Exact Application Contracts](application-contracts.md) for the complete parameter definitions.

## Application Tree

Create and maintain employees, tools, skills, and MCP definitions under `<appRoot>/ai/`. Declarative LLM services do not live in this resource tree; configure them in `<appRoot>/config.yml` under `ai.llmServices`.

```text
config.yml                 # ai.llmServices
ai/
├── tools/
├── mcp/
├── skills/
└── employees/
```

## Overall Load Order

The enabled AI employee App plugin initializes resources in this order:

1. Switch employee storage from the initial memory repository to the plugin repository.
2. Subscribe to the `ai` application-config namespace.
3. Validate and synchronize the initial `ai.llmServices` snapshot into the in-memory LLM repository.
4. Switch LLM-service storage to the persistent plugin repository. Matching database records preserve `enabled` and `enabledModels`; database-only services are removed.
5. Load package-owned and App-owned employee, tool, skill, and MCP resources.
6. Reconcile every later `ai` config reload into the active database repository.

Inside each `loadResources(...)` call the order is tools, MCP definitions, skills, employees, then MCP client rebuild. LLM service configuration is intentionally outside resource loading.

## LLM Services

`config.yml` is the only declarative LLM service source:

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

Required fields are non-empty `name` and `provider`. `${ENV_NAME}` expands recursively after App config validation; missing variables become empty strings. `enabledModels` accepts `string[]`, `null`, or `{ mode, models }`, where mode is `recommended`, `provider`, or `custom`.

The configured service-name set is authoritative. A missing or empty `llmServices` array removes all configured services. Existing names preserve repository-managed `enabled` and `enabledModels`; newly added names use config values or manager defaults. Additions and updates are persisted before stale names are deleted.

After editing `config.yml`, run the application's config reload mechanism. Once reload succeeds, no process restart and no AI resource-directory rescan are required.

## Tools

Scanner patterns include any `tools/**/*.ts|js` under the AI tree plus `description.md`. Therefore tools nested under skills and employees are globally registered before those resources.

```ts
import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import { z } from 'zod';

export default defineTools<AgentContext>({
  scope: 'SPECIFIED',
  defaultPermission: 'ASK',
  definition: {
    name: 'placeholder', // loader replaces this with the file/directory key
    description: 'Search business records',
    schema: z.object({ query: z.string() }),
  },
  async invoke(ctx, args, runtime) {
    return { status: 'success', content: args.query };
  },
});
```

Unique key:

- `tools/search.ts` → `search`
- `tools/search/index.ts` → `search`
- `description.md` belongs to its directory key and overrides `definition.description`.

A module must resolve to a `ToolsOptions` object (a default export is the normal form). A function export is called with no arguments. Invalid or empty modules are ignored/logged. App tools can replace package tools because the App load uses `overrideExisting: true`.

## MCP Servers

Location: direct files under `ai/mcp/`; nested directories are not scanned by the standard runtime.

```ts
import { defineMCP } from '@nocobase/ai-employee';

export default defineMCP({
  transport: 'http',
  url: 'https://mcp.example.com/mcp',
  headers: {
    Authorization: `Bearer ${process.env.INTERNAL_MCP_TOKEN ?? ''}`,
  },
});
```

Supported transports: `stdio`, `http`, `sse`. The unique key is the filename. A function export is called with no arguments. Registration persists configuration; `rebuildClient()` closes the old client, reconnects enabled servers, and refreshes available MCP tools.

## Skills

Location: one `SKILLS.md` per skill directory, anywhere under a scanned `skills/` tree.

```md
---
name: reporting
description: Build and explain business reports.
scope: SPECIFIED
introduction:
  title: Reporting
tools:
  - shared-query
---

Follow the reporting workflow...
```

The loader uses frontmatter `name` as the unique key, not the directory name. Default scope is `SPECIFIED`. Local `tools/**/*.ts|js` names are discovered and merged with frontmatter `tools`, de-duplicated by name.

When a skill is nested under an employee's `skills/` directory, employee discovery records the skill directory name. Keep that directory name equal to the `SKILLS.md` frontmatter `name`, or the employee will reference a key that the skill manager did not register.

## Employees

Supported standard forms:

- `employees/analyst.ts`
- `employees/analyst/index.ts`
- JavaScript equivalents
- optional `employees/analyst/prompt.md`

```ts
import { defineAIEmployee } from '@nocobase/ai-employee';

export default defineAIEmployee({
  username: 'analyst',
  nickname: 'Analyst',
  skills: ['reporting'],
  tools: [{ name: 'shared-query', autoCall: true }],
});
```

The unique key is `username`. `prompt.md` replaces `systemPrompt`. Local skill directories contribute their skill directory names, and local tool modules contribute tool names. Discovered values append to explicitly configured `skills` and `tools`; discovered employee tools are de-duplicated by name.

## Override Semantics

- Tools: package duplicate is skipped by default; App layer explicitly allows replacement.
- Skills: `registerSkills` merges current and new values; the later App registration wins for supplied fields.
- MCP: `registerMCP` updates an existing entry by filename key.
- Employees: later registration updates the built-in employee by `username` while preserving user-managed fields according to manager conversion rules.
- LLM services: `ai.llmServices` is an authoritative application-config snapshot. Matching names update structural fields while preserving database `enabled` and `enabledModels`; absent names are deleted after additions and updates complete.

Use an identical key only when replacement is intentional.

## Production Resolution

Employee, tool, skill, and MCP resources continue to resolve from package and App AI source trees. LLM services resolve only from the validated App config accessor. After editing `config.yml`, invoke application config reload; no build, process restart, or resource-directory rescan is needed.
