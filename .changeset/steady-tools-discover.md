---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Refactor AI employee tool discovery around an execution-scoped `DiscoveredTools` result that owns the registered tool map and dynamic active-tool whitelist, and simplify chat context system prompt resolution to accept only conversation messages.
