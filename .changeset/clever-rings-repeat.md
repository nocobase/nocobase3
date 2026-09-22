---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Say what `enabledModels` actually constrains. The documentation said "the configured name set is authoritative" in a paragraph that mixed MCP server reconciliation with LLM service reconciliation, which read as though the model list were an enforced whitelist. It is not: it scopes the model selector, `ai:listAllEnabledModels`, and the fallback `resolveModel()` picks when a caller names no model, while a caller that does name a model is never checked against it. The paragraph is split into the section it belongs to and the list's reach is stated explicitly.
