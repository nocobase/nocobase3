# Vector Databases

## Contents

- [Built-in provider](#built-in-provider)
- [Mutation and validation](#mutation-and-validation)
- [Vector-store configuration](#vector-store-configuration)
- [Change and deletion safety](#change-and-deletion-safety)

## Built-in provider

Provider name is case-sensitive: `NocobaseDefaultPGVectorProvider`. Spec/default database spec is `PGVector`.

```ts
type PgConnectProps = {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  tableName: string;
};
```

Host/user/database/table must be non-empty; port is coerced to a positive integer; password is optional. Table allows one optional schema prefix and must match `^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$`.

The provider uses a `pg.Pool` cached by SHA-256 of all props. Connection test executes `SELECT 1`. Creation checks `SELECT 1 FROM <table> LIMIT 1`; undefined table/schema SQLSTATEs mean safe to create, existing table returns status 1. `skipTableExistedCheck:true` bypasses the check and can attach to/overwrite assumptions about existing data; require explicit confirmation.

The LangChain store uses columns `id`, `vector`, `content`, `metadata`, cosine distance, and similarity normalization.

## Mutation and validation

`VectorDatabaseMutation` requires name, provider, and connect props at the public client boundary; key/databaseSpec/enabled/skip are optional. Create defaults key (32-char nanoid), database spec PGVector, provider built-in, enabled true, and stores a SHA-256 JSON hash of connection props.

Update preserves existing provider/connect props when omitted, validates props, recomputes hash, and does not test connectivity or table existence. Always call `testVectorDatabaseConnection` before an update and perform a retrieval smoke test afterward.

Provider listing currently returns only name/spec, so the public `fields` property is supported by the client mapper but not populated by this server route. Do not invent provider UI fields beyond the built-in contract.

## Vector-store configuration

LOCAL/READONLY knowledge bases store `vectorDatabaseKey`, `llmService`, and `embeddingModel` directly on `aiKnowledgeBase`. A stable SHA-256 `vectorStoreConfigHash` covers exactly those three normalized values; incomplete configuration yields `null`. Built-in providers receive `knowledgeBaseKey`, reload the inline configuration, and share the underlying vector store by hash.

Vector rebuild proceeds only for LOCAL bases. It creates embeddings through AI Manager, initializes PGVector, deletes vectors filtered by document ID, and adds enabled paragraph/question documents in batches of 10. Missing knowledge bases, incomplete inline configuration, or missing vector databases fail explicitly.

Changing database/model/service does not automatically rebuild. `vectorStoreUpdatedAt` changes only when the normalized three-field configuration changes. The change-status endpoint also compares the related vector database's `updatedAt` against the last confirmation timestamp. Applications should show explicit impact confirmation and schedule selected re-vectorization.

READONLY search can read an existing store without writing; ensure its metadata/content contract matches expected result mapping. EXTERNAL provider execution is outside this package's public extension boundary.

## Change and deletion safety

Connection props and their hash are stored in plugin data; hash is not encryption. Keep API access administrative and credentials secret.

Before deleting a vector database:

1. inspect all bases whose inline `vectorDatabaseKey` points to the database;
2. back up vector data/connection config;
3. disable or migrate dependent bases;
4. confirm retrieval against the replacement;
5. delete with explicit approval;
6. verify no queued job still targets it.

The relation lookup and destroy guard both query knowledge bases directly by inline `vectorDatabaseKey`. Keep deletion approval and queued-job checks because an application-level relation check is not a database foreign-key constraint.
