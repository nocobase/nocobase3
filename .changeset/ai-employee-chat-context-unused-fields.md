---
'@nocobase/ai-employee': minor
---

Remove the `decisions` and `middleware` fields that `LLMProvider` never read

**Breaking (types only):** `AIChatContext.decisions` and `AIChatContext.middleware` are removed. `LLMProvider.invoke()`, `stream()` and `prepareChain()` never read either, so a value passed there was dropped without a word: a direct model call has no pause to resume and no middleware pipeline. Resume a paused run with `AgentService.resumeInvoke()` and its `userDecisions`, and give an agent middleware through the AI Employee plugin's agents. Code that set these fields stops compiling and should drop them; nothing it did changes.
