---
'@nocobase/app-plugin-ai-knowledge-base': patch
'@nocobase/app-template-default': patch
---

Refactored the AI knowledge-base server around property-cached repository, manager, and service factories; added complete AI feature provider registries, authenticated `/api` and `/v2/api` routes, lifecycle-managed vectorization and PGVector resources, and a standardized Server registration entry.
