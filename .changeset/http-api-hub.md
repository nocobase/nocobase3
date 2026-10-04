---
'@nocobase/app-plugin-hub': major
'@nocobase/hub-cli': major
---

The Hub API under `/api/hub` follows the application's HTTP API rules, and `@nocobase/hub-cli` speaks the new API. A `hub-cli` older than this release cannot publish to an upgraded Hub, and this `hub-cli` cannot publish to an older one, so upgrade both together.

URL and method changes:

- `/api/hub/api-keys` → `/api/hub/apiKeys`, `/api/hub/api-keys/apps` → `/api/hub/apiKeys/apps`, `/api/hub/api-keys/:keyId/reveal` → `/api/hub/apiKeys/:keyId/reveal`, `/api/hub/api-keys/:keyId/disable` → `/api/hub/apiKeys/:keyId/disable`, `DELETE /api/hub/api-keys/:keyId` → `DELETE /api/hub/apiKeys/:keyId`.
- `GET /api/hub/apps/:appId/releases/:releaseId/config-template` → `GET /api/hub/apps/:appId/releases/:releaseId/configTemplate`.
- `PUT /api/hub/apps/:appId/releases/uploads/:uploadId` → `PATCH /api/hub/apps/:appId/releases/uploads/:uploadId` for appending a chunk.
- `GET /api/hub/apps?search=` → `GET /api/hub/apps?q=`; its default page size is now 20.
- `GET /api/hub/apps/:appId/releases?limit=` → `GET /api/hub/apps/:appId/releases?page=&pageSize=`.
- Log reads (`GET /api/hub/apps/:appId/logs` and `GET /api/hub/apps/:appId/deployments/:deploymentId/logs`): `cursor` → `pageToken` and `search` → `q`; `level`, `source`, `since`, `until` and `fromStart` are unchanged.

Response changes:

- Lists answer `{ data: [...], meta }`. `GET /apps`, `GET /apps/:appId/releases` and `GET /apps/:appId/deployments` carry `meta: { page, pageSize, total }` instead of `{ data: { items, total, page, pageSize } }`; `GET /apiKeys`, `GET /apiKeys/apps` and `GET /roles` carry `meta: { total }`.
- A log read answers its entries in `data` and `meta: { nextPageToken, hasMore, available, enabled, reset, status?, phase? }`, where `nextPageToken` replaces `cursor`.
- `POST /apps` answers `201` with the created App instead of `{ id }`. `POST /apiKeys` and `POST /apps/:appId/releases` answer `201`.
- `POST /apiKeys/:keyId/disable` answers with the disabled key, `PUT /apps/:appId/settings` with `{ name, activation }`, and `POST /apps/:appId/stop`, `start`, `restart` and `refresh` with the App, instead of `{ success: true }`.
- `DELETE /apiKeys/:keyId` and `DELETE /apps/:appId` answer `204` with no body. Deleting a key that does not exist answers `404 / API_KEY_NOT_FOUND` instead of succeeding.

Error changes:

- Every failure is the standard error body `{ error: { code, status, reason, domain: 'hub', message, metadata?, fieldViolations? } }`. The former `error.code` string is now `error.reason`, and extra members such as an upload's `offset` moved to `error.metadata`.
- Every route validates its path, query, headers and JSON body. An invalid input answers `400` with reason `INVALID_INPUT` in the `app` domain and a field violation for each problem, and a JSON body rejects unknown fields. This replaces `INVALID_LIMIT`, `INVALID_CONTENT_LENGTH`, the header checks behind `INVALID_CHUNK`, and the shape checks behind `INVALID_UPLOAD`, `INVALID_API_KEY_INPUT` and `INVALID_DEPLOYMENT_INPUT`.
- HTTP 422 is gone. The archive and input refusals (`CHECKSUM_MISMATCH`, `INVALID_ARTIFACT`, `INVALID_ARTIFACT_VERSION`, `UNSAFE_ARTIFACT`, `INVALID_CONFIG_FILE`, `UNSUPPORTED_CONFIG_FILE`, `INVALID_APP_ID`, `INVALID_APP_NAME`, `INVALID_CONFIG_MODE`, `INVALID_ACTIVATION_POLICY`) answer `400 INVALID_ARGUMENT`, and `BASE_PATH_MISMATCH` and `BUILD_TARGET_MISMATCH` answer `400 FAILED_PRECONDITION`.
- Conflicts of state answer `400 FAILED_PRECONDITION` instead of `409`: `APP_NOT_DEPLOYED`, `APP_NOT_RUNNING`, `CONFIG_NOT_EDITABLE`, `DEPLOYMENT_IN_PROGRESS`, `INVALID_ROLLBACK_TARGET`, `UPLOAD_INCOMPLETE`, `UPLOAD_COMPLETED`, `API_KEY_INACTIVE`, `API_KEY_NOT_RECOVERABLE` and `APP_OWNER_UNAVAILABLE`. `ROLLBACK_CONFIG_MODE_MISMATCH` answers `400 INVALID_ARGUMENT` naming `config.mode`. `APP_EXISTS` stays `409`, as `ALREADY_EXISTS`; `IDEMPOTENCY_CONFLICT` and `UPLOAD_OFFSET_MISMATCH` stay `409`, as `ABORTED`.
- A Release, deployment or App named in a request body that does not exist answers `400 INVALID_ARGUMENT` naming the field (`releaseId`, `deploymentId`, `appIds`), keeping its `RELEASE_NOT_FOUND`, `DEPLOYMENT_NOT_FOUND` or `APP_NOT_FOUND` reason; only the resource in the URL path answers `404`.
- A release upload or chunk of the wrong content type answers `415 / INVALID_CONTENT_TYPE` instead of `400`; an empty archive answers `400 / INVALID_ARTIFACT_SIZE` instead of `413`. `ARTIFACT_TOO_LARGE` and `CHUNK_TOO_LARGE` stay `413`.
- `START_FAILED`, `STOP_FAILED`, `RESTART_FAILED` and `CONFIG_RELOAD_FAILED` answer `503 UNAVAILABLE`.
- A denied permission answers reason `AUTHORIZATION_DENIED` in the `authorization` domain instead of code `FORBIDDEN`. `SESSION_REQUIRED` and `INVALID_API_KEY` answer `401 UNAUTHENTICATED`, and `API_KEY_FORBIDDEN` and `API_KEY_OWNER_REQUIRED` answer `403 PERMISSION_DENIED`.

`HubError` now extends `ApiError` from `@nocobase/app-server/router`: `reason` is the former `code`, `status` is the canonical status name, `code` is the HTTP status, and `details` is `metadata`. `HubService.listReleases(appId)` no longer takes a `limit` and returns every Release; the new `listReleasesPage(appId, { page, pageSize })` returns one page.

`@nocobase/hub-cli` sends chunks with `PATCH`, reads the paged Release and deployment lists, passes the Hub's `error.reason` through as its error code and an upload's offset from `error.metadata.offset`, and reports `HUB_NOT_FOUND` for a 404 that names no reason or names the application's `ROUTE_NOT_FOUND`. Its commands, flags, output and exit codes are unchanged.
