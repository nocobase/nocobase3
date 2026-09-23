---
'@nocobase/app-plugin-ai-employee': patch
---

Report a missing model at agent creation as a configuration error

`createAIEmployee()` and `createAgent()` resolve the model when the agent is created, and a failure there was thrown as a plain `Error`, while the same failure during an execution arrives as an `AgentServiceError` with `code: 'CONFIGURATION_ERROR'`. A caller that checks `instanceof AgentServiceError` to decide whether to retry treated the two differently. Both factory methods now reject with `CONFIGURATION_ERROR`, whose `rootMessage` keeps the original message. `createAgent()` resolves its model and service completely at creation; `createAIEmployee()` fails there only when the employee has no usable model at all, and a model whose service cannot run still fails when the agent runs, with the same code.
