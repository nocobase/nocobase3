# @nocobase/app-plugin-authorization

Connects `@nocobase/authorization` to the default application runtime.

The plugin currently provides:

- Better Auth users as `user` principals;
- `authenticated:*` as a request subject;
- Permission Sets and page authorization;
- `GET /api/authz/permissions`;
- Permission Set administration under `/api/authz/permission-sets`;
- a Permission Set page at `/settings/authorization/permission-sets`;
- a migration for Permission Set storage;
- an initial System Administrator Permission Set assigned to the default
  `nocobase` user.

Applications create the shared instance once and expose it through their
server dependencies:

```ts
const authz = createAppAuthorization({
  connection: runtime.database?.connection(),
});
```

Business plugins keep their own routes and services and use `deps.authz` before
performing protected operations.
