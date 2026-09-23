---
'@nocobase/app-plugin-ai-employee': patch
---

Export `AgentServiceError` from the server entry

An agent rejects with `AgentServiceError`, and whether to retry is read from its `code` and `retryable`. The class and its `AgentServiceErrorCode` union were not exported from `@nocobase/app-plugin-ai-employee/server`, and a deep import is not a supported path, so a caller could neither check `instanceof` nor switch on the code with a checked type. Both are now exported beside the other agent call types.
