---
'@nocobase/db': major
---

Remove the `syncMetadata` execution option from CollectionBuilder. Executed schema changes always validate and synchronize supplemental metadata so logical field types, relations, and optimistic locking remain available to data input and output. Legacy calls that pass the removed option now fail before DDL; remove the option to migrate.
