# Build an organisation dimension

Use this reference when permission sets should follow where people sit in the organisation: departments, and optionally positions or roles. It builds the organisation in the application and plugs it into authorization as an inherited subject type, so an administrator assigns a permission set to a department and its members inherit it. Read [application permission development](authorization.md) and the installed `nocobase-app-plugin-authorization` Skill, especially its `references/subjects-and-administration.md`, before starting.

## 1. When to use it, and its scope

Build this when access follows a department tree: a user belongs to several departments, one of them primary, and a permission set assigned to a department reaches everyone in it and in the departments below it. Departments and memberships are disabled rather than deleted, because assignments and history keep referring to them. Positions and roles are not built in; model them the same way when the business needs them (section 12).

The paths below are an application's. When the organisation ships as a plugin package instead, the same code moves to the plugin layout that the repository's plugin development Skill describes: migrations and seeds under `database/migrations` and `database/seeds` with names derived from the package, providers and routes declared through `defineServerPlugin`, and pages through `defineClientPlugin`.

## 2. Model decisions

| Table               | Fields                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `departments`       | `id` string primary key, `title`, `parentId` nullable, `active` default true, `sortOrder` integer default 0 |
| `departmentMembers` | `id` string primary key, `departmentId`, `userId`, `primary` default false, `active` default true           |

- Ids are stable strings. Permission-set assignments, sharing rules and seeds store the department id, so never reuse or renumber one. Generate them with `idGeneratorToken` or use a fixed code chosen by the administrator.
- `departmentMembers` is unique on `(departmentId, userId)`, indexed on `userId`. `userId` is the authentication plugin's user id; read users only through `userAdministrationServiceToken` from `@nocobase/app-plugin-authentication`, never through its table. A seed that creates demonstration accounts is the one exception, described under seeds below.
- A department tree is small enough to load whole. Resolve ancestors and descendants in memory from one `select id, parentId, active` and stop at a node already visited, so a cycle written by mistake cannot loop forever. Reject a `parentId` that would create a cycle when saving.
- A department counts only while it and every ancestor are active. Disabling a parent therefore disables its subtree without touching child rows.
- At most one active primary membership per user. Clear the others and set the new one inside the same transaction as the membership write.

## 3. Migrations

Write the tables in one self-contained migration under `database/main/migrations/`; read [migrations and seeds](migrations.md) and the `nocobase-db` Skill sections 2 and 3 for the file shape and the builder. Never import a runtime definition, constant or service into a migration.

```ts
import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_departments',
  async up({ builder }) {
    await builder.createCollection('departments', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('title').notNull();
      c.string('parentId', { length: 64 }).nullable();
      c.boolean('active').notNull().defaultTo(true);
      c.integer('sortOrder').notNull().defaultTo(0);
      c.index('parentId');
    });
    await builder.createCollection('departmentMembers', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('departmentId', { length: 64 }).notNull();
      c.string('userId', { length: 64 }).notNull();
      c.boolean('primary').notNull().defaultTo(false);
      c.boolean('active').notNull().defaultTo(true);
      c.unique(['departmentId', 'userId']);
      c.index('userId');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('departmentMembers');
    await builder.dropCollection('departments');
  },
});

export default migration;
```

## 4. The organisation service

Put the rules in one service registered by a provider, as [services and jobs](services-and-jobs.md) describes, so routes, the subject type and tests share them. Every read takes an optional connection, so it can run inside the caller's transaction.

