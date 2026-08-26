# NocoBase Portal Template

A React and shadcn/ui template for building standalone frontends backed by
NocoBase.

![NocoBase Portal Template](https://static-docs.nocobase.com/2026-07-22-08-48-12.png)

## Quick start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The development entry starts at `http://127.0.0.1:13001/hub/` by default, so
it can run beside a NocoBase V2 development environment on port `13000`.
Vite runs behind the Hub server at `http://127.0.0.1:5173`.

Hub is also the browser gateway for managed Apps. For example, CRM is opened at
`http://127.0.0.1:13001/crm/`; Hub forwards that path to the internal App Host.
Hub and App Host stay independently deployable, while users see one origin and
never need the App Host port.

For the current App creation, CLI deployment, approval, and operator workflow,
see the [Simplified Chinese user guide](./USER_GUIDE.zh-CN.md).

## Configuration

The minimum local configuration is:

```env
APP_NAME=hub
APP_BASE_PATH=/hub
APP_SERVER_PORT=13001
# AUTH_SECRET=<required in production>
# HUB_ADMIN_EMAILS=admin@example.com
```

- `APP_NAME` is the runtime app name. Hub uses `hub`.
- `APP_BASE_PATH` is the public mount path for the app server. Hub uses `/hub`.
- Hub owns its V3 authentication tables, sessions and SQLite database. The first
  registered user is the bootstrap administrator unless `HUB_ADMIN_EMAILS` is
  configured.
- `AUTH_SECRET` is required in production. Development uses an explicit local-only
  fallback so a fresh checkout can start without a V2 service.
- `NOCOBASE_AUTH_URL` is also required in production and must point to the public
  Hub auth endpoint, for example `https://hub.example.com/hub/api/auth`.
- `NOCOBASE_API_PROXY_TARGET` is optional and only enables explicit V2 compatibility
  routes under `/v2/api`; V3 login and settings do not use it.

## Release management control plane

Hub's `/hub/deliveries` page is the platform-level release control plane for
App Host applications. App Host owns immutable releases, readiness checks,
atomic traffic switching, restart recovery, and rollback. Hub owns authenticated
operator workflows and persists every deployment attempt in its own local audit
store for the preview release.

An administrator first reserves an App ID from `/hub/apps`. Hub displays an
App-scoped deployment token once. From that App's source directory,
`nb3 app deploy` runs the build, creates and uploads a deterministic immutable
Release, and submits it for approval. The token cannot approve the Release or
operate another App; an administrator must still approve it in Hub before App
Host performs readiness checks and switches traffic.

Apply the committed audit collection contract to the selected environment. For
the local demo, run this command twice; both passes resolve the same collection
and field keys:

```bash
nb api data-modeling collections apply \
  --body-file ./nocobase/release-management/collection.json \
  --env local \
  --json-output
```

Configure runtime-only server credentials in `.env.local` or the App Host
process environment:

```env
APP_HOST_CONTROL_URL=http://127.0.0.1:13200
APP_HOST_GATEWAY_URL=http://127.0.0.1:13200
APP_HOST_CONTROL_TOKEN=<same-token-as-app-host>
HUB_RELEASE_AUDIT_COLLECTION=hubReleaseDeployments
HUB_RELEASE_AUDIT_ROLE=r_hub_release_auditor
HUB_RELEASE_AUDIT_TOKEN=<dedicated-api-key>
HUB_RELEASE_MANAGER_ROLES=root,admin
```

`APP_HOST_CONTROL_URL` is used by Hub's server-side release control plane.
`APP_HOST_GATEWAY_URL` is the internal runtime target and defaults to the same
address. Hub validates the App path and only proxies `/<app>/*`; App Host control
routes such as `/__apps` are never exposed by the browser gateway. The Hub UI
uses the same-origin App path returned by its own API instead of exposing the
internal App Host address.

The API key role should have only `list`, `create`, and `update` access to
`hubReleaseDeployments`, with all fields explicitly bound. It does not need
delete, schema configuration, Portal access, or permissions on CRM business
collections. Missing credentials, an unavailable NocoBase API, invalid audit
data, or a failed legacy import returns 503/502 before Hub asks App Host to
switch a release.

`HUB_RELEASE_STORE_PATH` is migration input only. If a legacy JSON file exists,
Hub upserts it into NocoBase by deployment ID on startup/first access. Repeated
imports converge without duplicate audit rows, and the original JSON file is
retained for recovery.

## Development

```bash
# Start the Vite development server
pnpm dev

# Build the production assets
pnpm build

# Serve a production build
pnpm start
```

Application pages and resources live under `client`. The included Users page is a
working example based on the standard NocoBase `users` collection.

Application translations live in `client/locales`. Default locale, available
locale labels, i18next options, and post-switch behavior remain customizable in
`client/providers/i18n/runtime.ts`. Shared UI components live in
`client/components/ui` and follow the shadcn Base UI conventions.

Stable NocoBase runtime behavior is provided by `@nocobase/app-portal-sdk`.
The template records its inherited base version in
`nocobase.defaultTemplateVersion`; SDK installation, development, and builds
stop with an actionable error when that version is outside the SDK's supported
range. Application composition and visual source remain owned by this project.

## Extensions

Installed extensions live in `client/extensions` and are ordinary
application-owned source files. Their providers, resources, routes, login
adapters, and user-menu items are discovered automatically.

Routes declared with `defineAppRoutes` can use `lazy: () => import(...)` to
keep page modules out of the initial bundle while preserving synchronous menu,
resource, and access metadata.

Set `registryRoutesEnabled` to `false` in `client/routes.tsx` when replacing the
bundled example navigation with application-owned routes. Installed extension
providers, login adapters, and the `/dev` component showcases remain available.

Optional NocoBase integrations, including authentication methods and i18n, can
be installed from the `@nocobase` Registry configured in `components.json`.
After installation, the generated source can be customized and committed with
the application.

Registry implementations import runtime APIs from documented
`@nocobase/app-portal-sdk` subpaths and continue to use `@/components` for
application-owned visual composition. Each Registry item declares the minimum
compatible SDK version in `registry.config.json`.

In this Registry source repository, canonical extension source lives in
`registry` and is loaded directly by `pnpm dev` and `pnpm build`. The published
npm template contains the default extensions under `client/extensions` instead.

## Authentication

Basic username or email and password login is built in. The default login page
also renders enabled NocoBase authentication methods when their frontend
Registry adapters are installed.

Customize `client/pages/login/index.tsx` to replace the whole login page, or use
`DefaultSignInPage` to keep dynamic authentication while overriding individual
authenticator UI.

## Testing

Frontend logic and component tests live under `tests/` and run with Vitest and
Testing Library. Registry-owned tests live beside each item under
`registry/<name>/tests`, while Portal SDK tests live under `sdk/tests` and run
through the SDK package. These tests exercise local behavior without mocking
NocoBase APIs, authentication, ACL, or data providers. Put behavior that needs
real server data under `e2e/` instead.

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test:sdk
```

Playwright E2E tests connect to a real NocoBase environment. The included smoke
test signs in through the actual Portal login page, verifies the server session,
and confirms that authentication survives a reload. It does not depend on any
Registry example page.

Copy `.env.e2e.example` to `.env.e2e` and provide a dedicated test account.
Playwright always starts an isolated Portal dev server at
`http://127.0.0.1:4173` (configurable with `NOCOBASE_E2E_PORT`) and stops it when
the run finishes. Set `NOCOBASE_E2E_API_URL` to the real NocoBase backend and
`NOCOBASE_PORTAL_BASE` to the Portal path under test. The default command never
reuses a manually started frontend.

```bash
pnpm test:e2e:install
pnpm test:e2e
pnpm test:e2e:ui
```

Reusable E2E helpers currently live in `e2e/support`. They provide environment
and basename resolution, NocoBase resource/action requests, API sign-in and
session checks, and browser session installation. Keep business-specific test
data and assertions in the application. These helpers can move into the Portal
SDK after their application-facing contract has stabilized.

The root `pnpm test` command includes both template and Registry tests. The
published template contains materialized extensions instead of `registry/`,
but their tests remain source-repository checks and are not copied into user
projects.
Default Template source upgrades are documented in the
[template migration guide](https://github.com/nocobase/portal-template-default/blob/main/MIGRATION.md).
SDK API and compatibility changes are documented separately in the
[Portal SDK migration guide](../portal-sdk/MIGRATION.md).

## Learn more

- [NocoBase documentation](https://docs.nocobase.com/)
- [Refine documentation](https://refine.dev/docs/)
- [shadcn/ui documentation](https://ui.shadcn.com/)

## License

MIT
