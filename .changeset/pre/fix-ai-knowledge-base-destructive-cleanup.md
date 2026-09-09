---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-knowledge-base': patch
---

Restore AI knowledge-base cleanup and vectorization parity by removing document and shard objects with their database records, deleting vectors with the correct knowledge-base and document selectors, persisting segment edits and deletions back to shard files, tracking segment revisions during rebuilds, and allowing stale queue jobs to exit safely.
