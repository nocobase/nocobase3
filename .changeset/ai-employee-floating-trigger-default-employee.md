---
'@nocobase/app-plugin-ai-employee': patch
---

Open a floating chat on the chat's `defaultEmployee`

`AIChatFloatingTrigger` picked its own employee — its `aiEmployee`, or else the first employee — and never read `defaultEmployee` from the `AIChatProvider` it opens, so a page that set `defaultEmployee` alone opened on the built-in `atlas`. A trigger without `aiEmployee` now leaves the choice to the chat, which uses its `defaultEmployee`; an explicit `aiEmployee` still wins. `AIEmployeeTaskTrigger.aiEmployee` is optional for the same reason.

`AIChatProvider` also falls back to `defaultEmployee` rather than the first employee when its initial selection cannot be found. That selection is made on the first render, and a chat mounted before the employees had loaded ended up on the first employee even with `defaultEmployee` set.

Applications that copied the `nocobase-ai` Registry item get the change by updating it.
