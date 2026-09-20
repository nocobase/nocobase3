# @nocobase/app-plugin-ai-employee

Publishable NocoBase App plugin that owns the application-specific AI employee
runtime: Hono routes and authentication, database collections and repositories,
conversation orchestration, agents, built-in employees/tools/skills, file
services, and resource loading order.

The package depends on `@nocobase/ai-employee` for framework-neutral contracts,
repository ports, managers, resource loaders, provider implementations, and
helpers. The dependency is one-way; the core package does not import this plugin.

## Plugin entries

- `server/plugin.ts` is the only server runtime entry and contributes provider lifecycle, routes, and migration location.
- `server/provider/ai-employee.ts` registers App-container-scoped repository and service factories, initializes package resources before the application's external `ai/` directory, and synchronizes `ai.llmServices` on configuration reload.
- `server/route/index.ts` creates the authenticated `/api/ai` child router. Routes parse HTTP input and map responses while domain behavior is delegated to factory-owned services.
- `server/service/ai-mcp-server-service.ts` synchronizes MCP servers from `ai.mcpServers` in `config.yml` and exposes read, test, and tool-inspection operations.
- `database/collections` defines the AI Employee collection layout, and
  `database/migrations` creates it through the App migration system.

## LLM service configuration

Declare LLM service defaults in `server/config/ai.ts` and deployment overrides in `config.yml`:

```yaml
ai:
  llmServices:
    - name: openai
      title: OpenAI
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
      enabledModels:
        - label: GPT-4.1
          value: gpt-4.1
      enabled: true
      sort: 10
```

## MCP server configuration

Declare MCP servers in the application's `config.yml`; the settings page is read-only:

```yaml
ai:
  mcpServers:
    filesystem:
      transport: stdio
      command: npx
      args:
        - -y
        - '@modelcontextprotocol/server-filesystem'
        - /tmp
      env:
        API_KEY: ${MCP_API_KEY}
    remote:
      transport: http
      url: ${MCP_SERVER_URL}
      headers:
        Authorization: Bearer ${MCP_SERVER_TOKEN}
```

Configuration reload synchronizes the configured server set and rebuilds the MCP client. The UI only provides connection testing and viewing the tools discovered from each configured server.

The configured name set is authoritative, including an empty array. Each configured `enabledModels` array is converted internally to custom mode; `mode` is not part of the application config contract. Reloading the `ai` application-config namespace reconciles additions, structural updates, and removals without restarting the process or rescanning the AI resource directory. Existing records preserve the user-managed `enabled` and `enabledModels` values. Environment references are expanded recursively after validation; missing variables become empty strings.

## Conversation center

Settings navigation groups the plugin under **AI**, with sibling **AI Employees** (`/settings/ai`), **Skills** (`/settings/ai/skills`), **Tools** (`/settings/ai/tools`), **Conversations** (`/settings/ai/conversations`), **LLM services** (`/settings/ai/llm-services`), and **MCP services** (`/settings/ai/mcp-services`) pages. LLM and MCP services are standalone pages, not tabs; legacy service-settings links redirect to the corresponding page. AI Employees renders only employee management, with no cross-feature tabs; internal employee detail/editor tabs are unchanged. Other plugins contribute standalone Settings entries with `parent: 'aiGroup'`. The exported tab registry is deprecated and no longer renders contributed content or navigation. Legacy knowledge-base/vector tab query and location-state links redirect to `/settings/ai/knowledge-base` and `/settings/ai/vector-database`, which require the owning Knowledge Base plugin; their path helpers now target those standalone pages. The conversation center is a standalone read-only page, not an employee-settings tab. Authenticated users authorized to access AI settings can search and paginate application-wide conversations, inspect owner and scope metadata, and load earlier messages without marking conversations as read. The center reuses the canonical Registry conversation list, message renderer, and history conversion rather than maintaining a separate chat UI. Tool approvals, message editing, resending, and tool execution are unavailable in this view.

Search, page, and selected session are preserved in the URL (`keyword`, `page`, and `session`) for refresh and back/forward navigation. Conversation details expand without leaving the transcript. List and message refreshes are independent, failed requests can be retried in place, and loading earlier messages preserves the visible message position.

The management endpoints are `GET /api/ai/aiConversations:listAll` (`keyword`, `page`, `pageSize`, maximum 100) and `GET /api/ai/aiConversations:getAllMessages` (`sessionId`, optional `cursor`). Both enforce authentication and the Authorization permission `{ resource: { type: 'page', id: 'ai.settings' }, action: 'access' }` independently of frontend navigation, matching the client access-control provider's mapping for `ai.settings`. Permission Sets, including the system administrator's wildcard page grant, determine access; legacy `session.user.isRoot` and `roles` fields are not an authorization source. Personal conversation endpoints retain their existing ownership checks.

## Skills catalog

