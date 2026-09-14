---
"@nocobase/db": patch
"@nocobase/repository-input": patch
---

Support exact BIGINT and DECIMAL string filters, validate plain integer writes before SQL execution, and preserve numeric atomic-update operands without floating-point promotion. Reject SQLite int64 arithmetic overflow before storage and retain native PostgreSQL/MySQL read and aggregate behavior.
