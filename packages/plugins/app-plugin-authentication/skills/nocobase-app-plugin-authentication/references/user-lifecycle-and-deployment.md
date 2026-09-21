# User lifecycle and deployment

## Account state from server code

Two services share the work. `userAdministrationServiceToken` from
`@nocobase/app-plugin-users/server` owns the user record and the complete
administrator flows: `list`, `get`, `create`, `update`, `disable`, `enable`,
`remove`, `resetPassword`, `revokeSessions`, `withConnection`.
`userAuthenticationServiceToken` from this plugin owns what only
authentication can do to that user, and the users plugin calls it from those
flows: `assertPasswordAllowed`, `createPasswordCredential`, `resetPassword`,
`revokeSessions`, `deleteCredentials`, plus `createUser` and `updateUser`,
which run Better Auth's own user write flow (database hooks, plugin field
defaults, cached session refresh) while the users plugin's store writes the
row.

```ts
import {
  userAdministrationServiceToken,
  UserAdministrationError,
} from '@nocobase/app-plugin-users/server';

const users = app.container.resolve(userAdministrationServiceToken);
await users.disable(userId); // revokes sessions and disconnects realtime
```

Errors from the users plugin are `UserAdministrationError` with a `code` of
`USER_NOT_FOUND`, `USER_EMAIL_CONFLICT`, `USER_USERNAME_CONFLICT` or
`USER_IDENTITY_CONFLICT`; password errors from this plugin are
`UserAuthenticationError` with `PASSWORD_TOO_SHORT` or `PASSWORD_TOO_LONG`.
Map them to stable HTTP responses; do not surface database errors.

Use `withConnection` when a user change must commit with other rows, for
example creating a user together with its role assignment. The users
plugin's role scope registry is the place to hook application roles into that
flow; read `nocobase-app-plugin-users` for it.

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
