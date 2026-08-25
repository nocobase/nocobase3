# NocoBase CRM

Agent-built CRM application based on `@nocobase/app-template-default` and
`@nocobase/portal-sdk`.

## Product scope

- Sales dashboard with server-side NocoBase aggregation
- Lead, opportunity, account, contact, and activity workspaces
- URL-addressable create, detail, and edit drawers
- NocoBase authentication, ACL, resource actions, and record permissions
- Idempotent data-model reconciliation through the supported `nb` CLI surface
- Machine-verifiable model and server ACL release contract
- App Host-compatible embedded server and release identity health response

## Local configuration

Copy `.env.example` to `.env.local` and set a NocoBase API target:

```env
APP_NAME=crm
APP_BASE_PATH=/crm
NOCOBASE_API_URL=/crm/v2/api
NOCOBASE_API_PROXY_TARGET=http://127.0.0.1:13000/api
```

Do not commit `.env.local`, API tokens, or credentials.

## Data model

Preview the desired model without changing NocoBase:

```bash
pnpm model:apply -- --env local --plan
```

Apply it to an explicitly named environment and prove a converged second pass:

```bash
pnpm model:apply -- --env local --yes --verify-idempotent
```

The command creates only `agent_crm_*` collections. Relations to `users` do not add
reverse fields to the shared users collection.

The confirmed server permission matrix is committed in
`nocobase/acl/policy.json`. The release gate checks both CRM roles, every
collection action, `all`/`own` record scope, and explicit full-field coverage.
It is read-only and requires an explicitly named NocoBase environment:

```bash
pnpm release:verify --env local
```

## Development

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

Run the browser acceptance flow against the local NocoBase environment. The
test starts a Portal server and Vite on separate ports, sends browser API
traffic through the Portal's same-origin proxy, and removes the CRM record it
creates:

```bash
NOCOBASE_E2E_ACCOUNT=nocobase \
NOCOBASE_E2E_PASSWORD=<local-password> \
NOCOBASE_E2E_API_URL=http://127.0.0.1:13000/api \
NOCOBASE_E2E_BROWSER_CHANNEL=chrome \
pnpm test:e2e
```

Omit `NOCOBASE_E2E_BROWSER_CHANNEL` after running
`pnpm test:e2e:install` to use Playwright's pinned Chromium instead.

Production builds generate `dist/client` and `dist/server`. Release tooling
packages that output into an immutable App Host release directory; source code
must never write directly into an active release.

## Package an App Host release

Build and package a local release from the repository root:

```bash
pnpm --filter @nocobase/app-crm build
pnpm --filter @nocobase/app-crm release:pack \
  --env local \
  --release-id release-v1 \
  --nocobase-api-url http://127.0.0.1:13000/api
```

Before writing anything, `release:pack` runs the same model and ACL gate against
the selected environment. The package is then written to
`app-dist/crm/releases/release-v1` with an App Host manifest, runtime metadata,
a content fingerprint, and the production `dist` tree. The normalized contract
is embedded at `dist/server/release-contract.json`, so model or permission
contract changes also change the signed artifact checksum. Repeating the
command is a no-op when the content is identical. If code, runtime
configuration, contract, or the NocoBase API target changes, the command fails
closed and requires a new release id.

Start App Host against the generated release catalog:

```bash
APP_DIST_DIR="$PWD/app-dist" \
APP_HOST_PORT=13200 \
APP_HOST_CONTROL_TOKEN=local-release-demo \
pnpm --filter @nocobase/app-host start
```

App Host exposes the CRM at `http://127.0.0.1:13200/crm/` after `release-v1`
is deployed. Use NocoBase Hub's `/hub/deployments` page for authenticated
deployment, readiness-gate, NocoBase-backed audit, and rollback operations. The
Hub audit collection contract and runtime credential setup are documented in
`packages/hub/README.MD`; keep both control-plane tokens in local runtime
environment variables and never package or commit them.
