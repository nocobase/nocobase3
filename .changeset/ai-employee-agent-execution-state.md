---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Describe one agent execution with one `AgentState`, built where the request is parsed

A conversation request used to be unpacked four times on its way to an agent. The route parsed the body into a `ConversationExecution`, `AIConversationService` parsed the same body again, assembled that execution plus a hand-written state plus flat `webSearch`, `frontendTools` and `sessionId` options, and the factory merged all three through a fallback chain. The session, the messages, the message id, the model, the web-search flag and the frontend tools each had four homes, the model was resolved twice, and `ConversationExecution` carried the SSE target and abort signal beside them, so transport travelled with data an agent was meant to read.

There is one `AgentState` now. `parseAgentState()` builds it where the body is parsed, it reaches `createAIEmployee()` whole, and each field that is not the request's to decide is replaced exactly once, where the decision belongs: `AgentServiceFactory` replaces `model`, having resolved it against the employee's own policy, and `SubAgentsDispatcher` replaces `sessionId`, because a sub-agent runs in its own conversation. `ConversationTransport` carries the stream target, the abort signal, `translate` and `getHeader`, and stops at the conversation service.

`AgentState` is tighter for it. `sessionId` is required — a conversation is known by the time an agent exists — and `model` is `{ llmService, model }` rather than `Record<string, unknown>`, checked at the route like every other field of the body, so a tool reads a resolved reference instead of narrowing loose data back. `messages` is `handoffMessages`, named for the one thing it does: when a user ignores a sub-agent's pending tool call and sends a new message, the main agent resumes on the tool decisions alone, so that message never enters the main graph and reaches the sub-agent through the state instead. It answers the sub-agent's pending question, so it is persisted in that conversation. Every other turn leaves the field empty.

`AgentRequest` keeps only what varies per call: `userMessages`, `userDecisions`, `messageId`, `writer`, `signal`, and `runtime` for the middleware channel that carries `appendMessages`. `model` and `context` are gone, and `AgentContextProvider.resolveLLM()` takes no argument, reading the model from the agent's own state — so a request can no longer ask for a model the employee never allowed. A request that selects none is still resolved rather than rejected.

`AIConversationService` takes the few fields each action reads rather than the whole request body, and `SubAgentsDispatcher` receives the dispatching agent's state to inherit.

A caller passing `execution`, `state`, `sessionId`, `webSearch` or `frontendTools` to `createAIEmployee()` passes `state`. One reading `ctx.state.messages` reads `ctx.state.handoffMessages`. One setting `model` or `context` on an `AgentRequest` puts the model in the state and middleware data in `runtime`.
