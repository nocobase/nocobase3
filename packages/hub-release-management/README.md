# @nocobase/hub-release-management

Internal release-management module for NocoBase Hub. It owns the trusted
release orchestration, authorization adapters, audit persistence, HTTP routes,
and the headless client API used by Hub pages.

Hub remains the product entry and UI host. App Host remains the execution
plane that validates and activates immutable App Releases.

## Package boundaries

- `@nocobase/hub-release-management/server` exposes the trusted service,
  stores, authorizers, and Hono routes.
- `@nocobase/hub-release-management/client` exposes the browser API, state
  hook, presentation logic, and shared contracts.
- `@nocobase/hub-release-management/types` exposes transport contracts without
  importing browser or server runtime code.

The package is publish-ready and has its own version and compiled exports. It
does not contain license enforcement yet; commercial packaging can add that
policy without moving the implementation back out of Hub.
