---
'@nocobase/app-plugin-authentication': patch
---

Answer a refused credential with Better Auth's own status and body instead of a 500.

`getSession()` keeps Better Auth's contract: a session, `null` when nobody is signed in, and a thrown `APIError` when a credential is present but refused — an expired or revoked API key. `Auth` had nothing translating that error at the edge, so it escaped `auth.required()` unhandled and Hono answered 500. `required()` and `optional()` now catch an `APIError` and respond with its status and body: `401 KEY_EXPIRED`, `429 USAGE_EXCEEDED`. Nothing changes for a request carrying no credential or a bad cookie. The realtime principal resolver treats a refused credential as no principal.
