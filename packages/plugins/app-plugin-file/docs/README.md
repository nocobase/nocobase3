# File Repository manual

The File plugin provides Client and Server Repository managers, upload orchestration, and configurable resource/content routes. It also ships an editable [component-ui Registry recipe](../registry/component-ui/README.md). The App owns the database schema, resource configuration, business relations, and access policy.

Start with the [App integration Skill](../skills/nocobase-app-plugin-file/SKILL.md), which includes collection, route, service, and Registry examples.

## Public entries

| Entry                 | Capabilities                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ./server              | Default Server plugin, ServerFileRepositoryManager, serverFileRepositoryManagerToken, defineFileRepositoryApiRoutes, FileRepositoryError, and related types           |
| ./client              | Default Client plugin factory, ClientFileRepositoryManager, clientFileRepositoryManagerToken, ClientFileRepository, ClientUploadOptions, and shared file/upload types |
| Registry component-ui | FileUploadField, FileList, FileThumbnail, FilePreviewField, FilePreviewDialog, and local UI types                                                                     |

Register the core on both runtimes before business consumers. The core owns no collections, migrations, resource routes, pages, or locales. The independent [app-file-example](../../../examples/app-file-example/README.md) owns the attachments example. Registering that example creates Server contributions regardless of whether its development page is visible.

## Collections

Every file collection needs id, disk, key, filename, ext, mimeType, size, createdAt, and updatedAt. The ID must be a unique UUID-compatible primary key. String/char/text fields, integer/bigInt sizes, and datetime/datetimeTz timestamps are supported. There is no field mapping.

Upload creates a UUID and a storage key under objects/, normalizes the filename, chooses a lowercase extension of at most 32 alphanumeric characters, validates storage size, and writes UTC timestamps. Zero-byte files are allowed. Additional required business fields need defaults because uploads do not accept extra values. contentUrl is derived and never stored.

## Resource routes

The route factory returns an API contribution plus a root content contribution. Merge both into the App's routes. Configuration:

| Field      | Default                     | Meaning                                   |
| ---------- | --------------------------- | ----------------------------------------- |
| name       | Required                    | Client API resource name                  |
| collection | name                        | Database collection name                  |
| connection | Default database connection | Server-only connection selection          |
| disk       | Required                    | Configured upload disk                    |
| accessPath | /uploads/name               | App-local content prefix, outside /api    |
| accessMode | stream                      | stream or redirect; no automatic fallback |
| actions    | Required                    | Explicitly exposed Repository actions     |

An accessPath must start with a slash and contain static alphanumeric, underscore, or hyphen segments without a trailing slash. Duplicate or nested content paths within one declaration are rejected. The App prevents collisions between different contributions.

| Method/path                                      | Behavior                                                    |
| ------------------------------------------------ | ----------------------------------------------------------- |
| POST /api/name:findMany                          | Query, including async NDJSON iteration                     |
| POST /api/name:findOne                           | Read one record                                             |
| POST /api/name:count, exists, aggregate, groupBy | Ordinary Repository operations                              |
| POST /api/name:createOne, updateOne              | Metadata only; server writePolicy defaults to deny          |
| POST /api/name:deleteOne                         | Delete metadata, retaining the physical object              |
| POST /api/name:uploadOne                         | Upload one native File and create metadata                  |
| POST /api/name:uploadMany                        | Upload a nonempty File array and create metadata in a batch |
| GET accessPath/uuid.ext                          | Look up metadata, verify extension, and deliver the object  |

Only configured actions are exposed. There are no createMany/updateMany/deleteMany HTTP actions. Upload is independent of createOne permission. File routes preserve the underlying Repository protocol and server write policies.

Content URLs omit the dot for extensionless files. HTTP responses restore the host's publicBasePath once, for example /main/uploads/attachments/uuid.txt. Queries must select id and ext to receive contentUrl. Never prepend /api or persist a generated URL.

stream returns complete bytes with Content-Disposition: attachment, Content-Type, Content-Length, nosniff, and a sandbox policy. redirect uses the record's own disk/key, returning a public storage URL or a five-minute signed URL. Unsupported URL generation reports STORAGE_URL_UNAVAILABLE. Both modes use private, no-store caching; missing records/objects return 404.

## Services

Resolve the original service tokens from the current App container. Server repository() takes the collection name plus disk/accessPath and optional connection. It preserves local database Repository operations; getUrl is synchronous, while getStorageUrl is asynchronous. Direct Server CRUD does not add URLs, but uploads do.

Client repository() takes the resource name and reuses the existing API Client. uploadOne returns record, createdTargets, and optional version; uploadMany returns createdCount and records. Client uploads accept an optional second argument with an AbortSignal. Abort does not undo a commit already performed by the server. React uses the existing App useService hook, not a separate file hook or session store.

## Limits and failures

Multipart uses the field file, repeated for batches. The Client builds FormData and its boundary. Default request-body limits are 5 MiB single and 20 MiB batch, including multipart overhead. Direct Server uploads have no HTTP size limit; Registry maxSize is only a per-file UI check.

| Error                                       | HTTP status | Next step                                         |
| ------------------------------------------- | ----------- | ------------------------------------------------- |
| BODY_TOO_LARGE                              | 413         | Reduce request bytes or change the declared limit |
| INVALID_FILE / INVALID_FILES                | 400         | Send native File values and a nonempty batch      |
| INVALID_MULTIPART / UNSUPPORTED_MEDIA_TYPE  | 400 / 415   | Correct the body and content type                 |
| INVALID_FILE_COLLECTION                     | 500         | Correct the collection migration before retrying  |
| INVALID_FILE_METADATA                       | 500         | Check stored metadata and size                    |
| STORAGE_URL_UNAVAILABLE                     | 500         | Use a capable disk or stream mode                 |
| FILE_COMMIT_UNCERTAIN / FILE_CLEANUP_FAILED | 500         | Reconcile database and storage before retrying    |

Upload compensates newly written objects on failure when it can establish that metadata did not commit. When commit status cannot be confirmed, it retains the objects and reports failure. There is no cross-storage/database atomic transaction or idempotency key.

## Current limitations

Routes do not include authentication, authorization, row ACL, or an access-token protocol. A private disk, UUID, writePolicy, or login page is not route authorization. Apply the App-owned access policy described in the [Skill](../skills/nocobase-app-plugin-file/SKILL.md#api-routes).

There is no Range/206, ETag, conditional download, resumable upload, physical deletion policy, orphan reconciliation, MIME content sniffing, or malware scan. Client preview requirements and bearer-only content policies are described in the Registry guide. Existing legacy File tables and installed Registry copies require explicit App migration; the plugin does not mutate them automatically.
