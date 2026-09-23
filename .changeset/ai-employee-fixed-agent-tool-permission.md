---
'@nocobase/app-plugin-ai-employee': patch
---

Pause a fixed agent on a tool that asks

`createAgent()` handed its tools to the graph without resolving their permission, so a tool declaring `defaultPermission: 'ASK'` — or declaring nothing, which means the same — ran straight away. An employee agent resolves the same tool to a pause, so the one tool behaved differently depending on which factory method built the agent, and the one without a reviewer was the one that skipped review.

Its tools now run unattended only when they declare `ALLOW`, the fallback an employee agent uses for a tool with no preset. A fixed agent also gets a checkpointer, without which a pause could not be recorded or resumed: the plugin's own checkpoint tables when it uses the default persistence, and an in-process saver beside a persistence the caller supplied. A paused run reports `interrupt` from `invoke()` and continues through `resumeInvoke()`, as an employee agent's does.
