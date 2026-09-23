---
'@nocobase/app-plugin-ai-employee': patch
---

Send from a chat that mounted before the AI configuration loaded

An `AIChatProvider` rendered before the employees and models had loaded looked ready once they arrived but dropped every message without an error. Its stored employee was a placeholder that never updated, which the send rejected, and its cached chat asked for the context through a snapshot of the configuration taken while both lists were still empty. The stored employee now follows the one the chat resolves, and the chat reads the current configuration on every send. Mounting behind a readiness check remains the recommended pattern.

Applications that copied the `nocobase-ai` Registry item get the change by updating it.
