---
name: nocobase-hub-api-keys
description: Manage per-application publishing API keys in NocoBase 3 Hub and call its Release and Deployment APIs.
---

# Hub publishing API keys

Hub extends `@nocobase/app-plugin-api-keys`; it does not generate or hash its own credentials. Register the API Keys server plugin and `...hubApiKeyAuthentication()` from the Hub server entry in `auth.plugins`, replacing the standalone `apiKey()` registration. The default user-key configuration remains available. The separate `hub-publishing` configuration cannot become a user Session or authenticate against a hosted application’s business API. Hub owns the App binding and publishing permission checks.

Open an application in Hub and select **API keys**. The `hub.app / manage-api-keys` permission is granted to `hub-administrator` by default. Operators and viewers do not receive it. The creation form offers only operations the signed-in user can perform on that App. Give keys descriptive CI names and the smallest required set of permissions.

Creation returns the plaintext key once. Copy it to the caller's secret store. The API Keys plugin stores the hash and display prefix in its own `apikey` table; Hub stores no secret or hash. The list includes creator, permissions, state, expiry and last successful authorization time. Disabling is permanent; deleting removes the credential. Both operations are repeatable. Creation and disabling update the plugin credential and Hub binding in the same database transaction. App removal deletes its plugin credentials and cascades its Hub bindings. Better Auth may prune expired credentials, after which they no longer appear in the list.

Management endpoints under `<Hub base>/api/hub/apps/:appId/api-keys` accept signed-in users only: `GET` lists, `POST` creates with `{ name, scopes, expiresAt? }`, `POST /:keyId/disable` disables, and `DELETE /:keyId` deletes. `expiresAt` is an ISO timestamp in the future or null. Scopes cannot be edited. A replacement key is required to change permissions.

Publishing requests use `Authorization: Bearer <secret>` and these fixed scopes:

| Scope            | Allowed endpoints relative to `/api/hub/apps/:appId` |
| ---------------- | ---------------------------------------------------- |
| `upload-release` | `POST /releases`                                     |
| `read-release`   | `GET /releases`, `GET /releases/:releaseId`          |
| `deploy`         | `POST /deploy`                                       |
| `read-operation` | `GET /deployments`, `GET /deployments/:deploymentId` |

Every request checks the bound App, key status, expiry, requested scope, and the creator's current account and operation permission. Disabling the creator or removing a permission blocks corresponding key requests. Keys cannot manage keys, read configuration, change settings, or call lifecycle and rollback endpoints. Invalid Bearer credentials never fall back to cookies. Only identifiers, never secrets, are logged. Hub’s authentication hook rejects public API Key management calls targeting `hub-publishing` and limits the default self-service list to user keys. Do not remove this hook or enable Session authentication for publishing keys.

Use the current Deployment response and status fields; this capability does not introduce CLI commands, streaming uploads, Operation recovery, upload/deployment idempotency or automatic deployment. Keep those separate from key configuration work.

When verifying, use a disposable local App and short-lived key. Test allowed requests, wrong App, missing scope, disable, expiry, and creator permission removal. Do not log a full create response or leave test keys active.
