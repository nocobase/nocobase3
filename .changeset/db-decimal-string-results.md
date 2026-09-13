---
"@nocobase/db": patch
---

Return DECIMAL fields as database-formatted decimal strings across Query and Repository,
including aliases, scalar subqueries, grouped fields, relation records, streaming,
mutation results, and MIN/MAX. Preserve PostgreSQL/MySQL native strings and
avoid numeric metadata lookups and redundant text projections on these drivers.
Use PostgreSQL RETURNING without a decimal-specific reload. Enforce mysql2
`decimalNumbers: false` to preserve precision, including when driverOptions requests numbers. Other drivers project
decimal text before number conversion while preserving numeric filtering and ordering. Avoid SQLite
text formatting truncating stored significant digits; SQLite REAL storage remains
approximate. Synchronous Query.compile does not resolve field metadata and may
omit decimal result projections added during execution on other drivers.

Preserve the declared logical type of implicitly generated belongsTo foreign
keys so Oracle integer references are not decoded as decimal strings.
