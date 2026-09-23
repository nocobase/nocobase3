---
'@nocobase/app-plugin-ai-employee': minor
---

Remove the MCP directory option from `AIResourceRegistrar`

**Breaking:** `AIResourceRegistrarOptions.mcpDirectory` and the protected `AIResourceRegistrar.loadMCP()` hook are removed. MCP servers are defined only in `config.yml` under `ai.mcpServers`, and the configuration sync deletes any server it does not find there, so a server registered from a directory was removed again on the next sync. Move such definitions into `config.yml`; a subclass that overrode `loadMCP()` should drop the override. `registerAIResources()` now runs tools, then Skills, then employees.
