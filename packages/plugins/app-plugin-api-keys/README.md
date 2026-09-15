# @nocobase/app-plugin-api-keys

API key authentication for NocoBase applications, built on Better Auth.

A key authenticates as the user who created it. `Auth.getSession()` resolves the `x-api-key` header the same way it resolves a session cookie, so `auth.required()`, the route guards, and `@nocobase/app-plugin-authorization` all see the owning user and exactly the roles that user holds. Nothing in an application has to know a request arrived by key rather than by cookie.

Keys are self-service: each signed-in user creates and revokes their own under `/settings/api-keys`.

## What this package is

Better Auth's [API Key plugin](https://www.better-auth.com/docs/plugins/api-key), plus the parts an application needs around it:

- the `apikey` table migration;
- the Settings page and its locales;
- `apiKey` and `apiKeyClient`, carrying Better Auth's own names and options.

`apiKey` is wrapped only to supply three defaults, all of them overridable; everything else is Better Auth's behavior and its documentation applies unchanged. They come from this package rather than from a dependency each application installs because the migration here has to match the schema that version of `@better-auth/api-key` declares; a test asserts the table carries a column for every field the plugin declares.

## Installing it

```ts
// server/plugins.ts — migrations for the apikey table
import apiKeys from '@nocobase/app-plugin-api-keys/server';

// server/config/auth.ts — the Better Auth plugin itself
import { apiKey } from '@nocobase/app-plugin-api-keys/server';

export default defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false }), apiKey()],
}));
```

```ts
// client/plugins.ts — the management page
import apiKeys from '@nocobase/app-plugin-api-keys/client';
apiKeys({ path: '/api-keys' });

// client/config/auth.ts — so authClient.apiKey.* reaches the endpoints
import { apiKeyClient } from '@nocobase/app-plugin-api-keys/client';

export default defineAppConfig((_runtime) => ({
  plugins: [usernameClient({ displayUsername: false }), apiKeyClient()],
}));
```

Then grant `page:api-keys/access` to the roles that may manage keys — normally all authenticated users, since every endpoint acts only on the caller's own keys — and run `pnpm migrate`.

Registering the server plugin without `apiKey()` creates the table and mounts no endpoints; registering `apiKey()` without the server plugin mounts endpoints against a table that does not exist.

## The three defaults

| Option                    | Better Auth                         | Here    | Why                                                                                                                     |
| ------------------------- | ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `enableSessionForAPIKeys` | `false`                             | `true`  | Without it a key authenticates nothing: the page still issues keys, and every request carrying one answers 401          |
| `rateLimit.enabled`       | `true`, 10 requests per key per day | `false` | That is a quota for issuing keys rather than for using them, and it silently breaks the first integration anyone writes |
| `requireName`             | `false`                             | `true`  | The management page identifies a key by its name, and a key listed as "unnamed" cannot be revoked with any confidence   |

All three are overridable. `apiKey({ rateLimit: { enabled: true, maxRequests: 1000, timeWindow: 60_000 } })` sets a quota, and passing all three back reproduces Better Auth's own behaviour exactly.

## Using a key

```bash
curl -H 'x-api-key: <key>' https://example.com/api/orders
```

## What a key can do

A key is its owner. Beyond the application's own routes, it reaches the Better Auth endpoints Better Auth lets a session reach — verified against `@better-auth/api-key` 1.7.1 with only an `x-api-key` header:

| Endpoint                                                           |                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `POST /api-key/create`, `GET /api-key/list`                        | reachable — a key mints and lists keys the way its owner does           |
| `POST /update-user`                                                | reachable — profile fields                                              |
| `GET /list-sessions`                                               | reachable — returns session rows including the unsigned session `token` |
| `POST /sign-out`                                                   | reachable                                                               |
| `POST /delete-user`, `POST /change-email`, `POST /revoke-sessions` | 401                                                                     |
| `POST /change-password`                                            | requires `currentPassword`                                              |

Two consequences are worth planning for rather than being surprised by.

**A key mints keys.** A successor carries its own expiry and its own revocation, and nothing in the table links it to the key that created it. Revoking a leaked key therefore means reviewing the owner's whole list, not just deleting the one you know about.

**`/list-sessions` discloses the session token.** It is the unsigned half of the session cookie, which is `token.signature`; replaying it alone does not authenticate, because the HMAC is computed with the auth secret. It becomes a working session takeover only if that secret also leaks or a deployment turns cookie signing off.

An application that wants either closed adds a Better Auth `before` hook of its own.

A rejected key — expired, revoked, or wrong — reads as no session, so a guarded route answers 401 rather than failing. A disabled user's keys stop working immediately, because `Auth.getSession()` re-reads `user.disabledAt` on every request.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-api-keys check
```
