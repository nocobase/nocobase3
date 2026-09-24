---
'@nocobase/ai-employee': minor
'@nocobase/app-plugin-ai-employee': minor
---

Give an agent execution one state, one context and a result contract

**Breaking.** An agent execution is now described once and reached through public types:

- **One `AgentState`.** `parseAgentState()` builds it where the request body is parsed, and it reaches `createAIEmployee()` whole. `sessionId` is required, `model` is `{ llmService, model }`, and `messages` is `handoffMessages`, the message a sub-agent receives when the user answers its pending question with a new turn. `AgentServiceFactory` replaces `model` once, against the employee's own policy, and `SubAgentsDispatcher` replaces `sessionId` for a sub-agent's own conversation. `AgentRequest` keeps only what varies per call — `userMessages`, `userDecisions`, `messageId`, `writer`, `signal`, and `runtime` for middleware data — so a request can no longer ask for a model the employee does not allow.
- **One `AgentContext`**: `actor`, `state`, `deps`, `runtime` (the host's `logger`, `translate` and `getHeader`) and `availableSkills`. `ai`, `database`, `repositories` and `services` are gone. A tool declares the container tokens it needs in `dependencies` and reads them, resolved and typed, from `ctx.deps`; a token the container cannot resolve fails the run naming the tool and the token. The context is bound when a tool is built, so an `agentContext` key on a request reaches nothing. The data tools declare an authorized, read-only reader rather than the database.
- **Required identity.** `CreateEmployeeOptions` and `CreateAgentOptions` require `actor` and `runtime`, and `createAgent()` requires `sessionId`; neither fills in an implicit root any more. `CreateEmployeeOptions.tools`, which nothing could fill, is removed: an employee's tools come from its own `skillSettings`, narrowed by the conversation's `skillSettings`.
- **A result contract.** `invoke()`, `resumeInvoke()` and `forkInvoke()` return `AgentInvokeResult`: the assistant turn as `message` in this package's `AIMessageInput` shape, or `null`; `structuredResponse` when the request passes a Zod `responseFormat`; and `interrupt: { id, actions }` when a tool paused the run for approval. An interrupted `invoke()` records the paused calls as `stream()` does, so a decision can be attached to them and the run resumed with `interrupt.id`.
- **A conversation to run in.** `AIConversationsManager.create()` resolves to `CreatedAIConversation`, whose `sessionId` is a `string`.
- **Exports.** `AgentRequest`, `AgentInvokeRequest`, `AgentInvokeResult`, `AgentInvokeInterrupt`, `AgentInterruptAction`, `AgentStreamEvent` and `CreatedAIConversation` are exported from `@nocobase/app-plugin-ai-employee/server`.

Migrating: pass `state` and `runtime` to `createAIEmployee()` instead of `sessionId`, `webSearch`, `frontendTools` or `execution`; read `ctx.runtime.logger` rather than `ctx.logger`, and `ctx.state.handoffMessages` rather than `ctx.state.messages`; declare a token in `dependencies` wherever a tool read `ctx.ai`, `ctx.database`, `ctx.repositories` or `ctx.services`; pass the bound context as `buildTool(entity, ctx)`'s second argument; read `result.message` rather than `result.messages`; and pass an `actor` everywhere one was left out.
