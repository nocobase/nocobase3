---
name: nocobase-hub-api-keys
description: Manage Hub publishing API keys in NocoBase 3 Hub and call its Release and Deployment APIs.
---

# Hub publishing API keys

Hub extends `@nocobase/app-plugin-api-keys`; it does not generate or hash its own credentials. Register the API Keys server plugin and `...hubApiKeyAuthentication()` from the Hub server entry in `auth.plugins`, replacing the standalone `apiKey()` registration. The default user-key configuration remains available. The separate `hub-publishing` configuration cannot become a user Session or authenticate against a hosted application’s business API. Hub owns the App binding and publishing permission checks.

Open **API Keys** below **Roles & permissions** in the Hub navigation. Select specific existing applications or **All applications (including future apps)** when creating a key. The latter stores a dynamic `allApps: true` scope with an empty `appIds` list and requires wildcard upload/deploy permissions; it never snapshots the current App catalog. Every use still checks the owner’s current permissions on the target App. The `hub.app / manage-api-keys` permission is granted to `hub-administrator` by default. Operators and viewers do not receive it. The creation form offers only operations the signed-in user can perform on every selected App. Give keys descriptive CI names and the smallest required set of permissions.

Creation returns the plaintext key. The API Keys plugin stores the hash and display prefix in its own `apikey` table. Hub stores an AES-256-GCM encrypted recovery copy, bound to the key ID and creator and protected by a purpose-specific key derived from stable `auth.secret` (at least 32 characters). The creator may retrieve an active key using `POST /:keyId/reveal` with a signed-in session and management permission. The list returns only `canCopy`, never plaintext or ciphertext. Legacy hash-only keys cannot be recovered. Changing `auth.secret` without re-encrypting saved copies makes recovery unavailable, while hash verification remains independent. Back up the secret separately from the database. Disabling clears the recovery copy. The list includes creator, permissions, state, expiry and last successful authorization time. Disabling is permanent; deleting removes the credential. Both operations are repeatable. Creation and disabling update the plugin credential and Hub binding in the same database transaction. App removal removes only the matching binding and deletes the plugin credential only when no App bindings remain. Better Auth may prune expired credentials, after which they no longer appear in the list.

Management endpoints under `<Hub base>/api/hub/api-keys` accept signed-in users only: `GET` lists, `POST` creates with `{ name, appIds, allApps?, scopes, expiresAt? }`, `POST /:keyId/disable` disables, and `DELETE /:keyId` deletes. `expiresAt` is an ISO timestamp in the future or null. `GET /apps` on the management resource lists selectable Apps and their allowed publishing actions. App bindings and scopes cannot be edited. A replacement key is required to change permissions.

Publishing requests use `Authorization: Bearer <secret>` and these fixed scopes:

| Existing Hub action | Allowed endpoint relative to `/api/hub/apps/:appId`     |
| ------------------- | ------------------------------------------------------- |
| `upload-release`    | `POST /releases`                                        |
| `deploy`            | `POST /deploy`, `GET /deployments/:deploymentId/status` |

These values are the same `hub.app` action keys used by the Administrator and Operator permission sets, with no separate permission mapping. Read endpoints other than the minimal deployment status endpoint require a signed-in user. The forward-only migration converts old single-App bindings and keeps only existing upload/deploy permissions; old read-only keys receive no write permission.

Hub App access also requires ownership: a non-administrator credential owner can publish only to Apps they created, including when an existing key has `allApps: true`. Hub Administrators can publish to all Apps. Apps without a recorded creator remain administrator-only. Role demotion takes effect on the next request.

Every request checks the bound App, key status, expiry, requested scope, and the creator's current account and operation permission. Disabling the creator or removing a permission blocks corresponding key requests. Keys cannot manage keys, read configuration, change settings, or call lifecycle and rollback endpoints. Invalid Bearer credentials never fall back to cookies. Only identifiers, never secrets, are logged. Hub’s authentication hook rejects public API Key management calls targeting `hub-publishing` and limits the default self-service list to user keys. Do not remove this hook or enable Session authentication for publishing keys.

Use the current Deployment response and status fields. Hub owns publishing, streaming intake and idempotency; the independent API Keys plugin remains responsible for generic credential generation and verification. Deployment execution continues through the existing Hub executor.

When verifying, use a disposable local App and short-lived key. Test allowed requests, wrong App, missing scope, disable, expiry, and creator permission removal. Do not log a full create response or leave test keys active.

## Publishing and result access

Only the existing `hub.app` actions `upload-release` and `deploy` are selectable. Uploads that deploy (explicit deployment intent) require both. CLI result polling uses `GET /apps/:appId/deployments/:deploymentId/status` with `deploy`; this deliberately returns no configuration, logs, or detailed errors and does not grant `read-deployment`. Do not introduce a `read-operation` scope or map to a second set of action names.

Use `pnpm nocobase app upload` from a Default or Examples App. Prefer `HUB_URL`, `HUB_APP_ID`, and `HUB_API_KEY` for CI. The Hub URL includes its App base path, such as `/main`. `--deploy` requests atomic release/deployment acceptance. There is no deployment-mode configuration; scripts control whether to deploy. Upload `--wait` requires `--deploy`. For an existing Release use `app deploy --release-id`; preserve its idempotency key across retries and choose a fresh one for an intentional redeployment.

Both `app deploy --release-id <id> --config ./runtime.yml` and `app upload --deploy --config ./runtime.yml` accept an optional runtime YAML file (non-empty UTF-8, at most 1 MiB). Paths resolve from the App root. Omitting `--config` reuses the current Hub configuration; on first deployment, the existing Release-template initialization still applies. Supplied configuration replaces the configuration document through the existing Hub secret handling and YAML validation; it is not merged with arbitrary existing fields and never changes the Release template or archive. `app upload --config` without `--deploy` is rejected. Use `app deploy` to apply a different configuration to an already uploaded Release; configured upload retries reuse only the originally supplied configuration. Default deployment retry identity includes supplied configuration content. Configuration content is never printed in CLI results.
