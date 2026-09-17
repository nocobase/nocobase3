---
'@nocobase/app-plugin-ai-employee': patch
---

Fix AI conversation keyword searches failing with a SQL binding error. Use native repository substring filters with literal wildcard escaping while preserving user and scope isolation and conversation ordering.
