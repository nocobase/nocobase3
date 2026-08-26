# @nocobase/app-plugin-ai-employee

Publishable NocoBase App plugin that owns the application-specific AI employee
runtime: Hono routes and authentication, database collections and repositories,
conversation orchestration, agents, built-in employees/tools/skills, file
services, and resource loading order.

The package depends on `@nocobase/ai-employee` for framework-neutral contracts,
repository ports, managers, resource loaders, provider implementations, and
helpers. The dependency is one-way; the core package does not import this plugin.

## Plugin entries

- `server/bootstrap.ts` initializes the database-backed runtime and loads package-owned
  resources from `ai/` before the application's external `ai/` extension directory.
- `server/routes/index.ts` installs per-request authentication context and AI
  action routes.
- `database/collections` defines the AI Employee collection layout, and
  `database/migrations` creates it through the App migration system.

`pnpm build` compiles TypeScript and copies non-TypeScript AI resources, including
prompts and skill Markdown, to `dist/ai`.
