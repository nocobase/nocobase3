---
'@nocobase/app-plugin-ai-employee': patch
---

Correct the Skill where it still describes the agent contracts this release changed

The `nocobase-app-plugin-ai-employee` Skill ships with the package and synchronizes into an installed application's `.agents/skills/`, so an agent building against it writes what it says. It said several things this release makes untrue, and a tool written from it would not have compiled: `ctx.logger` and `ctx.translate` are `ctx.runtime.logger` and `ctx.runtime.translate`, `ctx.state.messages` is `handoffMessages`, `ctx.state.sessionId` is always present, and `ctx.state.model` is a resolved `{ llmService, model }` rather than loose data.

`references/agent-service.md` carried the same problem at the factory and provider boundaries. `CreateAIEmployeeOptions` listed seven fields that no longer exist and omitted the two that are now required; `CreateAgentOptions` still had `username` and optional `sessionId`, `actor` and `runtime`; `AgentRequest` still carried `model` and `context`; and `AgentContextProvider` was documented with `toolRuntimeContext()` and a `resolveLLM(request)` that takes an argument. The prose around them described a model policy applied to each request and a context assembled from `execution`/`state`, neither of which is how it works now.

Each contract is corrected against the shipped types, and the rules around them say where the decision is made instead: the model is resolved once when the agent is created, the actor is required because there is no implicit root, and a request cannot swap what the agent was created with.
