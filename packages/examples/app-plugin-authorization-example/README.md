# @nocobase/app-plugin-authorization-example

A per-user task list, small enough to read in one sitting, that shows the two
ways an application route meets `@nocobase/app-plugin-authorization`.

Every row in `authorizationExampleTasks` belongs to whoever created it. The
seeded Permission Set gives each signed-in user `recordsIOwn` record access, so
an ordinary account reads, updates and deletes only its own rows, while a
holder of the root set bypasses grants and sees everyone's.

## The registration

A collection is grantable only once an application registers it, and the
registration carries the title the permission UI shows. This plugin does that
from a service provider, `AuthorizationExampleProvider`, rather than from a
route file:

```ts
this.app.container.resolve(authorizationToken).db.collections.add({
  name: COLLECTION,
  title: 'Authorization example: tasks',
  description: 'Tasks each signed-in user owns.',
});
```

Boot is where a declaration like this belongs; a route file builds routes.
`authorization.repositories()` registers nothing, so without the provider every
request for the collection is denied with `COLLECTION_NOT_REGISTERED`.

## The two routes

**The generated Repository API, authorized in place.** `authorization.repositories()`
returns a Hono middleware carrying the `principal` and `repositories` that
`defineRepositoryApiRoutes()` needs. Mounted on each endpoint by name, it folds
the caller's grants for the exposure's `resource` into a Repository Policy and
narrows the exposure's declared shape with it:

```ts
const authorize = authorization.repositories(repositories);
for (const { name, actions } of repositories)
  for (const action of Object.keys(actions))
    router.use(`/${name}:${action}`, authentication.required(), authorize);
```

Mount it on every action. One it did not run on resolves no principal, and
app-server answers `403 PRINCIPAL_REQUIRED` rather than falling back to the
shape. Guard each path by name, too: a wildcard would reach a contribution
mounted beside this one.

**A hand-written create.** The generated endpoint takes its values from the
request body, so a caller could name their own `ownerId` and become the owner
of a row they should not have. `POST /authorization-example/tasks` accepts a
title and nothing else, stamps the owner from the principal, and binds the same
Policy through `repository.withPolicy()`, so the grant still decides whether
the write happens at all. A refusal surfaces as 403, mapped from the
`WRITE_FORBIDDEN` and `FIELD_WRITE_FORBIDDEN` codes the Repository raises.

## The `read` node

The exposure writes `read` out as a node with its `fields` and `relations`
rather than as `true`:

```ts
read: { scope: true, fields: [...], relations: {} },
```

A grant carries no relation model, and narrowing replaces a `true` member
wholesale with the grant's patch — which would leave the read with no readable
relations at all. Writing the node keeps the shape's relation rules, whatever
the grant says about scope and fields.

## The seed

`202609150002_authorization_example_grant_members` creates the
`authorization-example-member` Permission Set and assigns it to
`authenticated:*`. Its grant names one resource and four actions: `read` and
`delete` and `update` under `recordsIOwn`, and a `create` that lists every
column the route stores, timestamps included — a write grant has to, because
`fields.input` is an allowlist and the server stamps `createdAt` and
`updatedAt` itself.

The seed writes the rows directly rather than calling the running
authorization, because a seed sees only `query` and `connection`. It is a no-op
when the authorization plugin's tables are absent, so the example still
installs into an application assembled without it, and it seeds no tasks: rows
are owned, so the page starts empty for each user.

## The page

`/authorization-example` lists the caller's tasks through `findMany`, adds one
through the custom route, toggles `status` through `updateOne` and removes one
through `deleteOne`. A 403 renders as a short notice rather than as an error,
because holding no grant is a configuration a user can be told about.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-authorization-example check
```
