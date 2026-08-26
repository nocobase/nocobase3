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
- an initial System Administrator Permission Set assigned to the default
  `nocobase` user.
- a separate Default Pages Permission Set, so page access can be changed without
  changing administrator capabilities.

Every authenticated client route is authorized as `page:<route name>/access`
unless the route declares an explicit authorization resource. Removing the
corresponding page grant therefore blocks direct navigation as well as hiding
the navigation entry.

Applications create the shared instance once and expose it through their
server dependencies:

```ts
const authz = createAppAuthorization({
  connection: runtime.database?.connection(),
});
```

Business plugins keep their own routes and services and use `deps.authz` before
performing protected operations.
