---
'@nocobase/app-plugin-ai-employee': patch
---

Call the context an agent binds its tools with by one name

The same `AgentContext` went by three names on the way to a tool: `toolRuntimeContext` on the provider contract and its two options, `runtimeContext` on the fields holding it, and `baseToolContext` where `AgentService` read it back. It is `agentContext` everywhere now.

`AgentContextProvider.toolRuntimeContext()` becomes the `agentContext` property. It was already a value fixed when the AgentService is created and never recomputed, which is what the rename made plain: a class cannot hold a field and a method of one name, and the choice between them settled it. It is also typed `AgentContext` rather than `unknown`, so `AgentService` no longer narrows what it hands to `buildTool`.

`FixedAgentContextOptions.agentContext` is required, as the employee provider's already was. Both providers were handed one at every construction site; the optional half only existed to let `state()` fall back to an empty object, which a required session had already made impossible.

An `AgentContextProvider` implemented outside this package replaces its `toolRuntimeContext()` method with an `agentContext` property.
