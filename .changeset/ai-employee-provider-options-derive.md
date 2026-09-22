---
'@nocobase/app-plugin-ai-employee': patch
---

Stop restating on the provider's options what its agent context already holds

Six of `AIEmployeeAgentContextProviderOptions`' fields were the values `agentContext` was built from, handed over a second time: `sessionId` is `state.sessionId`, `webSearch` is `state.webSearch`, `frontendTools` is `state.frontendTools`, `actor` is `actor`, and `translate` and `getHeader` are the runtime's. The provider copied each into a field of its own at construction, so two records of one value could come apart with nothing to catch it.

They are gone. The provider derives all six from `agentContext` through private getters, `AgentServiceFactory` stops passing them, and what is left on the options is what the context genuinely does not carry: the employee, its managers and repositories, the conversation identity, and the conversation-level `systemMessage` and `skillSettings`.

One inconsistency fell out with them. The system prompt read the timezone straight from the `x-timezone` header, while `parseAgentState` had already resolved it as the request body's value falling back to that header, and every tool reads the resolved one. A caller that sent a timezone in the body got it honoured by `query-data` and ignored by the prompt. The prompt reads `state.timezone` now, so both agree.

A caller constructing `AIEmployeeAgentContextProvider` puts those six on the `agentContext` it passes.
