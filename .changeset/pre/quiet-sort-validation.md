---
'@nocobase/db': patch
---

Validate malformed Repository Sort ASTs before inspecting their nodes or requiring a nonempty sort. Invalid structures now return INVALID_SORT instead of silently falling back to default ordering or raising native TypeErrors.
