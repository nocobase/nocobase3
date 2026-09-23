---
'@nocobase/app-plugin-ai-employee': patch
---

Show and send the models an employee is limited to

An employee's model settings in AI settings limit which models it runs on, and the server replaces any other model with the first of them. The chat ignored those settings: its selector listed every enabled model and opened on the first one overall, so it showed one model while the answer came from another, and choosing a model the employee did not allow changed nothing. For an employee with its own model settings the chat now offers only those models, in the employee's order, opens on the first, and sends the one it shows. An employee whose listed models are all disabled keeps the full list.

Applications that copied the `nocobase-ai` Registry item get the change by updating it.
