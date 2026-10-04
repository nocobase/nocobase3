---
'@nocobase/ai-employee': patch
---

Depend on `zod` 4 directly, so the OpenAI and LangChain packages it builds on resolve to one copy of zod and their types agree. Without it, a workspace whose other packages use zod 4 could install LangChain against zod 4 and the `openai` client against zod 3, which fails type checking.
