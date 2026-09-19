# Client session and pages

## Reading the session

`useAuthentication()` works anywhere under the application shell:

```tsx
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';

export function Greeting(): ReactElement | null {
  const { session, isPending } = useAuthentication();
  if (isPending || !session) return null;
  return <span>{session.user.name}</span>;
}
```

- `session` is `null` while anonymous; `session.user` has `id`, `name`,
  `email`, `username`, `image`, and `emailVerified`.
- `isPending` is true until the first `getSession()` completes and during any
  `refresh()`. Render nothing or a placeholder while pending; do not treat
  pending as anonymous.
- `refresh()` re-reads the session from the server. Call it after any action
  that changes the session outside the provided hooks.
- `client` is the Better Auth client. Every Better Auth client plugin
  configured in `client/config/auth.ts` is available on it.

The provider does not poll and does not listen for revocation. A session
revoked on the server is noticed at the next `refresh()` or when an API call
returns `401`; treat that `401` as "sign in again", not as an application
error.

## Signing out

There is no sign-out hook. Call the client and refresh:

```ts
const { client, refresh } = useAuthentication();
await client.signOut();
await refresh();
```

The application shell's user menu already does this. Reuse it rather than
adding a second sign-out path.

## Guarding pages

Routes declare their mode in `client/routes.ts`:

- `auth: 'required'` renders inside `RequiredAuthentication`; an anonymous
  visitor is redirected to `/login`.
- `auth: 'guest'` renders inside `GuestAuthentication`; a signed-in visitor is
  redirected to `/`.
- `auth: 'optional'` renders for everyone.

Both redirect targets are fixed by the plugin. An application that needs a
different landing page redirects again from `/` or from the login page's
success path; it does not fork the guard. Wrap a subtree yourself with
`AuthenticationGuard({ mode })` only outside the routed tree.

A guard is navigation. Every endpoint the page calls authenticates on its own;
see [protecting routes](protecting-routes.md).

## Client configuration

`client/config/auth.ts` holds Better Auth client options. Its `plugins` must
mirror the server's: the template pairs `username()` on the server with
`usernameClient()` here. Adding a server plugin that has a client counterpart
means adding both, or the client will lack the typed methods and the plugin's
request handling.

The base URL is derived from the application's public path and must not be
set here.

## Where the pages live

The plugin ships no pages. The application declares four guest routes and
owns their components:

```text
client/routes.ts                        /login /register /forgot-password /reset-password
client/pages/auth/*.tsx                 one page per route, composes AuthLayout
client/pages/auth/shared.tsx            logo and marketing panel used by every page
client/extensions/nocobase-auth-ui/     layout, tabs, SSO buttons, four password forms
```

Edit these files directly. The extension directory was materialized from the
plugin's UI registry item and belongs to the application; upgrades arrive as
a three-way merge, so keep local changes minimal and cohesive.

### Changing text, branding, or layout

`AuthLayout` takes `title`, `description`, `logo`, `marketing`, and either
`form` or `forms`. Branding is `authLogo` and `authMarketing` in
`client/pages/auth/shared.tsx`; change them there so all four pages follow.
Wording lives in each page file. Use `AuthBrand` with `light` and `dark` to
give both themes a logo.

### Offering more than one sign-in form

Pass `forms` instead of `form` to render a tab per method:

```tsx
<AuthLayout
  forms={[
    { id: 'password', label: 'Password', content: <PasswordLoginForm /> },
    { id: 'ldap', label: 'LDAP', content: <LdapLoginForm /> },
  ]}
  sso={
    <AuthSsoButtons
      providers={[{ id: 'github', label: 'GitHub', onClick: signInWithGitHub }]}
    />
  }
  {...rest}
/>
```

`AuthSsoButtons` takes `providers`, each with `id`, `label`, and either
`onClick` or `href`, plus optional `icon` and `disabled`. Keep the sign-in
call itself in an application module such as `client/auth/<provider>/`, and
have the button call it; see [adding sign-in methods](adding-sign-in-methods.md).

### Writing a custom form

Compose the headless action instead of calling the client by hand:

```tsx
import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';

const { submit, isPending, error } = usePasswordLogin();
await submit({ identifier, password });
```

- `usePasswordLogin` routes an identifier containing `@` to email sign-in and
  anything else to username sign-in, then refreshes the session.
- `usePasswordRegistration` takes `{ name, email, username, password }`.
- `usePasswordResetRequest` takes `{ email }` and exposes `isSuccess`; it
  sends the user back to the application's `/reset-password` route.
- `usePasswordReset` takes `{ token, password }`.

`error.message` is the message Better Auth returned, already safe to show.
Navigation after success belongs to the form; the built-in forms use ordinary
relative links and the router.

### Turning registration off

Set `emailAndPassword.disableSignUp: true` in `server/config/auth.ts` so the
endpoint refuses, then remove the `/register` route and the links to it from
the login page. Hiding the page alone leaves the endpoint open.

### Password reset

The forms are present, but sending the email is the application's job:
configure `emailAndPassword.sendResetPassword` on the server as described in
[user lifecycle and deployment](user-lifecycle-and-deployment.md). Until it is
configured, the forgot-password page succeeds silently and sends nothing, so
do not link to it from a production login page.

## Testing components

Component tests stub the client rather than a network. Register a fake under
`authenticationClientToken` whose `getSession()` resolves the session you
want, mount `AuthenticationProvider`, and render the component. Tests of the
auth pages mock the `client/actions` module instead, asserting what `submit`
was called with. The template's own client tests show both patterns.
