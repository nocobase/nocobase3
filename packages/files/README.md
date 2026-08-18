# @nocobase/files

`@nocobase/files` is a thin, headless Files Kernel. It owns upload sessions, immutable file metadata, temporary delivery URLs, explicit deletion, authorization ports, and host-invoked maintenance. Applications own business relations and editable UI.

It does not provide folders, tags, search, versions, sharing, copy/move/rename, Multipart, TUS, a file manager, legacy NocoBase compatibility, or automatic deletion of referenced ready files.

```text
App-owned Registry source
          |
          v
@nocobase/portal-sdk/files
          |
          v
/api/files/v1 -> Hono router -> services -> Authorizer
                                      |-> injected Kysely
                                      `-> Local or S3 driver
```

## Configuration

Private configuration stays in the Core Host. Values below are placeholders.

```ts
const config = {
  defaultPolicy: "attachment",
  backends: {
    local: { driver: "local", root: "./var/files", signingSecret: "replace-with-at-least-32-random-characters" },
    objectStore: {
      driver: "s3", endpoint: "https://objects.example.invalid", region: "us-east-1",
      container: "private-files", rootPrefix: "production", forcePathStyle: false,
      credentials: async () => ({ accessKeyId: "example", secretAccessKey: "example" }),
    },
  },
  policies: {
    attachment: { backend: "local", description: "Attachments", maxSize: 10_000_000, allowedContentTypes: ["image/*", "application/pdf"], uploadUrlTtlSeconds: 300, defaultReadUrlTtlSeconds: 60, maxReadUrlTtlSeconds: 300 },
  },
};
```

`GET /config` returns only policy limits and capabilities. It never returns roots, endpoints, regions, containers, prefixes, credentials, signing secrets, storage keys, provider state, actors, or workspaces.

## Mounting

```ts
const files = createFilesModule({ db, config, requestContext, authorizer, drivers });
app.route("/api/files/v1", files.router);
```

The request-context resolver must obtain the authenticated actor and workspace from trusted host state. The injected Authorizer is called for every upload, metadata read, URL creation, and delete. Body and query identity fields are not trusted.

## Upload sequence

```text
POST /uploads + Idempotency-Key
        -> uploadId, fileId, short-lived PUT target
PUT target with exactly the returned headers
POST /uploads/:uploadId/complete
        -> ready FileObject
```

Retry the same logical upload with the same Idempotency-Key. Persist only `fileId`; never persist a target URL, temporary read URL, physical key, or provider URL. File content is immutable: replacement creates a new `fileId`.

## API

| Method | Path | operationId |
| --- | --- | --- |
| GET | `/api/files/v1/config` | `filesGetConfig` |
| GET | `/api/files/v1/files/:fileId` | `filesGetFile` |
| POST | `/api/files/v1/uploads` | `filesCreateUpload` |
| PUT | `/api/files/v1/uploads/:uploadId/content` | `filesUploadProxyContent` |
| POST | `/api/files/v1/uploads/:uploadId/complete` | `filesCompleteUpload` |
| POST | `/api/files/v1/files/:fileId/url` | `filesCreateUrl` |
| DELETE | `/api/files/v1/files/:fileId` | `filesDeleteFile` |

Local delivery uses an internal capability route. Temporary URLs expire, are bound to one file/workspace/action, and stop working after deletion.

Errors use `FILES_*` codes, including `FILES_INVALID_REQUEST`, `FILES_FORBIDDEN`, `FILES_FILE_NOT_FOUND`, `FILES_UPLOAD_NOT_FOUND`, `FILES_UPLOAD_EXPIRED`, `FILES_UPLOAD_INCOMPLETE`, `FILES_FILE_TOO_LARGE`, `FILES_CONTENT_TYPE_NOT_ALLOWED`, `FILES_FILE_SIZE_MISMATCH`, `FILES_CHECKSUM_MISMATCH`, `FILES_IDEMPOTENCY_KEY_REUSED`, `FILES_CONFLICT`, and retryable `FILES_STORAGE_UNAVAILABLE`.

## Maintenance

The package never starts a timer. A Core Host scheduler calls the two distinguishable phases:

```ts
const expired = await files.maintenance.expireUploads({ now: new Date(), limit: 100 });
const deleted = await files.maintenance.deletePendingObjects({ limit: 100 });
// or: const { expiredUploads, deletedObjects } = await files.maintenance.runOnce({ expireLimit: 100, deleteLimit: 100 });
```

Both phases return `scanned`, `succeeded`, `retried`, `failed`, and `skipped`. Cleanup uses database records and CAS claims, calls `deleteObject` for an exact key, treats not-found as success, and is idempotent. It never lists a bucket or selects a ready file. The host owns cron frequency, leader election, job infrastructure, metrics, shutdown, and log routing.

See [INTEGRATION.md](./INTEGRATION.md) and [SECURITY.md](./SECURITY.md).
