# @nocobase/app-plugin-ai-employee

Publishable NocoBase App plugin that owns the application-specific AI employee
runtime: Hono routes and authentication, database collections and repositories,
conversation orchestration, agents, built-in employees/tools/skills, file
services, and resource loading order.

The package depends on `@nocobase/ai-employee` for framework-neutral contracts,
repository ports, managers, resource loaders, provider implementations, and
helpers. The dependency is one-way; the core package does not import this plugin.

## Plugin entries

- `server/plugin.ts` contributes the `ai` application-config schema and provider lifecycle.
- `server/providers/ai-employee.ts` subscribes to config reloads and synchronizes `ai.llmServices` into the repository-backed manager.
- `server/bootstrap.ts` initializes the database-backed runtime and loads package-owned resources from `ai/` before the application's external `ai/` extension directory.
- `server/routes/index.ts` installs per-request authentication context and AI
  action routes.
- `database/collections` defines the AI Employee collection layout, and
  `database/migrations` creates it through the App migration system.

## LLM service configuration

Declare LLM services only in the application's `config.yml`:

```yaml
ai:
  llmServices:
    - name: openai
      title: OpenAI
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
      enabledModels:
        mode: custom
        models:
          - label: GPT-4.1
            value: gpt-4.1
      enabled: true
      sort: 10
```

The configured name set is authoritative, including an empty array. Reloading the `ai` application-config namespace reconciles additions, structural updates, and removals without restarting the process or rescanning the AI resource directory. Existing records preserve the user-managed `enabled` and `enabledModels` values. Environment references are expanded recursively after validation; missing variables become empty strings.

## Development showcases

Plugin-owned Demo pages live under `client/dev` and are mounted with
`defineDevRoutes()` under the `/dev/ai-components` menu group. They exercise the
canonical Registry components but are not part of the application-owned Registry
item and are excluded from production application builds.

`pnpm build` compiles the plugin-owned development pages with the rest of the Client
source and copies non-TypeScript AI resources, including prompts and skill Markdown,
to `dist/ai`. `defineDevRoutes()` keeps these pages out of production application
bundles.