The **Skills** menu immediately follows **AI Employees** in the AI settings group. It opens a standalone read-only, responsive card catalog of all discoverable AI employee skills, rather than only the skills assigned to one employee. Each card presents the title, identifier, and description above a tools footer with a Wrench icon and wrapping tool badges. The management endpoints `GET /api/ai/aiSkills:listAll` and `GET /api/ai/aiSkills:getDetails?name=<skill-name>` require authentication and the Authorization permission `{ resource: { type: 'page', id: 'ai.settings' }, action: 'access' }`, matching the page's client access policy. The list returns skill titles, names, descriptions, and associated tool metadata without Markdown content. Clicking a card or activating its title button with the keyboard loads its details into a drawer with the title, description, safely rendered skill Markdown, and tool list. Closing the drawer returns focus to that card's title button. Unavailable tool references remain visible rather than being silently omitted. Search filters skill metadata and tool names locally; loading, empty, no-match, and retryable error states are supported. Viewing a skill never executes its tools. The existing runtime skills endpoints remain unchanged, and the page does not expose mutations or list application-development Agent Skills.

## Employee tool selection

The employee's **Tools** tab shows one flat list of every catalog source and scope, plus saved names that are currently unavailable. Each row has a separate enable switch and permission control. CUSTOM tools retain editable Ask/Allow permissions while enabled; disabling a tool preserves its saved permission. GENERAL and SPECIFIED tools display their registered permission read-only. Catalog failures disable tool edits and offer an in-place retry without resetting the employee draft.

`skillSettings.enabledTools` is an authoritative allowlist when present, including `[]` for no tools. Missing or `null` values retain legacy eligibility: GENERAL tools from all sources, configured tool names, tools associated with effective skills, and the available `getSkill`, `subAgentWebSearch`, and `knowledge-base-retrieve` system tools. This is eligibility, not immediate activation: skill tools still require loading their skill, and optional system tools retain their runtime capability checks. The first switch change snapshots this eligibility, preserving unknown saved names. Unrelated saves preserve missing, null, and empty overrides and never discard tool permissions.

## Tools catalog

The **Tools** menu immediately follows **Skills** in the AI settings group at `/settings/ai/tools`. Its read-only cards show each registered tool's title, identifier, description, and declared scope/source when present. Search filters titles, names, and descriptions locally. Opening a card loads a right-side drawer with a fixed header, safely rendered About Markdown, and an inert JSON view of the input schema. A missing schema is shown as unavailable; an empty schema remains `{}`. Schema references are displayed as text, never fetched or executed. Keyboard activation, Escape dismissal, focus return, loading, retryable errors, empty results, and request cancellation are supported. There are no execution or mutation controls.

`GET /api/ai/aiTools:listAll` returns `{ rows: ManagedToolSummary[] }`, where each summary contains `name`, `title`, `description`, `scope`, and `source` strings. `GET /api/ai/aiTools:getDetails?name=<tool-name>` returns the detail directly, adding `about: string` and `inputSchema: Record<string, unknown> | null`. Both endpoints require authentication and the Authorization permission `{ resource: { type: 'page', id: 'ai.settings' }, action: 'access' }`, corresponding to the client route's explicit `ai.settings/read` policy. The existing runtime `aiTools:list` response contract is unchanged.

## Development showcases

Plugin-owned Demo pages live under `client/dev` and are mounted with
`defineDevRoutes()` under the `/dev/ai-components` menu group. They exercise the
canonical Registry components but are not part of the application-owned Registry
item and are excluded from production application builds.

`pnpm build` compiles the plugin-owned development pages with the rest of the Client source and copies runtime skill Markdown to `dist/ai/skills`. This copy is required by application builds that vendor only compiled package output. `defineDevRoutes()` keeps development pages out of production application bundles.

## Runtime data and report skills

`data-metadata`, `data-query`, and `business-analysis-report` are GENERAL employee runtime skills, not coding-agent Skills. Their eight backend tools are SPECIFIED and become callable through the existing `getSkill` activation flow. Current session skill/tool restrictions still apply to previously loaded skills.

Data access requires the Authorization plugin and an explicit `<connection>.<collection>` registration with a `read` action, field definitions, and permission grants for the trusted conversation user. Missing authorization or unmapped collections fail closed, even for a root-marked actor. Main and delegated employees retain the same user identity; tools cannot choose another user or role.

See [data capability boundaries](server/service/data-capabilities.md) for supported filters, temporal semantics, one-hop relations, bounded group domains, precision, pagination, and deployment resource controls. Query tools do not execute arbitrary SQL or fetch all records for in-memory aggregation.

Reports accept strictly structured charts and 1-based `{{chart:n}}` references. The server returns validated, normalized report data with `success`, `chartCount`, `errors`, and `warnings`; the Registry renderer previews only that confirmed output, never unvalidated tool arguments. Markdown-only reports remain supported. No report tables or new persistence/export products are introduced.

After a build, run `AI_SKILLS_PACKAGE_SMOKE=1 pnpm test tests/data-skill-package-smoke.test.ts` from this package to verify both root-asset and dist-only deployment layouts without server source files.
