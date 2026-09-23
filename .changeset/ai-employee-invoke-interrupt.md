---
'@nocobase/app-plugin-ai-employee': patch
---

Record and report a human-in-the-loop interrupt from `AgentService.invoke()`

A tool that needs a reviewer's approval pauses the run. `stream()` handled that: it marked the paused tool calls as `interrupted`, stored the interrupt id on their assistant message, and emitted `interrupt_requested`. `invoke()`, `resumeInvoke()` and `forkInvoke()` did none of it. A top-level graph reports an interrupt by returning it in its state rather than by throwing, and `invoke()` read only the answer out of that state, so the interrupt was dropped. The tool calls stayed in `init`, a decision sent to `updateUserDecision` matched nothing, a resume could not rebuild its command, and the caller received the tool-calling assistant turn as though it were a finished answer. This affected `sendMessages` and `resendMessages` with `stream: false`.

`invoke()` now records the interrupt the same way `stream()` does, and `AgentInvokeResult` reports it as `interrupt: { id, actions }`, which is absent when the run finished. Resume by passing `interrupt.id` as `userDecisions.interruptId`. Each paused tool call is recorded against its own conversation, including one paused inside a sub-agent. The sub-agent's saved message is found through the writer, which still forwards every event to the caller's writer. A nested agent still rejects with the `GraphInterrupt` for its parent to record, and that error is now recognised with LangGraph's `isGraphInterrupt`.

`AgentInvokeInterrupt` and `AgentInterruptAction` are exported from the package entry. The plugin's Skill no longer says that an interrupted `invoke()` rejects.
