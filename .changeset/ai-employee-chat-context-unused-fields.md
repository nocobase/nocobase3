---
'@nocobase/ai-employee': minor
---

Remove the `AIChatContext` fields `LLMProvider` never read, and the unused `AIChatContextOptions`

**Breaking (types only):** `AIChatContext.systemPrompt`, `AIChatContext.decisions` and `AIChatContext.middleware` are removed, and so is the `AIChatContextOptions` type. `LLMProvider.invoke()`, `stream()` and `prepareChain()` never read those fields, so a value passed there was dropped without a word, and nothing has used `AIChatContextOptions` since `getChatContext()` was removed. Give a direct call its system prompt as a `role: 'system'` message at the start of `messages`; resume a paused run with `AgentService.resumeInvoke()` and its `userDecisions`, and give an agent middleware through the AI Employee plugin's agents. Code that set these fields or named the type stops compiling and should drop them; nothing it did changes.
