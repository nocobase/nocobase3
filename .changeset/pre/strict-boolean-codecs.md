---
'@nocobase/db': patch
---

Enforce strict boolean Repository inputs and consistent boolean results across database drivers, including variables, filters, unique selectors, cursors, returning, relations, grouping, and streaming. Report invalid stored representations instead of silently coercing them. Reject non-portable boolean value aggregates before issuing database queries; boolean counting remains supported.
