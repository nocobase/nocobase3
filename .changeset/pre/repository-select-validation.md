---
'@nocobase/db': patch
---

Validate malformed Repository Select structures before traversing them, returning structured Select diagnostics instead of native type errors and rejecting invalid projections before writes.
