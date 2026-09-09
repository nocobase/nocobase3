# HTTP API Reference

## Contents

- [Common contract](#common-contract)
- [Knowledge-base actions](#knowledge-base-actions)
- [Document actions](#document-actions)
- [Segment actions](#segment-actions)
- [Vector-database actions](#vector-database-actions)

## Common contract

Base path: `/v2/api`. Route action URLs use `/<resource>:<action>`. All actions require authentication headers/cookies accepted by the App Authentication service. Missing user ID returns 401:

```json
{ "errors": [{ "message": "Authentication required" }] }
```

Success envelopes are `{"data": value}`. List helpers return:

```json
{ "data": { "data": [], "meta": { "count": 0, "page": 1, "pageSize": 20 } } }
```

Errors use `{"errors":[{"message":"..."}]}`. A thrown `status` is used; otherwise a message containing “not found” maps to 404 and other failures map to 500.

Pagination query: `page` default 1/min 1; `pageSize` default 20/min 1/max 200; `paginate=false` disables limit/offset. Lists are sorted by `-createdAt`; caller `sort` is ignored. ID readers accept `name`, `name[]`, repeated values, and comma-separated values.

Use an authenticated action client when possible:

```ts
await nocobaseClient.action('aiKnowledgeBase', 'list', {
  method: 'GET',
  query: { page: 1, pageSize: 20 },
  unwrap: 'none',
});
```

## Knowledge-base actions

### `GET /aiKnowledgeBase:list`

Query: pagination fields. Returns knowledge-base records with inline `vectorDatabaseKey`, `llmService`, and `embeddingModel`. Current route ignores name/key filters even though the default client sends them.

### `POST /aiKnowledgeBase:create`

JSON body is `KnowledgeBaseMutation`. Server default type is LOCAL when omitted, but application code should always send it. Type must be `LOCAL`, `READONLY`, or `EXTERNAL`. Generates 32-character `key` and `knowledgeBaseOuterId` when omitted; returns the created record.

LOCAL and READONLY require non-empty `vectorDatabaseKey`, `llmService`, and `embeddingModel`. Their provider defaults to `NocobaseLocalVectorStore` and `NocobaseReadOnlyVectorStore`, respectively. The three fields are normalized and stored directly on the knowledge-base record; creation computes `vectorStoreConfigHash` and initializes `vectorStoreUpdatedAt` and `confirmVectorStoreChanged` to the same time. EXTERNAL uses `vectorStoreProvider` or `externalProvider`.

### `POST /aiKnowledgeBase:update?filterByTk=<id>`

JSON body: partial mutation; body `id` is fallback. Missing ID returns 400. The server validates the existing record merged with supplied LOCAL/READONLY vector fields. When one of `vectorDatabaseKey`, `llmService`, or `embeddingModel` materially changes, it recomputes `vectorStoreConfigHash` and refreshes `vectorStoreUpdatedAt`; ordinary field updates preserve both values. Supplied segment options are normalized. Returns a record or JSON `null` if ID does not exist.

### `POST /aiKnowledgeBase:destroy?filterByTk[]=<id>`

One or more IDs required. Accepts comma-separated/repeated variants. For LOCAL bases, attempts vector deletion by `knowledgeBaseOuterId`; cleanup failures are logged and do not block deletion. Deletes documents/files/segments/shards, then bases. Returns `{"data":{"success":true}}`.

### `POST /aiKnowledgeBase:runHitTest`

JSON body: required `knowledgeBaseKey` and non-empty/truthy `query`; optional `topK`, `score`. Missing fields return 400. `topK` is converted with `Number(value) || undefined`; `score` with `Number(value)`. Returns an array of `{id,content,score,title?,filename?,matchedQuestions,metadata}`. Validate numeric ranges application-side.

### `POST /aiKnowledgeBase:confirmVectorStoreChanged?key=<key>`

Key may be in query or JSON body. Required; sets `confirmVectorStoreChanged` to current time and returns success. No not-found check.

### `GET /aiKnowledgeBase:checkVectorStoreChanged?key=<key>`

Required key. Returns `null` if absent. Otherwise compares the knowledge base's inline `vectorStoreUpdatedAt` and its vector database's `updatedAt` against `confirmVectorStoreChanged` (falling back to base creation time), and returns `{key,changed,confirmVectorStoreChanged,vectorStoreChanged,vectorDatabaseChanged,vectorStoreUpdatedAt,vectorDatabaseUpdatedAt}`. Comparisons are strict; equal timestamps are unchanged.

### `GET /aiKnowledgeBase:listExternalVectorStoreProviders`

Returns AI Manager provider names excluding the two built-ins. This package provides no public registration API for new names.

## Document actions

### `GET /aiKnowledgeBaseDocs:list`

Pagination plus optional `filter[knowledgeBaseKey]`. Returns documents with `accessAbility:"readWrite"`. Current route ignores title search and other caller filters.

### `GET /aiKnowledgeBaseDocs:get?filterByTk=<id>`

ID required. Returns document plus `accessAbility:"readWrite"`; 404 if absent.

### `POST /aiKnowledgeBaseDocs:upload?knowledgeBaseKey=<key>`

Request content type must be `multipart/form-data`. Send exactly one `file` field. `knowledgeBaseKey` is required and may be supplied in the query or as one text form field; using the query is recommended. The caller sends no file-metadata fields and no storage disk.

```bash
curl -X POST "$NOCOBASE_URL/v2/api/aiKnowledgeBaseDocs:upload?knowledgeBaseKey=$KNOWLEDGE_BASE_KEY" \
  -H "Authorization: Bearer $NOCOBASE_TOKEN" \
  -F 'file=@./manual.pdf'
```

The server resolves the knowledge base and rejects uploads unless it is LOCAL. It accepts exactly these case-normalized filename extensions: `.pdf`, `.pptx`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.xlsm`, `.txt`, `.md`, `.json`, and `.csv`. The maximum file size is 104857600 bytes (100 MiB). MIME type is recorded but does not replace the extension check.

The server selects the storage disk from the knowledge-base record, writes the uploaded bytes there, creates one document with pending processing statuses, and attempts to dispatch vectorization to the `default` queue. Success returns that single document in the normal `{"data":{...}}` envelope. Queue dispatch is not vectorization completion.

Reject malformed multipart bodies, multiple or missing file fields, a missing key, a missing/non-LOCAL knowledge base, an unsupported extension, an oversized file, a missing or disallowed configured disk, or storage failure. If metadata persistence fails after the object is written, the server attempts to delete that object and preserves the original error; cleanup failure is logged with disk and path. If queue dispatch fails after document creation, the upload still returns that document with `indexStatus:"ERROR"` and a retryable `errorMessage`, so callers must not upload the file again. Retry through the vectorization action. After a successful response, later parsing or vectorization failures are reported asynchronously by the document's `indexStatus`, `segmentStatus`, `errorMessage`, and `segmentErrorMessage`.

### `POST /aiKnowledgeBaseDocs:destroy?filterByTk[]=<id>`

IDs required. Deletes segment/shard/source records/files, deletes documents, refreshes statistics for affected keys, returns success.

### `POST /aiKnowledgeBaseDocs:vectorization`

Query: optional `knowledgeBaseKey`; optional IDs as `id`, `id[]`, repeated, or comma-separated. Matching documents are dispatched. If neither is provided, all documents are selected—treat this as destructive/high-impact. Returns `{queued:<count>}`; this is queue dispatch count, not completed count.

### `GET /aiKnowledgeBaseDocs:getUploadStorage?knowledgeBaseKey=<key>`

Required existing key. This is a safe upload-capability lookup, despite the legacy action name. It returns the fixed values needed for client-side validation:

```json
{
  "data": {
    "acceptedExtensions": [
      ".pdf",
      ".pptx",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".xlsm",
      ".txt",
      ".md",
      ".json",
      ".csv"
    ],
    "maxFileSizeBytes": 104857600
  }
}
```

The response must not expose provider credentials, upload URLs, or let the caller select or override the knowledge base's storage disk. A missing knowledge base returns 404.

## Segment actions

### `GET /aiKnowledgeBaseDocSegments:list?knowledgeBaseDocsId=<id>`

Document ID required; pagination supported. Returns segment metadata, not shard content. Current route ignores `knowledgeBaseKey`, keyword, and enabled filters sent by the default client.

### `GET /aiKnowledgeBaseDocSegments:getSegment?knowledgeBaseDocsId=<id>&segmentUid=<uid>`

Both required. Returns segment metadata merged with shard-held `{title,content,questions}`; 404 if segment or shard cannot be resolved.

### `POST /aiKnowledgeBaseDocSegments:updateSegment`

JSON: `knowledgeBaseDocsId`, `segmentUid`, optional `title`, required application-side `content`, and current `contentHash`. The route itself does not prevalidate required fields. A stale hash returns 409 `Segment content has changed`. Rewrites shard metadata/segment metadata and dispatches rebuild-only vectorization.

### `POST /aiKnowledgeBaseDocSegments:updateQuestions`

JSON: `knowledgeBaseDocsId`, `segmentUid`, `questions` array (defaults empty), and current `contentHash`. Each question shape is `{id,content,enabled,hash}`; application DTO fields other than content are optional. Rewrites segment metadata and dispatches rebuild-only vectorization. The server does not regenerate IDs/hashes for edited caller-supplied questions.

### `POST /aiKnowledgeBaseDocSegments:setEnabled`

JSON: `knowledgeBaseDocsId`, `segmentUid`, `enabled`. Missing segment returns 404. Enabled is true unless exactly false. Dispatches rebuild-only job and returns the merged segment.

### `POST /aiKnowledgeBaseDocSegments:deleteSegment`

JSON: `knowledgeBaseDocsId`, `segmentUid`. Missing segment returns 404. Deletes only the segment row, dispatches rebuild-only job, and returns success. The containing shard metadata still retains the old content entry; treat that as retained internal data until a full regeneration removes the shard.

### `POST /aiKnowledgeBaseDocSegments:regenerate`

JSON: `knowledgeBaseDocsId`, optional `segmentOptions`. When supplied, options are normalized and saved on the document. Dispatches a full job and returns success.

## Vector-database actions

### `GET /aiVectorDatabases:list`

Pagination fields; returns all records sorted newest first. The response includes `connectProps`, which may contain credentials—do not expose this action broadly.

### `GET /aiVectorDatabases:get?filterByTk=<id>`

ID required; 404 if absent. Also exposes `connectProps`.

### `POST /aiVectorDatabases:create`

JSON: `name`, optional `key`, optional `provider` default `NocobaseDefaultPGVectorProvider`, optional `databaseSpec` default `PGVector`, required provider-valid `connectProps`, optional `enabled` default true, optional `skipTableExistedCheck` default false. Before create checks the target table; existing table returns 409 with `Table "..." already exists` unless skip is true. Generates 32-character key and SHA-256 `connectPropsHash`.

### `POST /aiVectorDatabases:update?filterByTk=<id>`

ID query or body `id`; required. 404 if absent. Provider/connect props default to existing values. Validates connection fields but does not run the create-time existing-table check. Recomputes hash; returns updated record.

### `POST /aiVectorDatabases:destroy?filterByTk[]=<id>`

IDs required. Returns 409 `Vector database is used by a knowledge base` when a relation is found; otherwise deletes and returns success. Back up and verify relation consistency first.

### `GET /aiVectorDatabases:listProviders`

Returns `{name,spec}` only. Current built-in is `{name:"NocobaseDefaultPGVectorProvider",spec:"PGVector"}`; field definitions are not currently returned by this route.

### `GET /aiVectorDatabases:listEnabled`

Returns enabled vector-database records sorted by name, including `connectProps`.

### `POST /aiVectorDatabases:testConnection`

JSON: optional provider default built-in, `connectProps`. Returns `{success:true}` or `{success:false,error}` and normally remains HTTP 200. Built-in test validates fields and executes `SELECT 1`.

### `GET /aiVectorDatabases:findRelatedKnowledgeBase?vectorDatabaseKey=<key>`

`key` is an alias. Missing key returns an empty array. Relationships are resolved directly from knowledge-base records whose inline `vectorDatabaseKey` matches the supplied key.
