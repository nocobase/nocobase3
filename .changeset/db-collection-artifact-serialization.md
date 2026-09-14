---
'@nocobase/db': minor
---

Add Collection artifact serialization, `Migrator.history()`, and skip NocoBase bookkeeping tables when listing Collections

`serializeCollectionArtifact()` and `serializeCollectionArtifactManifest()` turn one Collection's resolution, physical schema and stored metadata document into the three deterministic JSON files an application commits under `database/<connection>/collections/<name>/`, plus a connection-level manifest. Object keys are sorted and `undefined` members dropped; arrays whose order carries meaning — fields, index columns, relations — are left in resolution order, and only unordered sets such as warnings are sorted. `validateCollectionArtifactDirectoryName()` and `assertCollectionArtifactDirectoryNames()` apply the file-system rules a logical name has to satisfy to become a directory, including rejecting names that differ only by case.

`Migrator.history()` returns the applied migrations, oldest first, without creating the history table when none exists. It is what lets a read-only command record which migration a snapshot was taken after.

`connection.collections.list()` and `scan()` used to throw on any migrated database: the registry only treated the metadata store's own table as internal, so the first `__nocobase_migration_lock` or `__nocobase_migrations` table it met failed to map to a logical name. Every table under the `__nocobase_` prefix is now recognised as NocoBase's own bookkeeping and skipped.
