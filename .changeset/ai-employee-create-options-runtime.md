---
'@nocobase/app-plugin-ai-employee': patch
---

Take the execution's runtime whole when creating an agent

`CreateEmployeeOptions` listed `translate` and `getHeader` loose, and `AgentServiceFactory` assembled an `AgentRuntime` out of them and its own logger at each construction site. A caller could name only two of the three, so which logger an agent's tools would write to was the factory's to decide rather than the caller's to say.

Both options take `runtime: AgentRuntime` now, required for `createAIEmployee` and optional for `createAgent`, which falls back to the application's logger because a fixed agent serves no request. `SubAgentExecutionOptions` takes the same, and `dispatch-sub-agent-task` hands its own `ctx.runtime` over whole, as it already does with `ctx.state`: a sub-agent inherits both what the execution is and what the host lent it. `AIConversationService` builds one runtime per action and passes it to the agent and to its own tool context alike.

A caller passing `translate` or `getHeader` to `createAIEmployee()`, `createAgent()` or `SubAgentsDispatcher.run()` passes `runtime` instead.
