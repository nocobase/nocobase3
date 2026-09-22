---
'@nocobase/app-plugin-ai-employee': patch
---

Drop the unreachable per-conversation tool injection list

`CreateEmployeeOptions.tools` and the `tools` it set on `AIEmployeeAgentContextProvider` were an injection source: names merged into the candidate tool set alongside the employee's own `skillSettings.tools` and `enabledTools`. Nothing ever filled it. It was read from `conversation.options.tools`, and no code writes that key — `AIConversationsManager.update()` accepts only `systemMessage`, `skillSettings`, `conversationSettings` and `modelSettings`, both callers of `create()` pass the same subset, `AIConversationsOptions` does not declare it, and the schema is created fresh by migration rather than carried over, so no stored row holds one either.

It could not have worked even when filled, because the per-conversation `skillSettings.tools` filter runs afterwards: a name injected but absent from that filter was discarded again by `isToolSelected()`, so the two lists cancelled each other for every name but a system tool.

What an employee may use is therefore decided in one place — its own `skillSettings`, narrowed by the per-conversation `skillSettings` filter — and `getAIEmployeeTools()`, `getEligibleToolNames()` and `conversationAgentOptions()` each lose a merge that could only ever add nothing. A caller passing `tools` to `createAIEmployee()` puts those names in the employee's `skillSettings` instead; `CreateAgentOptions.tools`, which names the tools a fixed agent loads, is unaffected.
