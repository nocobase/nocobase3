---
'@nocobase/db': patch
---

Recognize physical FLOAT columns as numeric fields so Repository numeric filters work for SQLite decimal, float and double columns emitted by Knex. Preserve the existing MSSQL FLOAT-to-double mapping.
