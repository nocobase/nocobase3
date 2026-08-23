# NocoBase Default App Template

The reference full-stack application for the new NocoBase App architecture. It
uses `@nocobase/app-server` on the backend and a React + Refine + shadcn client
from `@nocobase/app-client`.

## Quick start

From the repository root:

```bash
pnpm install
cp packages/app-template-default/.env.example \
  packages/app-template-default/.env.local
pnpm app:dev
```

The example environment mounts the application at `/main`. Use the URL printed
by the development command as the source of truth for host and port.

The key settings are:

```env
APP_BASE_PATH=/main
NOCOBASE_API_PROXY_TARGET=
```

`APP_BASE_PATH` is the public application mount path.
`NOCOBASE_API_PROXY_TARGET`, when configured, is the upstream NocoBase API
origin used by the server-side proxy; it is not exposed as a Vite client
variable.

## App plugins

The App loads enabled packages listed in `package.json` under
`nocobase.plugins`. A plugin also appears in `devDependencies` so its server and
client entries can be resolved during development and build.

Create and register a plugin from the repository root:

```bash
pnpm plugin:create audit-log
pnpm plugin:register audit-log --app app-template-default
```

Remove the application registration before deleting the package:

```bash
pnpm plugin:unregister audit-log --app app-template-default
pnpm plugin:remove audit-log
```

See [Plugin development quick start](../../docs/plugin-development-quickstart.md)
for the server, database, client bootstrap, routes, and providers protocols.

## Current client architecture

The active browser source is `client/`:

```text
client/
├── auth/                    application authentication presentation
├── pages/                   application-owned pages
├── theme/                   app-wide theme and selector
├── app.ts                   final AppClient composition
├── index.tsx                async startup entry
├── plugin-routes.ts         React.lazy route rendering
├── refine-runtime.ts        plugin Refine contribution collector
├── route-overrides.ts       application component replacements
├── routes.tsx               auth groups and React Router placement
└── runtime.ts               plugin loading and runtime validation
```

`client-old/` is a temporary, untracked migration archive. It is not current
application source and must never be imported, staged, or used as a routing or
provider architecture reference.

Enabled client plugins contribute independently:

- `client/bootstrap`: Refine capabilities such as auth, data, notifications,
  access control, i18n, and live providers;
- `client/routes`: inspectable route path/auth metadata and lazy page loaders;
- `client/providers`: synchronous React providers with explicit ordering.

Inspect the final client composition with:

```bash
pnpm app:client:inspect --app app-template-default
pnpm app:client:inspect --app app-template-default --json
```

The route output distinguishes plugin route ownership from the final component
source after application overrides.

## Authentication UI

`@nocobase/app-plugin-authentication` owns the AuthProvider, session behavior,
redirects, and the guest routes `/login`, `/register`, `/forgot-password`, and
`/reset-password`. It also provides default fallback pages.

The Default App customizes only those routes' lazy page components in
`client/auth/`. It imports forms and links from the stable
`@nocobase/app-plugin-authentication/client/ui` subpath. It does not duplicate
guest routes or call Better Auth endpoints directly from page components.

See [client/auth/README.md](client/auth/README.md) for the task-oriented edit
map. Password reset still requires deployment-side configuration of Better
Auth's `emailAndPassword.sendResetPassword` callback and a real mail transport.

## Theme

`client/theme` wraps application and plugin pages. The top-right selector
supports System, Light, and Dark modes. Plugin pages should use semantic
Tailwind classes such as `bg-background`, `text-foreground`, and
`border-border` so they follow the selected theme.

## Development and validation

```bash
pnpm --filter @nocobase/app-template-default lint
pnpm --filter @nocobase/app-template-default typecheck
pnpm --filter @nocobase/app-template-default test
pnpm --filter @nocobase/app-template-default build
```

Unit and integration tests live under `tests/logic`. Browser flows that require
real authentication, APIs, ACL, files, or server data belong under `e2e`.

## License

MIT
