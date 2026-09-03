# @nocobase/ai-employee

Framework-neutral AI runtime contracts for NocoBase 3 applications.

## Boundaries

This package owns domain types, repository ports, four App-resource loaders, resource synchronization, provider registration, middleware composition, streaming events/cache, repository-backed managers, and checkpoint algorithms. It does not import Hono, NocoBase server/action APIs, database adapters, or the application config system.

## Resource loaders

Package-owned resources and application resources in an App's `ai/` directory use the same generic loaders. The runtime loads the package layer first, then the application layer; application resources can extend or override the preceding resource with the same key.

- `employees/`: `index.js` or named JavaScript/TypeScript definitions, with optional `prompt.md`; unique key `username`.
- `tools/`: JavaScript/TypeScript definitions; unique key is the resource filename/directory name.
- `skills/`: one `SKILLS.md` per skill directory; unique key `name`.
- `mcp/`: JavaScript/TypeScript definitions; unique key is the resource filename.

Declarative LLM service configuration is owned by `@nocobase/app-plugin-ai-employee` through application `config.yml` at `ai.llmServices`; the former filesystem loader is not part of this core package.

Static Markdown resources are emitted beside compiled package modules so the same
loader behavior works in production.

## Persistence

The package only defines repository and infrastructure ports. App integrations provide
database-backed adapters, while tests and standalone consumers may use in-memory
adapters without changing loaders or runtime APIs.
