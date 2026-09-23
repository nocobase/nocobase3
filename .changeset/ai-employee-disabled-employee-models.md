---
'@nocobase/app-plugin-ai-employee': patch
---

Never run an employee on a disabled model

When every model an employee's model settings list had been disabled, the chat fell back to the full model list and sent a model from it, while the server ran the first listed model regardless of whether it was still enabled — the displayed and the running model disagreed again. The server now picks only from the listed models that are enabled, and rejects with a configuration error when none are. The chat offers the same list, so for such an employee it offers no model and cannot send until one is enabled again.

Applications that copied the `nocobase-ai` Registry item get the client half of the change by updating it.
