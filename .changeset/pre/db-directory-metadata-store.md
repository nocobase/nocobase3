---
'@nocobase/db': minor
---

Add `DirectoryCollectionMetadataStore` and a declarative `metadataStore` configuration

`DirectoryCollectionMetadataStore` reads supplemental Collection metadata from a Collection artifact directory — one `<name>/metadata.json` per Collection, in the format `serializeCollectionArtifact()` writes — so the files an application commits are the metadata source for a connection whose schema it does not own. It is read-only, like the Module store, and treats a missing directory or a `null` document as no metadata.

A connection's or the top-level `metadataStore` may now be given declaratively as `{ type: 'directory', directory }` instead of an instance; `createDatabaseManager` resolves it when the connection is first created. An instance still passes through, and an external connection without a store at either level still raises `CollectionMetadataStoreRequiredError`.
