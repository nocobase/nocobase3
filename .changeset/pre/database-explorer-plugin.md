---
'@nocobase/app-plugin-database-explorer': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
---

Add a read-only Database Explorer plugin and enable it in the Default and Examples templates.

The Settings page browses the application's database connections, the collections on each one, and their fields and physical columns. The two detail panes are child routes and the selection rides in the query string, so any view can be linked to and is restored by browser Back.

Read-only means the plugin creates, alters or drops no collection and changes no row. One qualifier: reading a collection initializes the collection registry, whose metadata store creates `__nocobase_collection_metadata` on a managed connection when it is missing, so that one bookkeeping table is the only object a read can bring into existence — and only when the first NocoBase activity against a database is an Explorer read. External connections cannot reach that path. A test states this boundary against a real database rather than assuming it.

Listing connections reads configuration and opens no database, so one unreachable external connection cannot take down the page. A connection reports its dialect, schema management, logical database, schemas, naming options, and internal tables, and never its credentials, host, port, socket path, or SQLite file — enforced as an allow-list, so a field a new dialect introduces stays inside by default. Driver errors are withheld from responses and recorded in logs by classification only, never by message or cause.

The collections list follows the server's cursor to the end so its client-side search sees every collection, and says so when a connection exceeds the bound.

Every endpoint requires `page:database-explorer/access`, the grant the page and both of its panes declare, which the seeded System Administrator permission set covers.
