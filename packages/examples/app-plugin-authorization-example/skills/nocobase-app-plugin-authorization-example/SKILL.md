---
name: nocobase-app-plugin-authorization-example
description: Use the NocoBase 3 authorization example plugin to demonstrate authorized Repository API endpoints, an owner-stamping custom route, and a seeded Permission Set that scopes rows with recordsIOwn.
---

# Authorization example

This plugin owns one collection, `authorizationExampleTasks`, and one page,
`/authorization-example`. Use it when explaining how an application route meets
`@nocobase/app-plugin-authorization`. Do not use it as a task manager or store
unrelated data in its table.

## Prerequisites and registration

The application must register `@nocobase/app-plugin-authentication`,
`@nocobase/app-plugin-authorization` and this plugin on the Server, and this
plugin's Client factory. Apply migrations and seeds before opening the page.

## Public surfaces

- Client factory: `@nocobase/app-plugin-authorization-example/client`.
- Server definition: `@nocobase/app-plugin-authorization-example/server`.
- Page: `/authorization-example`, relative to the application mount point.
- Repository: `authorizationExampleTasks`, with `findMany`, `findOne`, `count`,
  `updateOne` and `deleteOne`. There is no `createOne`: creating goes through
  `POST /authorization-example/tasks`, which takes a title and stamps the owner
  from the principal.

## What it demonstrates

- `authorization.repositories(exposures)` narrowing a static Policy shape with
  the caller's grants, mounted on each endpoint by name.
- Writing `read` as a node with `fields` and `relations` rather than `true`,
  because a grant patch carries no relation model and replaces a `true` member
  wholesale.
- A hand-written route that binds the same Policy through
  `repository.withPolicy()` because the value it writes is the server's to
  decide, never the request body's.
- A seed that writes Permission Set rows in the shape `authz.database.grant()`
  emits, idempotently, and does nothing when the authorization tables are
  absent.

## Ownership and verification

The plugin owns its migration, seed, routes, page and locale strings. An
application reaches it through public package exports; do not import private
source paths. For a schema change write a new migration after the existing one
has shipped rather than editing it.

`pnpm --filter @nocobase/app-plugin-authorization-example check` runs lint,
formatting, typecheck, real SQLite route tests and build.
