# @nocobase/app-plugin-authorization

Connects `@nocobase/authorization` to the default application runtime.

The plugin currently provides:

- Better Auth users as `user` principals;
- `authenticated:*` as a request subject;
- Permission Sets, page authorization, and database authorization;
- Default Access, Sharing Rules, and Restriction Rules;
- `GET /api/authz/permissions`;
- independent administration APIs and permissions for each Authorization plugin;
- separate settings pages for Permission Sets, Default Access, Sharing Rules,
  Restriction Rules, and Database Authorization;
- selection-based editors for resources, actions, users, and record scopes;
- migrations for Permission Sets and access rules;
- two built-in roles: a System Administrator Permission Set that carries no
  grants and whose protection declares `unrestricted: true`, so its holders
  bypass per-resource authorization including Sharing and Restriction Rules,
  seeded onto the default `nocobase` user and assignable to any number of
  users;
- an `authenticated` Permission Set bound to the `authenticated:*` subject,
  the editable baseline every signed-in user holds;
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
authorization instance in the service container:

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
