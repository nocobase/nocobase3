---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Name the sub-agent handoff messages for what they are, and set them only when there is a handoff

`AgentState.messages` and `ConversationTurn.messages` looked like a third history channel beside the checkpointer and `AgentRequest.userMessages`, and every turn filled them. They are neither. Their one reader in the whole workspace is `dispatch-sub-agent-task`, and their one purpose is a single flow: when a user ignores a sub-agent's pending tool call and sends a new message, `sendMessages` resumes the main agent with the tool decisions alone, so that message never enters the main graph. It reaches the dispatch tool through the agent state instead, which hands it to the sub-agent as `appendMessages`. The message is answering the sub-agent's pending question, so it belongs to that conversation and is persisted there.

Both fields are now `handoffMessages`, and `AIConversationService` fills them only on that path. `isInterrupted()` and `reject()` move ahead of `createAIEmployee()` — both are repository work needing no agent — so the service knows whether a handoff is happening before it decides what the agent's state carries. Every other turn leaves the field empty, including a resend, whose messages are this call's input and nothing more.

An ordering problem disappears with it. The agent used to be created before `cancelToolCall()` prepended the cancelled-tool continuation, so `state.messages` silently omitted messages that `userMessages` carried. That branch no longer puts messages in the state at all, so there is nothing left to disagree.

`sendMessages` takes the incoming messages as its own parameter rather than on the turn, alongside `sessionId`, `aiEmployee` and `stream`. `SubAgentTask.messages` is `handoffMessages` too, and the dispatch tool stops handing the same array over twice — it rode both the task and the sub-agent's turn, while `SubAgentsDispatcher` resolved them with a fallback that could never fire.

A tool reading `ctx.state.messages`, or a caller passing `messages` on a `ConversationTurn`, uses `handoffMessages`.
