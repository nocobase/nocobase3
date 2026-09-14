---
'@nocobase/app-server': minor
---

Read an external connection's metadata from `database/<connection>/collections` by default

An `external` connection that configures no `metadataStore` — on the connection or at the top level — now reads `database/<connection>/collections/*/metadata.json` through a `DirectoryCollectionMetadataStore`, so an existing database can be connected from `config.yml` alone. `metadataStore` also accepts a directory as a plain string, resolved against the application root, for metadata kept elsewhere.

`generateAppCollectionsArtifact()` treats `metadata.json` as the source on such a connection: regenerating only normalizes its formatting, and when the database no longer has a Collection the generated files are removed while `metadata.json` is kept and reported under `orphans`. The generator resolves each connection's directory through the same `resolveAppCollectionsDirectory()` the store default uses. A connection's configured migration and seed `tableName` and `lockTableName` are passed to `@nocobase/db` as `internalTables`, so a custom-named history table is not reported as a Collection or written as an artifact.