```ts
export interface OrganizationService {
  /** Every department with `parentId`, `active` and `sortOrder`, for the settings tree. */
  listTree(): Promise<readonly Department[]>;
  getDepartment(id: string): Promise<Department | undefined>;
  createDepartment(input: {
    id?: string;
    title: string;
    parentId?: string | null;
  }): Promise<Department>;
  /** A new `parentId` changes what the subtree inherits, so a move returns the subtree's members as `changed`. */
  updateDepartment(
    id: string,
    input: { title?: string; parentId?: string | null; sortOrder?: number },
  ): Promise<{ department: Department; changed: readonly string[] }>;
  /** The picker page: active departments only, literal title search, stable order. */
  listDepartments(query: {
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: readonly SubjectOption[]; total: number }>;
  /** Titles of the requested ids that exist; a disabled one says so in `description`. */
  resolveDepartments(ids: readonly string[]): Promise<readonly SubjectOption[]>;
  /** The department and its ancestors, nearest first; `undefined` when any is inactive or missing. */
  activeChain(
    departmentId: string,
    connection?: DatabaseConnection,
  ): Promise<readonly string[] | undefined>;
  /** The ids whose whole chain is active, from one tree read. */
  filterActive(
    ids: readonly string[],
    connection?: DatabaseConnection,
  ): Promise<readonly string[]>;
  /** Active direct departments of an active membership, plus their ancestors. */
  departmentsOf(
    userId: string,
    connection?: DatabaseConnection,
  ): Promise<readonly string[]>;
  /** Users in the department or any active descendant, one page. */
  effectiveMembers(
    departmentId: string,
    query: { search?: string; page: number; pageSize: number },
  ): Promise<{ items: readonly SubjectOption[]; total: number }>;
  /** The details page: active direct memberships with `primary`. */
  directMembers(departmentId: string): Promise<readonly DirectMember[]>;
  /** Each write runs in one transaction and returns the user ids whose membership changed. */
  addMember(input: {
    departmentId: string;
    userId: string;
    primary?: boolean;
  }): Promise<readonly string[]>;
  removeMember(
    departmentId: string,
    userId: string,
  ): Promise<readonly string[]>;
  setPrimary(departmentId: string, userId: string): Promise<readonly string[]>;
  setActive(departmentId: string, active: boolean): Promise<readonly string[]>;
}
```

`listDepartments` searches through a Repository filter's `includes`, which matches the text literally, so `%` and `_` mean themselves; sort by title, then id, so pages never repeat or skip a row. `effectiveMembers` collects the active memberships of the department's active subtree, then pages through users with `userAdministrationServiceToken`'s `list({ userIds, search, status: 'enabled', page, pageSize })`, so search and paging follow the user directory. Describe each member with the titles of its direct departments inside the subtree. `setActive` returns every member of the subtree, and `removeMember` the removed user.

## 5. Routes

Mount the organisation endpoints as an isolated router under your prefix with `auth.required()` and `authz.middleware()`, and check the organisation settings item in every handler: `read` for lists and details, `update` for writes. Read [server routes](server-routes.md) for the router, its registration and why each route owns its security.

```ts
routes.use('*', auth.required(), authz.middleware());
const require = (c: Context<AuthorizationEnv>, action: 'read' | 'update') =>
  c
    .get('authz')
    .require({ resource: { type: 'settings', id: 'organization' }, action });

routes.get('/departments', async (c) => {
  await require(c, 'read');
  return c.json({ data: await organization.listTree() });
});
routes.post('/departments/:id/members', async (c) => {
  await require(c, 'update');
  const changed = await organization.addMember({
    departmentId: c.req.param('id'),
    ...(await readMemberInput(c)),
  });
  await refreshUsers(changed); // section 8, after the commit
  return c.json({ data: { changed } }, 201);
});
```

A denied `require` answers `403 { code: 'FORBIDDEN', message }` on its own; add `routes.onError` only for the service's own validation errors, answering 400, 404 or 409, and rethrow anything else. Validate every input, including that `userId` names an enabled user and that a new `parentId` creates no cycle. Answer an unknown department with 404.

## 6. Settings pages

Register the settings item and its place in the provider's `boot`, as the authorization Skill's `references/runtime-api.md` "Settings items" shows:

```ts
authz.ui.sections.add({
  name: 'organization',
  title: 'Organization',
  parent: 'administration',
});
authz.settings.add({
  id: 'organization',
  title: 'Organization',
  actions: [{ name: 'read' }, { name: 'update' }],
});
authz.ui.place(
  { type: 'settings', id: 'organization' },
  { section: 'organization' },
);
```

Declare the pages in `client/routes.ts` with `defineSettingsRoutes`. The department details page is a child route, so it inherits the entry page's `authz`, and its path is the one `manage` returns (section 7):

