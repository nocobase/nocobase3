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

Applications persist only the stable `fileId`; they never persist temporary URLs, provider URLs, physical keys, or user paths. Local and S3-compatible storage are drivers behind the same injected boundary, so the App does not know the provider. The host mounts the eventual Hono router with its request context, database, authorizer, and driver registry; this package currently exposes contracts and injection types only.

Portal Host/Proxy is not the Core API Composition Root. Security configuration, credentials, endpoints, bucket names, and provider state must never be returned to browsers.
