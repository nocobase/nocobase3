# @nocobase/app-plugin-ai-employee

Publishable NocoBase App plugin that owns the application-specific AI employee
runtime: Hono routes and authentication, database collections and repositories,
conversation orchestration, agents, built-in employees/tools/skills, file
services, and resource loading order.

The package depends on `@nocobase/ai-employee` for framework-neutral contracts,
repository ports, managers, resource loaders, provider implementations, and
helpers. The dependency is one-way; the core package does not import this plugin.

## Plugin entries

- `server/bootstrap.ts` initializes the database-backed runtime and loads built-in
  resources before the application's `ai/` extension directory.
- `server/routes/index.ts` installs per-request authentication context and AI
  action routes.
- `database/collections` defines the existing AI Employee collection layout;
  bootstrap initializes it without changing database semantics.

`pnpm build` compiles TypeScript and copies non-TypeScript built-in resources,
including prompts and skill Markdown, to `dist/server/builtin`.
