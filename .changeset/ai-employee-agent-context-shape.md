---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Give an execution one context, and name it once

`AgentContext` held `logger`, `translate` and `getHeader` loose beside `actor`, `state` and `deps`, as if the six were one kind of thing. They are three: `actor` and `state` say what the execution is, `deps` is what the tool asked for, and the other three are what the host lends it while it runs. Those three are `AgentRuntime`, reached as `ctx.runtime`.

The context a tool is built with is `agentContext`, one name where the codebase had used three, and a property rather than a method because it is fixed when the AgentService is created and never recomputed — which is also what stops a request substituting another actor, session or set of services for the one the agent was created with. It is typed `AgentContext`, so nothing narrows it back on the way to `buildTool`. `AppAgentContext`, an alias that carried no type information, is gone; its uses are `AgentContext` from `@nocobase/ai-employee`.

`CreateEmployeeOptions` takes that execution whole — `state` and `runtime` — instead of listing `sessionId`, `translate` and `getHeader` beside a logger the factory chose. `CreateAgentOptions` requires `sessionId`, `actor` and `runtime` rather than generating a session, falling back to the application's logger, and treating a missing actor as root. `CreateEmployeeOptions` requires its `actor` for the same reason: both filled a missing one in with `{ id: 0, roles: [], isRoot: true }`, so an agent created without an actor ran as root and nothing at the call site said so. Every caller knows who the agent runs as, and an implicit root is not a default worth having. Its `username` is gone: it reached `CurrentConversation.username`, which names the assistant role an employee agent has and a fixed agent does not, and nothing ever set it. `AIEmployeeAgentContextProviderOptions` stops restating six fields its `agentContext` already holds, deriving the session, actor, web-search flag, frontend tools, language and headers from it, so two records of one value can no longer come apart. It also takes `aiEmployeesManager` rather than a closure bound to its `resolveModel`, since the provider already holds the employee and already depends on four other managers directly.

One inconsistency fell out with them: the system prompt read the timezone straight from the `x-timezone` header while every tool read the one `parseAgentState()` resolved, so a timezone sent in the request body was honoured by `query-data` and ignored by the prompt. Both read the state now.

An `AgentContextProvider` implemented outside this package exposes an `agentContext` property and drops the argument from `resolveLLM()`. A tool reading `ctx.logger`, `ctx.translate` or `ctx.getHeader` reads them from `ctx.runtime`.
