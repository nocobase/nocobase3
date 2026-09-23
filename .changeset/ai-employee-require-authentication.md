---
'@nocobase/app-plugin-ai-employee': patch
---

Require a signed-in session on every `/api/ai` action, and AI settings access on every action behind the settings page

Every `/api/ai` action now runs behind `authentication.required()` and answers 401 without a session, before the service initializes. The actor is read from the session that middleware verified.

The actions that configure AI — `llmServices`, `aiMcpServers`, the `list`, `get`, `getTemplates`, `create`, `update` and `destroy` actions of `aiEmployees`, `aiTools` and `aiSkills`, and `ai:listProviderModels` — also require access to the AI settings page, the same `page:ai.settings` check the tool and skill management reads already made, and answer 403 without it. Chat actions are unchanged for every signed-in user: conversations, files, `aiEmployees:listByUser` and `updateUserPrompt`, `ai:listAllEnabledModels` and `ai:listLLMServices`.

LLM services are defined in `config.yml` `ai.llmServices`, and the API now says so. `llmServices:create`, `update` and `destroy` are gone; the settings page's two changes are `llmServices:updateEnabled` (`{ name, enabled }`) and `llmServices:updateEnabledModels` (`{ name, enabledModels }`), each changing one field of a configured service and answering 404 for a name that is not configured. On the client, `updateLLMService()` is replaced by `updateLLMServiceEnabled()` and `updateLLMServiceEnabledModels()`.

`aiMcpServers:testConnection` tests a configured server by `name`, using only that server's configuration, and answers 404 for an unknown name. Without a name it tests an inline `http` or `sse` server; an inline `stdio` server is rejected with 400, since its command has to come from `config.yml`. `MCPTestValues` on the client is `{ name }` or a remote `transport` with its `url`.

Upgrading: a caller that reached `/api/ai` without signing in now receives 401; an account that manages AI without access to the AI settings page now receives 403 and needs that access granted; code calling `updateLLMService()` switches to the two narrower functions; and a stdio server is tested by its configured `name`.
