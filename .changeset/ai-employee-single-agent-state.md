---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Carry one AgentState from the route, and replace each decided field in one place

`ConversationTurn` and `AgentState` had come to hold the same nine fields, and `toAgentState()` copied one into the other by hand. Two names for one thing is a concept to carry and a mapping to keep in step: a field added to `AgentState` reached neither the turn nor the copy, silently.

`AgentState` is now the only one. `parseAgentState()` builds it where the request body is parsed, it travels unchanged through `AIConversationService`, and each field that is not the request's to decide is replaced exactly once and where the decision belongs: `AgentServiceFactory` replaces `model`, having resolved it against the employee's policy, and `SubAgentsDispatcher` replaces `sessionId`, because a sub-agent runs in its own conversation. `ConversationTurn` and `toAgentState()` are gone, `CreateEmployeeOptions` takes `state` instead of `turn` and `sessionId`, and `dispatch-sub-agent-task` hands its own `ctx.state` over whole rather than rebuilding it field by field.

`AgentState.sessionId` is required. A conversation is known by the time an agent exists — the route validates it, a fixed agent generates one — so a tool no longer reads it as possibly absent, and `AIConversationService` takes it from the state rather than as a parameter beside it.

`ConversationTransport` stays separate, and still stops at the conversation service: what an execution is and how its output reaches the caller are not the same thing.

A consumer building an `AgentState` supplies `sessionId`. One that passed `turn` or `sessionId` to `createAIEmployee()` passes `state`.
