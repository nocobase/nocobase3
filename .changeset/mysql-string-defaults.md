---
'@nocobase/db-mysql': patch
'@nocobase/db-oceanbase': patch
---

The schema inspector reads back the default of a character, enum or temporal column as the value it was given. MySQL and OceanBase report a literal default as the bare text, `draft` rather than `'draft'`, which was taken for an expression, so a resolved Collection lost every such default: a defaulted NOT NULL string or enum field was listed as required in the API document's create schema, and a default such as `'42'` or `'NULL'` read back as a number or as null.
