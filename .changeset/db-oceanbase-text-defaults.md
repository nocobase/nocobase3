---
'@nocobase/db-oceanbase': patch
---

A text field's `defaultValue` reaches the OceanBase table. OceanBase builds tables through the same Knex MySQL compiler, which drops any default on a TEXT or BLOB column without a warning, so a row inserted below the Repository failed on a NOT NULL text column with "Field doesn't have a default value". Like the MySQL dialect, it now gives a `text`, `tinytext`, `mediumtext` or `longtext` column with a string, number or boolean default the expression form `default ('…')` when a Collection is created and when a field is added or altered. A table created before this keeps its column as it is.
