# @nocobase/ai-employee

Framework-neutral AI runtime contracts for NocoBase 3 applications.

## Boundaries

This package owns domain types, repository ports, five App-resource loaders, resource synchronization, provider registration, middleware composition, streaming events/cache, repository-backed managers, and checkpoint algorithms. It does not import Hono, NocoBase server/action APIs, or database adapters.

## Resource loaders

Package-owned resources in `src/builtin` (or published `dist/builtin`) and application
resources in an App's `ai/` directory use the same generic loaders. The runtime loads
the package layer first, then the application layer; application resources can extend
or override the preceding resource with the same key.

- `employees/`: `index.js` or named JavaScript/TypeScript definitions, with optional `prompt.md`; unique key `username`.
- `tools/`: JavaScript/TypeScript definitions; unique key is the resource filename/directory name.
- `skills/`: one `SKILLS.md` per skill directory; unique key `name`.
- `mcp/`: JavaScript/TypeScript definitions; unique key is the resource filename.
- `models.json`: a fixed **application-only** LLM-service manifest; it is not loaded from package builtins.

Static Markdown resources are emitted beside compiled package modules so the same
loader behavior works in production.

## Persistence

The package only defines repository and infrastructure ports. The default template provides the first-phase in-memory adapters. A later database adapter can replace them without changing loaders or runtime APIs.
