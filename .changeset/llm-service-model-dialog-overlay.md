---
'@nocobase/app-plugin-ai-employee': patch
---

Fix the LLM service model dialog overlay leaving the page header uncovered. Its backdrop had no `z-index`, so the surface layout's `sticky z-40` header painted over it and stayed interactive while the dialog was open. It now sits at `z-50`, matching every other dialog in the plugin.
