---
'@nocobase/db': minor
---

Add `db.collections(name?)` to `DatabaseManager`

The Manager already mirrored three of the four Connection handles that work in logical names — `builder`, `query` and `repository` — but not `collections`, so reading one Collection definition from the Manager took `db.connection().collections.get('orders')` while the neighbouring handles took one call. The omission read as an accident rather than a boundary.

`db.collections(name?)` returns the very object `db.connection(name).collections` holds, so the resolution cache stays shared with every Builder, Repository and Migration on that connection. The mirroring stops at these four: `schema`, `schemaInspector` and `collectionMetadata` work in physical names or write supplemental metadata and remain Connection-only.
