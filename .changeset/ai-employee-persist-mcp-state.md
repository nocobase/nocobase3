---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Keep the MCP enable switch and tool permissions across restarts

The plugin kept MCP servers in an in-process repository, and every configuration sync wrote `enabled: true` back onto each server, so a server switched off in AI settings came back on at the next start. Tool permissions set there lived only in memory and reset to their defaults.

`MCPServerManager` gains `switchRepository()`, and the plugin moves it onto its `aiMcpClients` table at start, before the configuration sync. The sync now treats the enable switch as the administrator's once a server exists — `enabled` in `config.yml` applies when the server is first created, as it does for LLM services — and a tool permission is saved on its server's row, in a new `toolPermissions` column, and reloaded when the client is rebuilt. A migration adds the column.
