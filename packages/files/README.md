# @nocobase/files

The Files Kernel is a thin, headless contract and service boundary. It owns file policy, metadata, upload sessions, temporary URLs, deletion, authorization, and reliability primitives. It does not own folders, tags, search, business attachments, versions, sharing, UI, legacy NocoBase storage APIs, or a complete S3 API.

```text
Registry -> Portal SDK -> /api/files/v1 -> @nocobase/files
                                      -> injected DB, Authorizer, drivers
```

| Method | Path | operationId |
| --- | --- | --- |
| GET | `/api/files/v1/config` | `filesGetConfig` |
| GET | `/api/files/v1/files/:fileId` | `filesGetFile` |
| POST | `/api/files/v1/uploads` | `filesCreateUpload` |
| PUT | `/api/files/v1/uploads/:uploadId/content` | `filesUploadProxyContent` |
| POST | `/api/files/v1/uploads/:uploadId/complete` | `filesCompleteUpload` |
| POST | `/api/files/v1/files/:fileId/url` | `filesCreateUrl` |
| DELETE | `/api/files/v1/files/:fileId` | `filesDeleteFile` |

Applications persist only the stable `fileId`; they never persist temporary URLs, provider URLs, physical keys, or user paths. Local storage is available through a capability-token proxy upload; S3 upload is intentionally not implemented yet.

```ts
const files = createFilesModule({ db, config, requestContext, authorizer, drivers });
app.route("/api/files/v1", files.router);
```

Create an upload with `POST /api/files/v1/uploads` and a required `Idempotency-Key`, stream bytes to the returned `PUT` target, then call `POST /api/files/v1/uploads/:uploadId/complete`. Create and complete are idempotent; callers receive only public file metadata, never storage keys, provider state, roots, or signing secrets.

Use the stable `fileId` with `GET /files/:fileId`. `POST /files/:fileId/url` returns a short-lived, single-file read capability for inline display or attachment download; do not persist or log that URL. Local capabilities deliver through `/api/files/v1/delivery/:fileId` and stop working when they expire or the file is deleted.

`DELETE /files/:fileId` immediately tombstones the file, then best-effort removes Local bytes. A storage failure leaves cleanup pending for a reconciler while the file remains inaccessible; repeated deletes are idempotent. Removing a `fileId` from an attachment list is not Kernel deletion. Call `DELETE` only when the application knows no other business record references the file; Registry remove behavior must not automatically delete physical files.

Portal Host/Proxy is not the Core API Composition Root. Security configuration, credentials, endpoints, bucket names, and provider state must never be returned to browsers.
