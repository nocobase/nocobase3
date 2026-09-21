# User lifecycle and deployment

## Account state from server code

Two contracts share the work. `userServiceToken` from
`@nocobase/app-plugin-users` owns the user record: profile, enabled state and
soft deletion. `authenticationCredentialServiceToken` from this plugin owns
what only authentication can do to that user: passwords, sessions and sign-in
accounts. The User management plugin composes both; application code that
needs the same operations, such as an onboarding job, resolves them too.

```ts
import { userServiceToken, UserError } from '@nocobase/app-plugin-users/server';
import {
  authenticationCredentialServiceToken,
  AuthenticationCredentialError,
} from '@nocobase/app-plugin-authentication';

const users = app.container.resolve(userServiceToken);
const credentials = app.container.resolve(authenticationCredentialServiceToken);
await users.disable(userId); // sessions are revoked by the lifecycle handler
await credentials.resetPassword(userId, newPassword);
```

| Service       | Method                                                | Effect                                                                                                               |
| ------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `UserService` | `get(userId)`                                         | One user or `undefined`; deleted users are `undefined`                                                               |
| `UserService` | `create({ name, email, username? })`                  | Creates the user without credentials; email and username are normalized to lower case                                |
| `UserService` | `updateProfile(userId, { name?, email?, username? })` | `username: null` clears it                                                                                           |
| `UserService` | `disable(userId)` / `enable(userId)`                  | Sets or clears `disabledAt`; disabling runs the lifecycle, so sessions go and sign-in returns `403 ACCOUNT_DISABLED` |
| `UserService` | `remove(userId, actorId?)`                            | Soft-deletes when the application enables deletion; the lifecycle removes sessions and accounts                      |
| `UserService` | `withConnection(connection)`                          | Binds every operation to a caller-owned transaction                                                                  |
| Credentials   | `createPasswordCredential(userId, password)`          | Validates the password policy and creates the credential account                                                     |
| Credentials   | `resetPassword(userId, password)`                     | Rehashes, creates the credential if missing, and revokes sessions                                                    |
| Credentials   | `revokeSessions(userId)`                              | Deletes sessions and disconnects realtime after the commit                                                           |
| Credentials   | `withConnection(connection)`                          | Same binding as the user service                                                                                     |

`UserError` carries `USER_NOT_FOUND`, `USER_EMAIL_CONFLICT`,
`USER_USERNAME_CONFLICT` or `USER_IDENTITY_CONFLICT`;
`AuthenticationCredentialError` carries `USER_NOT_FOUND`, `PASSWORD_TOO_SHORT`
or `PASSWORD_TOO_LONG`. Map them to stable HTTP responses; do not surface
database errors.

This plugin registers the `authentication.credentials` user lifecycle handler
at boot: when a user is disabled it revokes sessions, when a user is deleted
it also removes the sign-in accounts, all in the transaction that writes the
status. Do not revoke or clean up again after calling `disable` or `remove`.
Realtime disconnects run after the commit; a failure there surfaces as
`TransactionPostCommitError` with `committed: true` and must not be answered
by retrying the user write.

Use `withConnection` when a user change must commit with other rows, for
example creating a user together with its role assignment. The User
management plugin's role scope registry is the place to hook application
roles into that flow; read `nocobase-app-plugin-user-management` for it.
Deletion is off unless the application enables it under `users.deletion`.

Neither service sends email. Compose a notification yourself after
`resetPassword` when the flow needs one.

## Extending the user record

Better Auth's `user.additionalFields` in `server/config/auth.ts` declares
extra columns on `user`, with `input: false` for fields the user may not set
at sign-up. The declaration alone changes nothing: add an application
migration that alters the `user` collection with the same column, and a
`down` that drops it. The plugin already injects `disabledAt`; do not declare
it again.

Prefer an application-owned profile collection keyed by `userId` for anything
beyond a couple of scalar fields. It keeps the authentication tables stable
across plugin upgrades and lets the profile carry its own authorization
rules.

## Hooks

`databaseHooks` in `server/config/auth.ts` runs before or after Better Auth
writes a user, session, account, or verification. Typical uses are stamping
an application field on `user.create.before`, or refusing sign-up for a
domain. The plugin wraps `session.create.before` with the disabled-account
check and still calls the application's hook first; returning `false` from
it blocks the session as usual.

Keep hooks free of external calls that can fail slowly; sign-in waits on
them. Anything that can be done afterwards belongs in a job or a workflow.

## Email verification and password reset

The password-reset pages ship, the email does not. Configure the sender:

```ts
emailAndPassword: {
  enabled: true,
  sendResetPassword: async ({ user, url }) => {
    await mailer.send({ to: user.email, template: 'reset-password', url });
  },
},
emailVerification: {
  sendOnSignUp: true,
  sendVerificationEmail: async ({ user, url }) => { /* ... */ },
},
```

Send through the application's notification plugin rather than a second mail
client; `nocobase-app-plugin-notification` describes the channel to use. The
`url` already points at the application's `/reset-password` route with the
token. Rules that apply to any implementation:

- Respond the same whether or not the email exists.
- Keep the redirect on an allowlist that is the application's own origin.
- Let Better Auth own token expiry and single use; do not add a parallel
  token table.
- Do not expose the forgot-password link in production until the sender is
  configured and tested.

## Deployment

**Secret.** `auth.secret` comes from `AUTH_SECRET` or the deployment
configuration file, is at least 32 characters, is identical on every
instance, and never appears in source or in a browser build. Without a
configuration file present the plugin generates a random secret for
install-mode startups; with one present and no secret it refuses to start.

**Public origin.** Set `app.publicOrigin` to the HTTPS address the browser
sees. Better Auth derives its base URL and callback URLs from it and from the
application's public base path; a container-internal address breaks OAuth
callbacks and cookie attributes. The reverse proxy must forward host,
protocol, and cookies.

**Cookies.** The plugin derives the cookie prefix from the application name
and the cookie path from the public base path. Override
`advanced.defaultCookieAttributes` only with a reason: `secure` off is for
local HTTP only, `sameSite` changes affect OAuth returns, and widening
`domain` shares the cookie with every sub-domain. Two applications on one
host need distinct prefixes.

**Shared storage.** `session.storeSessionInDatabase: true` keeps sessions in
the database. Rate-limit counters, one-time values, and the session cache
live in the application's cache through `createAuthStorage`; a multi-instance
deployment needs a shared cache provider such as Redis or those diverge per
instance.

**Logs.** Never log passwords, session tokens, verification values, tickets,
or OAuth tokens; log user ids, request ids, and outcomes. Return stable
authentication error codes, not adapter errors.
`databaseAdapter({ debugLogs: true })` is for controlled diagnosis only.

**Checklist before go-live.** Secret from secure configuration on every
instance; public origin is the real HTTPS address; cookie prefix, path,
`secure`, and `sameSite` verified under the deployed path; authentication
migrations applied; shared cache for more than one instance; sign-in,
sign-up, sign-out, session read, and password reset checked in a real
browser; anonymous requests refused by every protected route; logs and error
bodies free of credentials.
