# @nocobase/hub-release-management

Deployment-management plugin for NocoBase Hub. It owns trusted
artifact activation, application lifecycle actions, authorization adapters,
artifact-driven App registration, audit persistence, HTTP routes, and the
headless client API used by Hub pages.

Hub remains the product entry and UI host. It does not store App source code;
source stays in the user's Git repository. App Host remains the execution plane
that validates and activates immutable build artifacts.

The default Hub UI does not require or expose empty App registration. The first
valid artifact upload creates the managed App record automatically. The legacy
`POST /api/apps` endpoint remains available for compatibility; it records only
Hub metadata and never creates source code or writes into App Host.

`POST /apps/:appId/releases` authenticates a dedicated Hub deployment token,
streams the gzip Release archive to App Host, registers the App only after a
successful immutable install, and then reuses the normal deployment flow.
Retries with the same Release content and idempotency key converge without a
second activation. Invalid archives never create an App registration.

The default P0 route deploys the uploaded artifact directly and keeps start,
stop, and restart as first-class operations.
Set `HUB_RELEASE_APPROVAL_REQUIRED=true` to opt into the existing approval and
notification workflow. Rollback and multi-environment governance remain
later product layers rather than the default Hub navigation. The legacy
rollback endpoint is disabled by default and can be enabled explicitly with
`HUB_RELEASE_ROLLBACK_ENABLED=true` while that layer is developed.

## Package boundaries

- `@nocobase/hub-release-management/server` exposes the trusted service,
  stores, authorizers, and a `createReleaseManagementApiPlugin()` composition
  entry. The plugin owns the `/apps` and `/release-management` API routes;
  Hub's generic server shell does not import its services or stores.
- `@nocobase/hub-release-management/client` exposes the browser API, state
  hook, presentation logic, and shared contracts.
- `@nocobase/hub-release-management/types` exposes transport contracts without
  importing browser or server runtime code.

The package is publish-ready and has its own version and compiled exports. It
does not contain license enforcement yet; commercial packaging can add that
policy without moving the implementation back out of Hub.
