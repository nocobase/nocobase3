# NocoBase Hub

The self-contained NocoBase 3 application-management control plane. Hub owns
its users, permissions, applications, immutable releases, deployments, and
audit events. A local App Host owns the application runtimes.

![NocoBase Portal Template](https://static-docs.nocobase.com/2026-07-22-08-48-12.png)

## Quick start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The development entry starts at `http://127.0.0.1:13000/hub/` by default.
Vite runs behind the Hub server at `http://127.0.0.1:5173`.

## Configuration

The minimum local configuration is:

```env
APP_NAME=hub
APP_BASE_PATH=/hub
AUTH_SECRET=replace-with-at-least-32-random-characters
HUB_DATABASE_PATH=.nocobase/hub.sqlite
HUB_RELEASE_ROOT=app-dist
```

- `APP_NAME` is the runtime app name. Hub uses `hub`.
- `APP_BASE_PATH` is the public mount path for the app server. Hub uses `/hub`.
- `AUTH_SECRET` protects Hub sessions and must contain at least 32 characters.
  Inject it at runtime; never package or commit it.
- `AUTH_BASE_URL` is optional for loopback development. Set it to the complete
  public Better Auth URL, such as `https://hub.example.com/hub/api/auth`, when
  Hub is served from any non-loopback origin or behind a reverse proxy.
- `HUB_DATABASE_PATH` points to Hub's SQLite database.
- `HUB_RELEASE_ROOT` is the controlled root containing immutable application
  release artifacts. The same directory is used by the local App Host unless
  `APP_DIST_DIR` is set explicitly.

Hub management endpoints are served directly under `<APP_BASE_PATH>/api`, with
Better Auth at `<APP_BASE_PATH>/api/auth/*`. There is no default `/v2/api/*`
legacy proxy. An external NocoBase proxy is enabled only when both variables are
set explicitly:

```env
NOCOBASE_API_PROXY_TARGET=http://127.0.0.1:14000/api
NOCOBASE_API_PROXY_PATH=/external-api
```

`NOCOBASE_API_URL` does not enable or derive this proxy.

The browser API URL is injected by the Hub server and defaults to
`<APP_BASE_PATH>/api`.

### Release artifact checksum

Release registration accepts only the canonical lowercase
`sha256:<64 lowercase hex characters>` representation. To compute the v1
artifact checksum, start a SHA-256 stream with the UTF-8 domain prefix
`nocobase-release-artifact-v1` followed by one NUL byte. Recursively enumerate
regular files, reject symbolic links and special files, convert every relative
path to UTF-8 POSIX form, and sort paths by their UTF-8 byte order. For each
file, append these bytes in order:

1. the UTF-8 relative path;
2. one NUL byte;
3. the file length as an unsigned 8-byte big-endian integer;
4. the raw 32-byte SHA-256 digest of the file contents;
5. one NUL byte.

The final lowercase hexadecimal digest, prefixed with `sha256:`, is the Release
checksum. Directory metadata is intentionally excluded, so identical trees
produce the same checksum across supported platforms.

## Development

```bash
# Start the Vite development server
pnpm dev

# Build the production assets
pnpm build

# Serve a production build
pnpm start
```

Hub pages and resources live under `client`. The application, release, and
deployment pages consume only the authenticated Hub API; they never call App
Host management endpoints directly.

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

On first start, visit `/hub/setup` to create the single initial Owner. Public
registration and password-recovery routes are not exposed. Afterwards, sign in
with the Owner's username or email and password. Hub identities and permissions
are independent from identities inside managed applications.

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
