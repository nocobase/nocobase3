---
'@nocobase/app-plugin-authentication': patch
---

Forward Better Auth's answer when a credential is present but refused, instead of letting it escape as a 500.

A bad cookie has always resolved to no session. A plugin that authenticates by header — an API key — reports an expired, revoked or unknown credential by throwing an `APIError` that says why, and `Auth` had no handling for that path: the throw left `auth.required()` unhandled, and Hono answered 500 for what was a client's expired key.

`required()` and `optional()` now catch a 4xx `APIError` and respond with Better Auth's own status and body — `401 KEY_EXPIRED`, `429 USAGE_EXCEEDED` — so the caller learns exactly what to do. `getSession()` folds the same rejection into `null`, because its callers ask only who is signed in and already treat `null` as nobody. A 5xx still propagates; a request that could not be answered must not read as "not signed in". Nothing changes for a request carrying no credential or a bad cookie.
