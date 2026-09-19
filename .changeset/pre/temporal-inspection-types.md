---
'@nocobase/db': patch
---

Distinguish instant-bearing physical columns from local date-times during schema inspection, retain PostgreSQL offset times as native types, and expose fractional-second precision separately from numeric precision and column length.
