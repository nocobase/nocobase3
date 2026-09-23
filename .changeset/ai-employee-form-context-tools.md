---
'@nocobase/app-plugin-ai-employee': patch
---

Keep an employee's tools when a message carries a form

When a message's context referenced a form and no task narrowed the tools, the chat sent `skillSettings: { tools: ['formFiller'] }`. The server reads a non-empty `tools` list as an allowlist and the chat stores it on the conversation, so for the rest of that conversation the employee could use only `formFiller` and the system tools — every tool of its own, such as an App tool checking for duplicates, was hidden. The chat now adds `formFiller` only to a task's own tool list, and leaves settings without one unchanged, so `formFiller` stays available through the employee's tools as before. Installed copies of the `nocobase-ai` Registry item need upgrading to pick this up.
