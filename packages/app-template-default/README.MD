# NocoBase Default App Template

The reference full-stack application for the new NocoBase App architecture. It
uses `@nocobase/app-server-kit` on the backend and a React + Refine + shadcn client
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

Deploy a generated App's locally built artifact to Hub with:

```bash
export NOCOBASE_HUB_TOKEN=YOUR_HUB_DEPLOY_TOKEN
pnpm run deploy --hub http://localhost:3000/your-app-id
```

Use `pnpm run deploy`, because pnpm 11 reserves `pnpm deploy` for its own
workspace deployment command.

The key settings are:

```env
APP_BASE_PATH=/main
# APP_PUBLIC_ORIGIN=https://apps.example.com
NOCOBASE_API_PROXY_TARGET=
```

`APP_BASE_PATH` is the public application mount path.
`APP_PUBLIC_ORIGIN` is the optional external HTTP origin used for callbacks
and redirects. It must not include `APP_BASE_PATH`; the runtime combines them.
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
├── application.ts          application contribution loader
├── bootstrap.ts            application Refine defaults
├── routes.ts               application-owned route declarations
├── providers.ts            application Provider declarations
├── route-overrides.ts      application component replacements
├── routing/                route placement, lazy loading, and error UI
├── auth/                    application authentication presentation
├── pages/                   application-owned pages
├── shell/                   authenticated application shell
├── theme/                   app-wide theme and selector
├── app.ts                   final AppClient composition
├── index.tsx                async startup entry
├── refine-runtime.ts        plugin Refine contribution collector
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

The Default App contributes through the same three protocols, wired by
`client/application.ts`. Its bootstrap runs before plugin bootstraps. Its `/`
home route is declared in `client/routes.ts`, while `client/routing/` only
renders the resolved routes.

Providers are composed outer-to-inner in fixed layer order:
`root -> application -> extension`. The app Theme Provider uses `root`;
application providers otherwise default to `application`, and plugin providers
use `extension`. `before` and `after` can refine order only within the same
layer.

Inspect the final client composition with:

```bash
pnpm app:client:inspect --app app-template-default
pnpm app:client:inspect --app app-template-default --json
pnpm app:client:inspect --app app-template-default --type bootstrap
```

The output shows bootstrap order, route ownership and final component source,
and Provider source/layer/order.

## Authentication UI

`@nocobase/app-plugin-authentication` owns the AuthProvider, session behavior,
redirects, and the guest routes `/login`, `/register`, `/forgot-password`, and
`/reset-password`. It also provides default fallback pages.

The Default App customizes only those routes' lazy page components in the
installed `client/extensions/nocobase-auth-ui/` Registry source. `AuthLink` is
imported from the stable `@nocobase/app-plugin-authentication/client/ui`
subpath; the final password forms are application-owned Registry source and
call the plugin's stable `client/actions` hooks. It does not duplicate guest
routes or call Better Auth endpoints directly from page components.

See
[client/extensions/nocobase-auth-ui/README.md](client/extensions/nocobase-auth-ui/README.md)
for the task-oriented edit map. Password reset still requires deployment-side
configuration of Better Auth's `emailAndPassword.sendResetPassword` callback
and a real mail transport.

The upstream recipe and its Registry configuration are published by the
authentication package at `registry/auth-ui` and `registry.config.json`. The
Default Template commits only the materialized, application-owned snapshot.
Build the authentication Registry payload from the repository root with:

```bash
pnpm registry build --package @nocobase/app-plugin-authentication
```

To initialize extensions in a new output tree, materialize them there:

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-authentication \
  --item auth-ui \
  --output-root /path/to/new-template
```

Materialization refuses an existing target so it cannot silently overwrite
application edits. Updating an installed Registry item must use an explicit
three-way merge.

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
