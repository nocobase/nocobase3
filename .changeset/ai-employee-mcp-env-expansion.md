---
'@nocobase/app-plugin-ai-employee': patch
---

Expand `${NAME}` in MCP server configuration

`ai.mcpServers` is documented to take environment placeholders the way `ai.llmServices` does, and it is the only place MCP can be configured, so a bearer token has nowhere else to come from. Nothing expanded them: `syncConfiguredMCPServers` passed the configuration straight to the manager, the MCP options renderer only stringifies, and `@nocobase/config` has no interpolation of its own. A header written as `Authorization: Bearer ${SEARCH_MCP_TOKEN}` was sent to the server with those characters in it, and the failure arrived as an authentication error from a third party rather than as anything pointing at the configuration.

Configured MCP servers now pass through the same `expandEnvironmentReferences` the LLM services use, so headers, `args`, `env`, and `url` resolve identically in both blocks. A missing variable still becomes an empty string, which is the existing behaviour for LLM services.
