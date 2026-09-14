# @nocobase/app-plugin-authorization

Connects `@nocobase/authorization` to the default application runtime.

The plugin currently provides:

- Better Auth users as `user` principals;
- `authenticated:*` as a request subject;
- Permission Sets, page authorization, and database authorization;
- Default Access, Sharing Rules, and Restriction Rules;
- `GET /api/authz/permissions`, the permission option endpoints, and the
  record pickers behind the settings pages;
- one dispatcher under `/api/authz` that serves whatever HTTP surface the
  installed Authorization plugins registered, each of them checking its own
  `authorization.settings/<id>` permission;
- separate settings pages for Permission Sets, Default Access, Sharing Rules,
  Restriction Rules, and Database Authorization;
- selection-based editors for resources, actions, users, and record scopes;
- migrations for Permission Sets and access rules, together with the database
  stores those migrations create the tables for: the library defines the store
  contracts and requires one, and the implementations ship here beside the
  migration rather than in a storage-agnostic library;
- two built-in roles: a `root` Permission Set that carries no grants and whose
  protection declares `unrestricted: true`, so its holders bypass per-resource
  authorization including Sharing and Restriction Rules, seeded onto the
  default `nocobase` user and assignable to any number of users;
- a `member` Permission Set bound to the `authenticated:*` subject, the
  editable set every signed-in user holds;
- protected Permission Sets whose owner plugin controls which generic
  definition and assignment operations remain available;
- atomic replacement of one application's assignment scope without changing a
  user's unrelated Permission Sets;
- a public Client service token and Realtime cache invalidation for individual
  user assignments and grants shared by all authenticated users.

Every authenticated client route is authorized as `page:<route name>/access`
unless the route declares an explicit authorization resource. Removing the
corresponding page grant therefore blocks direct navigation as well as hiding
the navigation entry.

The plugin provider resolves the shared database capability and registers the
authorization instance in the service container under `authorizationToken`,
and the Permission Sets api it installs under `permissionSetsToken`. A
consumer that manages Permission Sets resolves that token rather than probing
the instance:

```ts
const database = services.resolve(databaseManagerToken);

services.singleton(authorizationToken, () =>
  createAppAuthorization({
    connection: database.connection(),
  }),
);
```

Business plugins keep their own routes and resolve `authorizationToken` from
the shared service container before performing protected operations.

`server/routes/authorization.ts` mounts the application's own endpoints first
and then one dispatcher over `authorization.routes`, so `/sharing-rules/options`
keeps answering while `/sharing-rules` itself is served by the library plugin.
An application that leaves a plugin out of its list simply has no route there:
nothing checks which plugins are installed.

## Configuration

What this application's authorization is belongs to the application, not to
the plugin. The provider reads the `authorization` configuration key and hands
it to `createAppAuthorization`, so an application states it the same way it
states `auth`:

```ts
// server/config/authorization.ts
const authorization: AppConfigFactory<AuthorizationConfig> = defineAppConfig(
  (_runtime) => ({
    permissionSets: { rootSet: 'root', defaultSet: 'member' },
    plugins: [
      pages(),
      databaseAuthorization({ source: 'main' }),
      defaultAccess(),
      sharingRules(),
      restrictionRules(),
    ],
  }),
);
```

| Field            | Default                                     | What it decides                                                                                                                             |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionSets` | `{ rootSet: 'root', defaultSet: 'member' }` | The keys of the two code-owned sets. The plugin installs Permission Sets itself; an application names its sets, not the plugin.             |
| `plugins`        | none                                        | The rest of the Authorization plugins this application installs. Dropping one is deleting a line; `databaseAuthorization` takes the source. |

The plugin ships no default list beyond Permission Sets: an application that
configures nothing else installs nothing else, and the library's own errors
say what is missing at first use.

## The database resource plugin

`databaseAuthorization` lives here rather than in `@nocobase/authorization`. It
is the adapter between the library's grant model and `@nocobase/db`'s Repository
Policy, and an adapter belongs on the side that knows both — the library stays
storage-agnostic and hands out opaque scope references for a resource plugin to
interpret. It produces db's filter AST directly, and
`authz.database.policyFor(collection, scope)` folds a request's read, create,
update and delete decisions into one `RepositoryPolicy` that
`repository.withPolicy()` binds, so a route runs plain `findMany` and
`createOne` instead of compiling a filter by hand. Collection metadata — field
names, the primary key, whether the database generates it — is read from db
rather than registered here, so anything db holds can be granted on.
`authz.repositories()` applies the same fold to `defineRepositoryApiRoutes()`
endpoints, narrowing each exposure's declared shape with the caller's grants.
See [docs/database-usage.md](./docs/database-usage.md), and
`@nocobase/app-plugin-authorization-example` for a runnable reference that puts
both an authorized Repository API and an owner-stamping route over one
collection.

The plugin always registers the identity step that turns a session into a
principal, and keeps Realtime permission invalidation in step with grant
changes through `authz.onGrantsChanged`, which reaches whichever Grant
Provider is installed rather than naming Permission Sets. Everything else is
the application's list. An application that drops `databaseAuthorization` keeps
working: the options endpoints then answer with no collections to grant. An
application cannot drop Permission Sets, and an application plugin that also
provides grants is refused as a second Grant Provider.

Both code-owned sets are named in `permissionSets: { rootSet, defaultSet }`,
which the library protects on its own behalf. The generic
management surface may assign and revoke `rootSet` but never edit or delete
it, and only to a `user` subject: a superuser is an account, never an
audience. It may edit `defaultSet`'s grants but neither delete the set nor
revoke its `authenticated:*` binding. `permissionSets.isUnrestricted(key)`
answers which set confers unrestricted access for an application's own code —
a role picker, for instance — rather than repeating the key.

`defaultSet` names a set and its protection. It does not mean "these grants
apply to every identity without an assignment": that comes from the
`authenticated:*` assignment row and from the identity step that adds the
subject.
