---
"@nocobase/app-server": minor
---

Check each database connection's options against its dialect driver before the application starts. `defineAppDatabaseConfig` now runs the driver's own `normalizeConnection` and `resolveConnection` for every connection, both of which build options without connecting, and reports what the driver rejects under `database.connections.<name>` — at startup, on reload and in `pnpm config:check` — instead of only when the connection is first opened. A dialect whose driver is not installed is still reported by loading the configuration.
