---
'@nocobase/app-server': minor
---

Add `generateAppCollectionsArtifact()` for writing and checking Collection artifacts

Reads every Collection a managed connection resolves and writes it under `database/<connection>/collections/<name>/` as `collection.json`, `metadata.json` and `schema.json`, with a `_manifest.json` per connection recording the dialect and the last applied migration. Connection selection follows the migration and seed commands: the default connection, `connection` for one, or `all` for every managed connection with external ones reported as skipped.

Each Collection's files are staged and swapped in as a unit, directories of Collections that no longer exist are removed, and entries the generator does not own make it fail rather than delete them. `check: true` compares the generated result with the files on disk and reports each difference as missing, stale or unexpected without writing anything, which is what a CI step runs.

Nothing here is read back at runtime; the files are derived output for developers, documentation and AI tooling. See `internal-docs/app-collections-artifact-design.md`.
