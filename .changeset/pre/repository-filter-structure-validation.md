---
'@nocobase/db': patch
---

Validate Repository Filter callback results, groups, nodes, field paths and relation quantifiers before traversal. Malformed inputs now return structured Filter diagnostics before executing queries or mutations, instead of throwing native errors or treating unknown relation quantifiers as existence checks.
