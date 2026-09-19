# @nocobase/ai-employee

Framework-neutral AI runtime contracts for NocoBase 3 applications.

## Boundaries

This package owns domain types, repository ports, Skill and MCP loading primitives, resource synchronization, middleware composition, streaming events/cache, repository-backed managers, and checkpoint algorithms. It does not import Hono, NocoBase server/action APIs, database adapters, or the application config system.

## Resource loading

Employee and Tool filesystem discovery is intentionally not part of Core. Applications define those resources under `server/ai`, statically import them, and register them through the AI Employee plugin's `AIResourceRegistrar`. Core retains `SkillsLoader` and `MCPLoader` for their respective loader-managed resources.

- `ai/skills/<name>/SKILL.md`: Skill manifests loaded by `SkillsLoader`.
- `ai/mcp/<name>.ts`: MCP definitions loaded by `MCPLoader`.

The plugin owns package-root Skill packaging and explicit Employee/Tool registration.

## Persistence

The package only defines repository and infrastructure ports. App integrations provide
database-backed adapters, while tests and standalone consumers may use in-memory
adapters without changing loaders or runtime APIs.
