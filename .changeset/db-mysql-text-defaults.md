---
'@nocobase/db-mysql': patch
---

A text field's `defaultValue` reaches the MySQL table. Knex compiles a column default as a literal and drops any default on a TEXT or BLOB column without a warning, because MySQL accepts one there only in the expression form `default ('…')`, available since 8.0.13. A Repository still filled the value in, but a row inserted any other way — a migration's `query`, another service, a SQL prompt — failed on a NOT NULL text column with "Field doesn't have a default value". The MySQL dialect now gives a `text`, `tinytext`, `mediumtext` or `longtext` column with a string, number or boolean default the expression form `default ('…')`, through the new `schema.columnDefault` hook of `@nocobase/db`, when a Collection is created and when a field is added or altered. A table created before this keeps its column as it is: run an alteration that redeclares the field to give it the default.