```ts
defineSettingsRoutes([
  {
    name: 'organization',
    path: '/organization',
    navigation: { title: 'navigation.organization', icon: Network },
    authz: {
      resource: { type: 'settings', id: 'organization' },
      action: 'read',
    },
    componentLoader: () => import('./pages/settings/organization/index.js'),
    children: [
      {
        name: 'department',
        path: '/departments/:departmentId',
        componentLoader: () =>
          import('./pages/settings/organization/department.js'),
      },
    ],
  },
]);
```

The list page shows the tree with enable and disable; the details page shows the department's members with add, remove and set-primary, each write hidden unless `useCan({ resource: { type: 'settings', id: 'organization' }, action: 'update' })`. Follow [pages and routes](frontend/references/page.md), [child routes](frontend/references/child-routes.md), [dialogs and drawers](frontend/references/overlay.md) and [list pages](frontend/references/table.md), and the authorization Skill's `references/client-development.md` "Settings screens". Permission-set assignment stays in Settings → Authorization; do not build a second assignment editor.

## 7. Register the department subject type

Register in the same provider's `boot` and call the returned function in `shutdown`. `members` and `manage` are the optional capabilities the authorization Skill's `references/subjects-and-administration.md` describes: with them, the permission-set assignments tab lists a department's members and links to its details page.

```ts
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type { DatabaseConnection } from '@nocobase/db';

export const DEPARTMENT_SUBJECT = 'org.department';

export function registerDepartments(
  authz: AppAuthorization,
  organization: OrganizationService,
): () => void {
  return authz.subjects.add<DatabaseConnection>(DEPARTMENT_SUBJECT, {
    // Every request recomputes this from the database.
    resolveFor: async (principal) =>
      principal.type === 'user' ? organization.departmentsOf(principal.id) : [],
    // Protected assignment checks pass their transaction; read through it.
    filterActive: (ids, transaction) =>
      organization.filterActive(ids, transaction),
    administration: {
      title: 'Departments',
      selection: {
        type: 'collection',
        list: (query) => organization.listDepartments(query),
        resolve: (ids) => organization.resolveDepartments(ids),
      },
      members: (id, query) => organization.effectiveMembers(id, query),
      manage: (id) =>
        `/settings/organization/departments/${encodeURIComponent(id)}`,
    },
  });
}
```

- `resolveFor` returns the ids of the user's active memberships whose whole ancestor chain is active, together with those ancestors, deduplicated. A permission set assigned to a parent department therefore reaches members of its children.
- `filterActive` keeps an id only while its whole chain is active, reading through the transaction it receives.
- `members` returns effective members, direct members plus those of active descendants, and each member's `description` names its direct department.
- `title` may be `{ key, ns }` with a client translation, as the authorization Skill describes for other titles.

## 8. Refresh sessions after membership changes

The server resolves membership on every request, so a membership change takes effect on the next request without anything else. Clients cache their permission snapshot, so after the transaction commits, notify each affected user; never notify from inside the transaction, and never after a rollback.

```ts
async function refreshUsers(userIds: readonly string[]): Promise<void> {
  for (const id of new Set(userIds))
    await authz.permissionSets.notifyAssignmentsChanged({ type: 'user', id });
}
```

Assigning or revoking a permission set on a department needs nothing from you: an assignment change on any subject other than a user refreshes every signed-in client.

## 9. Seeds

A seed writes an idempotent department tree and memberships, keyed on the fixed ids, parents before children, and skips rows that already exist so an administrator's later changes survive. Assign initial permission sets to departments with `subjectType: 'org.department'` rows in `authorizationPermissionSetAssignments`, after checking the `(permissionSetKey, subjectType, subjectId)` triple. Follow the authorization Skill's `references/code-and-seeds.md` for the permission-set and assignment rows and [migrations and seeds](migrations.md) for where seeds run. Seed only real users you know; memberships of demonstration accounts belong to demonstration data, not to production initialization. When a demonstration needs accounts, seed them: with the seed's `query`, insert the `user` row and a `credential` `account` row whose `accountId` is the user id and whose `password` comes from `hashPassword` in `better-auth/crypto`, declared in `dependencies`. Write an account only when no user has its email, and write its memberships and direct assignments in the same step, so a replay never re-adds what an administrator removed. `database/seeds/202609220002_sales_permissions.ts` in `@nocobase/app-plugin-authorization-example` is the reference.

## 10. Test matrix

