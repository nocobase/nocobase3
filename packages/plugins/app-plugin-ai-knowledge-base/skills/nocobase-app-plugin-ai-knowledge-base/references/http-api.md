# HTTP API Reference

## Contents

- [Common contract](#common-contract)
- [Knowledge-base actions](#knowledge-base-actions)
- [Document actions](#document-actions)
- [Segment actions](#segment-actions)
- [Vector-database actions](#vector-database-actions)
- [Compatibility caveats](#compatibility-caveats)

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

Query: pagination fields. Returns bases enriched from `aiVectorStoreConfig` with `vectorDatabaseKey`, `llmService`, and `embeddingModel` when configuration exists. Current route ignores name/key filters even though the default client sends them.

### `POST /aiKnowledgeBase:create`

JSON body is `KnowledgeBaseMutation` plus internal compatibility fields when supplied. Server default type is LOCAL when omitted, but application code should always send it. Type must be `LOCAL`, `READONLY`, or `EXTERNAL`. Generates 32-character `key`, `knowledgeBaseOuterId`, and config key when omitted; returns created record.

For non-EXTERNAL bases, a vector-store config is created only when at least one of `llmService`, `embeddingModel`, `vectorDatabaseKey`, or `vectorStoreConfigKey` is supplied. LOCAL provider defaults to `NocobaseLocalVectorStoreProvider`; READONLY to `NocobaseReadonlyVectorStoreProvider`; EXTERNAL uses `externalProvider` or an empty string.

### `POST /aiKnowledgeBase:update?filterByTk=<id>`

JSON body: partial mutation; body `id` is fallback. Missing ID returns 400. Updates vector config for supplied LLM/model/database fields, normalizes supplied segment options, and returns a record or JSON `null` if ID does not exist. It does not return 404 for that null case.

### `POST /aiKnowledgeBase:destroy?filterByTk[]=<id>`

One or more IDs required. Accepts comma-separated/repeated variants. Deletes each base's documents/files/segments/shards, then bases. Returns `{"data":{"success":true}}`. It does not refresh or explicitly delete vector-store rows.

### `POST /aiKnowledgeBase:runHitTest`

JSON body: required `knowledgeBaseKey` and non-empty/truthy `query`; optional `topK`, `score`. Missing fields return 400. `topK` is converted with `Number(value) || undefined`; `score` with `Number(value)`. Returns an array of `{id,content,score,title?,filename?,matchedQuestions,metadata}`. Validate numeric ranges application-side.

### `POST /aiKnowledgeBase:confirmVectorStoreChanged?key=<key>`

Key may be in query or JSON body. Required; sets `confirmVectorStoreChanged` to current time and returns success. No not-found check.

### `GET /aiKnowledgeBase:checkVectorStoreChanged?key=<key>`

Required key. Returns `null` if absent; otherwise `{key,changed:false,confirmVectorStoreChanged}`. Current implementation does not calculate change.

### `GET /aiKnowledgeBase:listExternalVectorStoreProviders`

Returns AI Manager provider names excluding the two built-ins. This package provides no public registration API for new names.

## Document actions

### `GET /aiKnowledgeBaseDocs:list`

Pagination plus optional `filter[knowledgeBaseKey]`. Returns documents with `accessAbility:"readWrite"`. Current route ignores title search and other caller filters.

### `GET /aiKnowledgeBaseDocs:get?filterByTk=<id>`

ID required. Returns document plus `accessAbility:"readWrite"`; 404 if absent.

### `POST /aiKnowledgeBaseDocs:upload?knowledgeBaseKey=<key>`

Two forms:

1. `multipart/form-data`: `file` required; `knowledgeBaseKey` required in query or form. Optional repeated `zipFilenameEncoding[]` is accepted by the client but not consumed by current server extraction. The route passes file name, MIME, bytes, and authenticated actor ID.
2. `application/json`: query or body `knowledgeBaseKey`; flat finalized-file fields such as `title`, `filename`, `extname`, `path`, `size`, `url`, `mimetype`, `disk`, `meta`, and optional key. This is the presigned-upload finalize contract.

Only LOCAL direct upload is explicitly enforced. Current JSON finalize does not repeat that LOCAL check. Supported lowercase extensions after normalization: `.doc`, `.docx`, `.md`, `.pdf`, `.txt`, `.zip`. Direct ZIP extracts supported non-ZIP entries and returns only the first created document. Both paths create PENDING documents and dispatch queue work before returning. Current response is a document; compatible clients also support `{taskId,message?}`.

### `POST /aiKnowledgeBaseDocs:destroy?filterByTk[]=<id>`

IDs required. Deletes segment/shard/source records/files, deletes documents, refreshes statistics for affected keys, returns success.

### `POST /aiKnowledgeBaseDocs:vectorization`

Query: optional `knowledgeBaseKey`; optional IDs as `id`, `id[]`, repeated, or comma-separated. Matching documents are dispatched. If neither is provided, all documents are selected—treat this as destructive/high-impact. Returns `{queued:<count>}`; this is queue dispatch count, not completed count.

### `GET /aiKnowledgeBaseDocs:getUploadStorage?knowledgeBaseKey=<key>`

Required existing key. Returns current compatibility payload:

```json
{
  "data": {
    "id": "default",
    "name": "default",
    "title": "Default storage",
    "type": "local",
    "rules": { "size": 104857600 }
  }
}
```

`id` is the base storage ID when present. The 100 MiB value is advertised to clients; direct server multipart does not enforce it.

### `GET /aiKnowledgeBaseDocs:getZipFilenameEncodingOptions`

Returns `{options:[{value:"utf8",label:"UTF-8",isDefault:true},{value:"gbk",label:"GBK"}]}`. No key is required by the route.

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

`key` is an alias. Missing key returns an empty array. Current relation lookup compares base `vectorStoreConfigKey` directly to the supplied vector database key, while normal configurations point through `aiVectorStoreConfig`; this can under-report relationships. Do not use it as the sole deletion safety control.

## Compatibility caveats

The endpoint set is a legacy compatibility contract. Filtering/search parameters sent by the default client are not fully implemented server-side; apply client-side filtering only for UX, never security. Several mutating segment routes ignore the supplied knowledge-base key and locate by document ID/UID. Current authorization is login-only. Wrap or harden these actions before offering them to ordinary users.
