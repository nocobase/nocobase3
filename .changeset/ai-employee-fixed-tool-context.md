---
'@nocobase/app-plugin-ai-employee': patch
---

Fix the agent context backend tools run with, and resolve an employee's model through its own policy

A backend tool that declares `requiresContext` used to receive whatever the caller placed in `AgentRequest.context.agentContext`. Every call site therefore built that context itself — `AIConversationService` did it three times and `SubAgentsDispatcher` a fourth — and a request could substitute another actor, session, or set of services for the one the agent was created with.

`AgentContextProvider` now exposes `toolRuntimeContext()`. `AgentServiceFactory` builds the context once, from `actor`, `translate`, `getHeader` and the new `execution`/`state` options, and `AgentService` supplies it on every execution after spreading the request, so an `agentContext` key on a request is ignored. `createAIEmployee()` and `createAgent()` accept `execution` and `state`, and `createAgent()` also accepts `actor`, `translate` and `getHeader`; a tool that needs the session id, the current messages or the model reads them from the agent state rather than from request data.

`AIEmployeeAgentContextProvider` no longer rejects a request that selects no model. It applies the employee's own model policy to `AgentRequest.model`, so a request may ask for a model but only one the employee allows is honoured, and an integration no longer has to pre-resolve a model to work around the missing-model error.

An `AgentContextProvider` implemented outside this package has to add `toolRuntimeContext()`; a provider that returns nothing makes every tool with `requiresContext` fail.
