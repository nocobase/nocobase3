---
"@nocobase/db": patch
"@nocobase/app-plugin-file": patch
---

Return BIGINT columns as exact strings before driver number conversion in Query and Repository reads. Preserve precision through aliases, relationships, streaming, transaction clients, and mutation results across the five supported databases, while normalizing Repository integer and increment fields to safe numbers.

Align the file Repository size type with exact string results from BIGINT-backed collections.
