---
'@nocobase/ai-employee': minor
'@nocobase/app-plugin-ai-employee': patch
---

Build a direct provider call's tools the way an agent builds them

`LLMProvider.prepareChain()` — and so `invoke()` and `stream()` — built `context.tools` without any context: each tool received its position in the list where its context belongs, and its declared `dependencies` were never resolved. `AIChatContext` gains an optional `toolContext` (`{ agentContext, container? }`), and the tools are now built with the new `buildAgentTools()`, which gives each tool the context and resolved `deps` an agent does; `createToolContext()` and `ToolRuntimeContext` are exported alongside it, and the AI Employee plugin's agents use the same function. Without `toolContext` a tool is built with no context, and one that requires a context fails when called with "Agent context is required". Binding is unchanged, including alongside built-in web search, which now logs a warning when tools are passed with it, since web search is meant for a call without tools.
