---
'@nocobase/app-plugin-ai-employee': patch
---

Give `AgentService.invoke()` a result contract, and let a request ask for a structured answer

`invoke()`, `resumeInvoke()` and `forkInvoke()` returned `Promise<unknown>`. A caller that needed the answer had to reverse-engineer the underlying graph state and reach into `result.messages`, which is not a contract: the state also carries the keys this package's own middleware contributes, so adding a middleware would have changed what every caller received. This package did it too — `SubAgentsDispatcher.extractLastMessageText(result: any)` read `result.messages.at(-1).content` to get a sub-agent's answer.

The three now return `AgentInvokeResult`, holding the assistant turn as `message` in the same `AIMessageInput` shape the rest of this API uses, converted by the same converter that persists it. The graph state stays internal. `message` is `null` when the execution produced no assistant content.

"Return a JSON object" is the common need outside a chat UI, and the capability was already there one layer down: `LLMProvider.prepareChain` has applied `withStructuredOutput` for a long time, but nothing above it could ask for one. `AgentInvokeRequest` now takes a `responseFormat` Zod schema, which is passed to the agent, and the value comes back as `structuredResponse`, typed from the schema and absent when no schema was supplied. Only `invoke()` accepts it: `stream()` reports the answer as content events and has nowhere to put a structured value.

`AgentRequest`, `AgentInvokeRequest`, `AgentInvokeResult` and `AgentStreamEvent` are exported from the package entry, so an integration can name them without deep-importing a source file.

This also repairs an error path. `executeInvoke` and `executeStream` call `provider.parseResponseError(error)` while reporting a failure; a provider that does not implement it made the error handler throw a `TypeError` that replaced the failure being reported. The call is now guarded, which is how the conversion failure behind this change was found at all.

A caller that read `result.messages` from `invoke()` reads `result.message` instead, and gets this package's message shape rather than a LangChain `BaseMessage`.
