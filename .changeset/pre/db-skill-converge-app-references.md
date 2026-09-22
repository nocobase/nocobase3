---
'@nocobase/app-skills': minor
---

Hand the database API back to the `nocobase-db` Skill and keep the application side here.

The application development Skill carried its own account of the database API because the package published none. Now that `@nocobase/db` ships a Skill of its own, two copies would drift, and the copy here had already fallen behind: it documented QueryAdapter but not Repository, and its seed example wrote rows through `query` when a seed context now defaults to `repository`.

So the three database references keep what the application owns — where `database/<connection>/` sits, what `pnpm db:apply`, `db:reset` and `db:repair` do, how additional connections configure their tasks, legacy directory migration, checksum drift, compiled manifests, the task `config` reader, dialect packages and their fields, driver installation and native binaries — and point to the package's Skill for the API the files are written against. `migrations.md` loses the migration and seed examples, the field builders, the alter operations and the naming rules; `database-and-data.md` keeps resolving the manager, where data access belongs in an application, and generated IDs.
