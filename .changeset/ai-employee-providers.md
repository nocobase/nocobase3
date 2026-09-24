---
'@nocobase/ai-employee': minor
'@nocobase/app-plugin-ai-employee': patch
---

Fix provider attachments, direct provider calls, and web search on a provider that cannot search

- **Attachments.** DeepSeek received no images, and a user dropping a screenshot was told the type is unsupported; images now go to the model as content blocks. Ollama failed the whole turn on a PDF; it now sends images as content blocks and documents through the document loader.
- **Web search that cannot search.** `subAgentWebSearch` asked for built-in search and invoked the model even on a provider that ignores the request, which then answered from training data with sources that looked real, reported as success. It now checks `supportWebSearch` and `webSearchModels` first, and returns an error naming what did not happen and what to use instead.
- **Tools on a direct call.** `LLMProvider.prepareChain()` — and so `invoke()` and `stream()` — built `context.tools` with each tool's position in the list where its context belongs, and never resolved its `dependencies`. `AIChatContext` gains an optional `toolContext` (`{ agentContext, container? }`), and tools are built with the new `buildAgentTools()`, giving each the context and resolved `deps` an agent does; `createToolContext()` and `ToolRuntimeContext` are exported beside it, and the plugin's agents use the same function. Without `toolContext` a tool that requires a context fails when called. Built-in web search is meant for a call without tools: passing both now logs a warning, and binding is otherwise unchanged.
- **Breaking (types only).** `AIChatContext.systemPrompt`, `decisions` and `middleware`, which a provider never read, are removed, and so is the unused `AIChatContextOptions`. A direct call's system prompt is a `role: 'system'` message at the start of `messages`; a paused run is resumed through `AgentService.resumeInvoke()`.
