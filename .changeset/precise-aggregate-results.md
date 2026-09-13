---
"@nocobase/db": patch
"@nocobase/repository-input": patch
---

Unify aggregate result types using native PostgreSQL/MySQL behavior. COUNT returns a safe integer number and rejects values above Number.MAX_SAFE_INTEGER. SUM/AVG of integer, BIGINT and DECIMAL fields return database-formatted strings; FLOAT/DOUBLE SUM/AVG return numbers. MIN/MAX preserve field result types. Do not strip trailing zeros. Preserve nulls, numeric filtering, ordering, grouping, aliases and relation aggregates.

Remove PostgreSQL AVG input casts and accept native computation and rounding. SQL Server promotes integral SUM/AVG inputs to DECIMAL(38,0), retains native DECIMAL precision rules, and preserves exact outputs before driver conversion. SQLite retains exact aggregates for integral/decimal fields while floating fields use native aggregation. Prepare aggregate field information only on adapters that need it, once per execution; PostgreSQL/MySQL do not load collections for numeric adaptation. Broaden shared SUM/AVG TypeScript results to string | number | null.
