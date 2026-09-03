---
name: nocobase-app-plugin-file
description: Integrate @nocobase/app-plugin-file into NocoBase 3 application source for file-backed business fields, tables, API routes, authorization, uploads, downloads, and previews. Use when an App Agent needs to add file behavior to an application such as app-template-default; do not create a business plugin unless the user explicitly requests a reusable published package.
metadata:
  short-description: Add file behavior to a NocoBase application
---

# File attachments in application source

Use the File plugin's public factories and components while keeping the actual
business feature in the application. Read the target application's `AGENTS.md`
and its Client and Server instructions before editing; follow its existing
composition and test layout.

Do not run `plugin:create`, create `packages/plugins/app-plugin-*`, or add a
`defineServerPlugin()` declaration for an application-specific file feature.
Create a plugin only when the user explicitly requests an independently
published capability or the same domain implementation is intentionally shared
by multiple applications.

## Ownership

```text
Application owns
  business collections and file relations
  database/migrations and optional seeds
  Server Route composition and authorization policy
  Client pages, forms, state, navigation, and application copy
  application tests and observable workflow

@nocobase/app-plugin-file owns
  createFileRoute() and the standard HTTP contract
  createFilesClient() and FilesClient types
  reusable upload, list, thumbnail, and preview components
  storage, filename, token, and preview mechanics
```

## Application workflow

1. Confirm `@nocobase/app-plugin-file` is installed and registered so its
   Client and Server locale contributions are available.
2. Add the business collection and its standard file table under the
   application's `database/migrations/` directory.
3. Add a scoped `createFileRoute()` contribution under the application's
   `server/routes/` directory and include it in the App's routes array. Resolve
   Database, Drive, Session, authentication, and authorization from the App's
   existing container and config.
4. Resolve `appApiClientToken` from the owning App, pass that v3 `AppClient` to
   `createFilesClient()`, and use the reusable File components in the App page
   or form. Add an application route in `client/routes.ts` only when the
   workflow needs a new page.
5. Put application-specific user-facing text in the App's locale resources and
   behavior tests in the App's normal test directories.

## Core constraints

- Store stable metadata only. Never persist final URLs or access tokens.
- Keep table names and scope fields in Server code. Derive scope from validated
  Route parameters and apply it to every list, read, create, and delete query.
- Persist the parent record before constructing its scoped client or enabling
  uploads. Initialize edit and read views with `client.list()`.
- Use a unique owner key for one-to-one relations and an indexed owner key for
  one-to-many relations. Keep `UNIQUE (disk, key)` on each file table.
- Each application Route owns authentication and authorization. Map every
  `FileRouteAction` to the App's existing business policy and authorize the
  parent record before allowing file operations.
- `FileUploadField` removes only local controlled state by default. Use
  `removeOnDelete` for immediate Server deletion or let the App workflow call
  `client.remove()` deliberately.
- Do not use the legacy `storages:*` protocol, expose Drive credentials or the
  signing secret, accept table/disk/key names from the browser, or create a
  second Database/Drive/session runtime.

## References

- Read [quick start](reference/quick-start.md) for the App-owned end-to-end
  integration and composition locations.
- Read [data model](reference/data-model.md) when creating or reviewing the
  application's business and file collections.
- Read [Route API](reference/route-api.md) when implementing HTTP behavior,
  validation, visibility, tokens, or deletion.

## Completion

Verify the application migration, scoped Server Route, allowed and denied
authorization, Public and Private content access, limits, deletion, Client
upload state, preview behavior, and the real page-to-API workflow. Run the
target App's focused lint, typecheck, tests, and build; use inspectors only when
composition itself changed or is unexpectedly unavailable.
