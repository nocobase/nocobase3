---
'@nocobase/app-plugin-ai-employee': minor
---

Require a session on every `/api/ai` action, and AI settings access behind the settings page

**Breaking.** Every `/api/ai` action now requires a signed-in session and answers 401 without one; the actor is read from that session. The actions that configure AI — `llmServices`, `aiMcpServers`, the management actions of `aiEmployees`, `aiTools` and `aiSkills`, and `ai:listProviderModels` — also require access to the AI settings page (`page:ai.settings`) and answer 403 without it. The chat stays open to every signed-in user: conversations, files, `aiEmployees:listByUser` and `updateUserPrompt`, `ai:listAllEnabledModels` and `ai:listLLMServices`.

- **LLM services are configured in `config.yml`.** `llmServices:create`, `update` and `destroy` are removed; the settings page changes a configured service through `llmServices:updateEnabled` and `llmServices:updateEnabledModels`, which answer 404 for an unknown name. On the client, `updateLLMService()` becomes `updateLLMServiceEnabled()` and `updateLLMServiceEnabledModels()`.
- **MCP connection tests.** `aiMcpServers:testConnection` tests a configured server by `name`, or an inline `http` or `sse` server; an inline `stdio` server is rejected.
- **File previews.** `aiFiles:preview` returns a file to the user who uploaded it; anyone else, and any file with no recorded uploader, needs AI settings access — not a root flag or a role name on the session. The file's record is authorized before its content is opened, so a refused request reads nothing from storage.
- **Data tools.** They authorize as the user with every subject the authorization service resolves, so a collection granted through a team is readable by the assistant as it is on the page.

Upgrading: an account that manages AI needs AI settings access; code calling `updateLLMService()` switches to the two narrower functions; and a stdio server is tested by its configured `name`.