Follow [testing and verification](testing.md) for the layers and fixtures. Most of the matrix needs the real authorization routes and middleware, so start the application itself with the authentication and authorization plugins, and the sharing-rules plugin for the cross-department case, on a temporary SQLite database; startup then runs every plugin's migrations and seeds. Sign users up through `POST /api/auth/sign-up/email` and reuse the cookie, and create permission sets and assignments through `authz.permissionSets`. When a test composes the `Application` by hand instead of through `resolveAppRuntime`, resolve the plugins with `resolveAppServerPlugins(rootDir, defineServerPlugins([...]))`, since that is what finds each plugin's migrations and seeds, and name the driver in the database configuration, `drivers: { sqlite }`. Cover at least:

| Area                  | Cases                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration             | `up` then `down` against a real database; the physical tables, unique and index exist and are gone again                                                                                                |
| `resolveFor`          | Direct departments plus ancestors; a disabled membership, a disabled department and a disabled ancestor each drop out; a cycle terminates                                                               |
| `filterActive`        | Inside a transaction that disables a department, the id drops out through that transaction, and the fallback connection is never used; after rollback the id is active again                            |
| Inheritance           | A set assigned to a parent department reaches a member of a child department on a new request                                                                                                           |
| Revocation            | Removing the member, disabling the department and revoking the department's assignment each end the inherited access on their own, while a direct assignment to the same user keeps working             |
| Routes                | 401 without a session, 403 without the settings item (and `update` for writes), 200 with it; invalid input answers 400                                                                                  |
| `members`             | Paging and search pass through `GET /api/authz/permission-sets/subjects/org.department/:id/members`; descendants are included and disabled ones are not; each `description` names the direct department |
| Cross-department case | A sharing rule that lists a department lets its members reach another department's records only for the action they already hold, and removing either required scope denies it again                    |
| Refresh               | Each membership write notifies exactly the users it changed, after commit                                                                                                                               |

For the cross-department case, give the business records a `departmentId` and, when a data scope should follow the organisation, a record access such as `org.ownDepartments` whose resolver reads the principal's departments from the organisation service (`authz.recordAccess.define`, see the authorization Skill's `references/business-module.md`); a resolver receives the principal, never client input. There is no `$in` operator; match a list of ids as a union of equality conditions:

```ts
authz.recordAccess.define(
  defineRecordAccess('org.ownDepartments', (access) =>
    access
      .title('My departments')
      .collections('projects')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        const ids = await organization.departmentsOf(principal.id);
        // No department selects nothing, never every record.
        return ids.length
          ? anyScope(ids.map((id) => condition('departmentId', '$eq', id)))
          : false;
      }),
  ),
);
```

`anyScope` and `condition` come from `@nocobase/app-plugin-authorization/server`. When the resolver answers `false` for a caller who holds the action, the policy's scope matches no rows, so the bound Repository returns an empty result; only a caller without the grant is denied. Grant the operation through a permission set first, then share the other department's records with a sharing rule whose subject is the receiving department, as the `nocobase-app-plugin-authz-sharing-rules` Skill describes; sharing never grants the operation itself. Run the business endpoint, not only the inspector.

## 11. Pitfalls

- Disabling a parent is a check on the ancestor chain, not a cascade that rewrites child rows.
- Never accept membership, departments or subjects from the client. `resolveFor` reads the database, and background work that calls `authz.for(identity)` supplies verified subjects itself.
- A `manage` path starts with `/settings` and never contains the deployment base path; the client router adds it.
- `list`, `resolve`, `members` and the picker run behind the settings item of the page calling them — permission sets, the inspector or a rule plugin — not behind your organisation item. Add a check of your own in them only if the directory has an independent boundary.
- Inspecting a department in Settings → Authorization → Inspector shows the department's own grants, not the union of its members'. Inspect a member to see what inheritance gives that person.
- A department id stored in an assignment outlives the department; disable instead of deleting so its assignments stay readable and revocable.

## 12. Positions and roles

When access also follows a position or a role, model it like departments: its own table, memberships with `active`, and its own subject type such as `org.position`, flat and without ancestors, registered the same way. What a role may do is expressed only by permission sets assigned to that subject type. Never build a separate role-to-permission table; it would bypass the workspace, the inspector and the rule plugins.
