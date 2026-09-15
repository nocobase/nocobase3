---
'@nocobase/app-plugin-database-explorer': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
---

Add a read-only Database Explorer plugin and enable it in the Default and Examples templates.

The Settings page browses the application's database connections, the collections on each one, and their fields and physical columns. It writes nothing: there is no write endpoint, and a test pins the physical schema and every row as unchanged across each read.

Listing connections reads configuration and opens no database, so one unreachable external connection cannot take down the page. A connection reports its dialect, schema management, logical database, schemas, naming options, and internal tables, and never its credentials, host, port, socket path, or SQLite file — enforced as an allow-list, so a field a new dialect introduces stays inside by default.

Every endpoint requires `page:database-explorer/access`, the grant the navigation entry already declares, which the seeded System Administrator permission set covers.
