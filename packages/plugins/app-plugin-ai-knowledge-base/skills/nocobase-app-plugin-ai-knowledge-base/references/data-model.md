# Data Model

## Contents

- [Ownership](#ownership)
- [Collections](#collections)
- [Relations and deletes](#relations-and-deletes)
- [Application guidance](#application-guidance)

## Ownership

The plugin migration owns six collections. `llmServices` belongs to the AI Employee package. The migration is an immutable historical record once merged; ordinary applications must not edit it.

## Collections

### `aiKnowledgeBase`

Auto-increment `id`; nullable timestamps; required `knowledgeBaseType` (32), `knowledgeBaseOuterId` (64), `name` (64), `vectorStoreProvider` (128); nullable unique `key` (128), description (512), `disk` (64), `vectorStoreConfigKey` (128), `vectorStoreConfigId` (64), confirmation timestamp, and JSON `vectorStoreProps`. Required JSON `segmentOptions` defaults to `{enabled:true,chunkSize:6000,chunkOverlap:1200}`. Counts default 0; `enabled` defaults true.

### `aiKnowledgeBaseDocs`

Auto-increment `id`; nullable timestamps/creator/updater; nullable unique `key`; nullable title, filename, extension, size, MIME, path, URL, preview, storage ID, and `knowledgeBaseKey`. JSON `meta` defaults `{}`. `indexStatus` is required. Counts default 0; nullable `segmentVersion`; `segmentRevision` defaults 0; nullable segment status/error/update time; required segment options with the same default; enabled defaults true.

### `aiKnowledgeBaseDocSegmentShards`

Auto-increment `id`; required knowledge-base key, document ID, shard number, segment version/count, and content hash. File metadata is nullable except JSON `meta` defaults `{}`. Unique `(knowledgeBaseDocsId, segmentVersion, shardNo)`; indexes on document ID and knowledge-base key.

### `aiKnowledgeBaseDocSegments`

Auto-increment `id`; required UID, knowledge-base key, document ID, shard ID/number, content key, position, content hash, character length, and segment version. Optional outer ID/title/preview; question count defaults 0; enabled defaults true; JSON `meta` defaults `{}`. Unique `(knowledgeBaseDocsId, uid)`; indexes on `(knowledgeBaseDocsId, position)`, knowledge-base key, shard ID, and enabled.

### `aiVectorDatabases`

Auto-increment `id`; nullable unique key; required name, database spec, provider, JSON `connectProps`; optional connection hash; enabled defaults true.

### `aiVectorStoreConfig`

Auto-increment `id`; nullable unique key; required name and embedding model; optional vector database key/ID and LLM service; enabled defaults true.

## Relations and deletes

The migration declares indexes/uniques but no foreign-key constraints. Relationships and deletion order are application logic. Migration down drops config, vector databases, segments, shards, documents, then knowledge bases.

Knowledge-base deletion explicitly deletes its documents, segment rows, shard files/rows, and source files, then the base. Document deletion performs the same dependent cleanup. Vector rows for a deleted document are removed only when vector-store rebuild/delete is reached; current direct document deletion does not explicitly call the vector store, so orphaned external vector rows are a deployment risk. Vector-database deletion is blocked when a base is detected as related by its configured key.

## Application guidance

Do not perform ordinary CRUD directly on these tables: it bypasses key generation, normalization, queue dispatch, file/shard cleanup, vector rebuilding, statistics, conflict checks, and connection validation. Use the public service or authenticated actions.
