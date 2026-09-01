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

Create and maintain employees, tools, skills, and MCP definitions under `<appRoot>/ai/`, where `<appRoot>` is the generated App source directory created by `pnpm create @nocobase/app`. Do not place App customization inside dependency package source or copy the AI plugin's builtin tree.

Prefer `<appRoot>/storage/ai/models.json` for LLM service configuration. Keep `<appRoot>/ai/models.json` as the packaged/source-controlled default manifest.

An App extends AI resources with this source tree:

```text
ai/
├── models.json
├── tools/
│   ├── search.ts
│   └── grouped-tool/
│       ├── index.ts
│       └── description.md
├── mcp/
│   └── internal.ts
├── skills/
│   └── reporting/
│       ├── SKILLS.md
│       └── tools/
│           └── query.ts
└── employees/
    ├── analyst.ts
    └── coordinator/
        ├── index.ts
        ├── prompt.md
        ├── tools/
        │   └── delegate.ts
        └── skills/
            └── orchestration/
                └── SKILLS.md
```

## Overall Load Order

The enabled AI employee App plugin initializes resources in this order:

1. Switch employee storage from the initial memory repository to the plugin repository.
2. Load **package-owned AI resources**; skip package `models.json`.
3. Load **App source resources** from `<appRoot>/ai`, including the packaged/default `ai/models.json`; App tools use `overrideExisting: true`.
4. Load `<appRoot>/storage/ai/models.json` with `preserveUserState: false` and `replaceExisting: true`. When present, this later storage manifest is authoritative for the LLM service set.
5. Switch LLM-service storage to the persistent plugin repository.

Inside each `loadResources(...)` call the order is:

1. LLM services (when enabled)
2. tools
3. MCP definitions
4. skills
5. employees
6. MCP client rebuild

This sequence is intentional: skills and employees may name tools already loaded; employees may name skills already loaded. Do not reorder without integration tests.

## LLM Services

Prefer `<appRoot>/storage/ai/models.json` for runtime-editable LLM service configuration. The file is loaded after the packaged/source-controlled `<appRoot>/ai/models.json`; when it exists, it is authoritative and replaces the service set. Edit this storage file to change providers, credentials references, enabled models, and service flags without rebuilding/repacking the App. Restart/reload the App after editing.

Keep `<appRoot>/ai/models.json` as the source-controlled default/fallback used for fresh deployments or when the storage manifest does not exist. It is not the preferred location for iterative runtime configuration. The format is a fixed JSON array, not one file per service.

```json
[
  {
    "name": "company-openai",
    "title": "Company OpenAI",
    "provider": "openai",
    "options": {
      "apiKey": "${OPENAI_API_KEY}",
      "baseURL": "${OPENAI_BASE_URL}"
    },
    "enabledModels": {
      "mode": "custom",
      "models": [{ "label": "GPT", "value": "gpt-4.1" }]
    },
    "modelOptions": { "temperature": 0.3 },
    "enabled": true,
    "sort": 10
  }
]
```

Required fields: non-empty `name` and `provider`. `${ENV_NAME}` expands recursively in strings, arrays, and objects; missing variables become empty strings.

`enabledModels` accepts a legacy string array or `{ mode, models }`, where mode is `recommended`, `provider`, or `custom`.

`replaceExisting` deletes services absent from a successfully loaded manifest. Use it only for authoritative synchronization.

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
- LLM services: App `ai/models.json` supplies packaged defaults; `storage/ai/models.json` loads later with replacement semantics and is authoritative when present. Services absent from a successfully loaded storage manifest are removed before persistence switches to the database-backed repository.

Use an identical key only when replacement is intentional.

## Production Resolution

Package and App AI source trees are compiled/copied beside runtime modules. The runtime resolves the App source AI directory and separately checks the App source directory for `models.json`, then loads `storage/ai/models.json` as the later runtime override. The storage manifest is therefore the preferred operator-editable location and avoids a rebuild/repack cycle.
