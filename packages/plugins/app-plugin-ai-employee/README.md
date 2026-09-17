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
