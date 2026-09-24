---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': minor
---

Make MCP servers configurable only in `config.yml`, and keep their state

- **Environment references.** `${NAME}` in `ai.mcpServers` — `headers`, `args`, `env` and `url` — was sent to the server literally; it is now expanded as it is for LLM services, and a missing variable becomes an empty string.
- **Persistent state.** The enable switch and tool permissions set in AI settings reset at every start. Servers are now stored in `aiMcpClients`: `enabled` in `config.yml` applies when a server is first created and the switch is the administrator's after that, and tool permissions are saved on the server's row in a new `toolPermissions` column, added by a migration. Both belong to the server's name, so removing or renaming a server in `config.yml` discards them. The row holds the configuration with every `${NAME}` expanded, so a credential in `headers` or `env` is stored in plain text and is part of database backups.
- **An unreachable server.** One server that did not answer stopped the application from starting. It is now skipped with a warning naming it, whose reason reduces any URL to its origin, and the other servers keep their tools. Nothing retries until the client is rebuilt — at start, or when a server is switched on or off.
- **Unknown tools.** Setting the permission of a tool no connected server exposes answered success and kept nothing; `aiMcpServers:updateToolPermission` now answers 404, and `MCPServerManager.updateMCPToolPermission()` throws.
- **Breaking:** `AIResourceRegistrarOptions.mcpDirectory` and the protected `AIResourceRegistrar.loadMCP()` are removed, since the configuration sync deleted any server registered that way on its next run. Move such servers into `config.yml`. `registerAIResources()` runs tools, then Skills, then employees.
