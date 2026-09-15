---
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Add a `database connections` reference to the application development Skill, covering how to switch the database and add a connection.

Nothing documented this. `database-and-data.md` states in its first line that it is about reading and writing rows at runtime, and `migrations.md` covers per-connection migrations without saying how a connection comes to exist — so of the eight dialects the runtime supports, only SQLite was reachable from the documentation.

The new page covers why a dialect is registered in `server/config/database.ts` rather than configured in `config.yml`, the four steps to switch the default connection, a table of every dialect with its package, native driver, default port and connection fields, which drivers need an `allowBuilds` entry, and the fact that switching does not carry data across. It is routed from `SKILL.md` and `AGENTS.md` in each template.

It also records a current limitation: `kingbase`, `oceanbase` and `dameng` resolve at runtime but do not satisfy `AppDatabaseConnectionConfig`, whose union in `@nocobase/db` still lists only the original five dialects, so configuring one needs a type assertion until that union is widened.
