# Data Model

## Contents

- [Ownership](#ownership)
- [Collections](#collections)
- [Relations and deletes](#relations-and-deletes)
- [Application guidance](#application-guidance)

## Ownership

The plugin migration history initially creates six collections, then removes the legacy vector-store configuration collection. The final schema owns five collections. `llmServices` belongs to the AI Employee package. Migrations are immutable historical records once merged; ordinary applications must not edit them.

## Collections

### `aiKnowledgeBase`

Auto-increment `id`; nullable timestamps; required `knowledgeBaseType` (32), `knowledgeBaseOuterId` (64), `name` (64), and `vectorStoreProvider` (128); nullable unique `key` (128), description (512), and `disk` (128). LOCAL/READONLY vector configuration is stored directly in nullable `vectorDatabaseKey` (128), `llmService`, and `embeddingModel` (128), with nullable `vectorStoreConfigHash` (64), `vectorStoreUpdatedAt`, and `confirmVectorStoreChanged`. `vectorStoreProps` is nullable JSON. Required JSON `segmentOptions` defaults to `{enabled:true,chunkSize:6000,chunkOverlap:1200}`. Counts default 0; `enabled` defaults true.

### `aiKnowledgeBaseDocs`

Auto-increment `id`; nullable timestamps/creator/updater; nullable unique `key`; nullable title, filename, extension, size, MIME, path, URL, preview, storage ID, and `knowledgeBaseKey`. JSON `meta` defaults `{}`. `indexStatus` is required. Counts default 0; nullable `segmentVersion`; `segmentRevision` defaults 0; nullable segment status/error/update time; required segment options with the same default; enabled defaults true.

### `aiKnowledgeBaseDocSegmentShards`

Auto-increment `id`; required knowledge-base key, document ID, shard number, segment version/count, and content hash. File metadata is nullable except JSON `meta` defaults `{}`. Unique `(knowledgeBaseDocsId, segmentVersion, shardNo)`; indexes on document ID and knowledge-base key.

### `aiKnowledgeBaseDocSegments`

Auto-increment `id`; required UID, knowledge-base key, document ID, shard ID/number, content key, position, content hash, character length, and segment version. Optional outer ID/title/preview; question count defaults 0; enabled defaults true; JSON `meta` defaults `{}`. Unique `(knowledgeBaseDocsId, uid)`; indexes on `(knowledgeBaseDocsId, position)`, knowledge-base key, shard ID, and enabled.

### `aiVectorDatabases`

Auto-increment `id`; nullable unique key; required name, database spec, provider, JSON `connectProps`; optional connection hash; enabled defaults true.

## Relations and deletes

The migrations declare indexes/uniques but no foreign-key constraints. Relationships and deletion order are application logic. The final structural migration removes the legacy configuration fields and collection irreversibly without reading or copying their data.

Knowledge-base deletion attempts to remove LOCAL vectors by `knowledgeBaseOuterId`, deletes its documents, segment rows, shard files/rows, and source files, then removes the base. Document deletion removes LOCAL vectors by document ID before deleting dependent artifacts. Vector-database deletion is blocked by directly querying knowledge bases whose inline `vectorDatabaseKey` matches the database key.

## Application guidance

Do not perform ordinary CRUD directly on these tables: it bypasses key generation, normalization, queue dispatch, file/shard cleanup, vector rebuilding, statistics, conflict checks, and connection validation. Use the public service or authenticated actions.
