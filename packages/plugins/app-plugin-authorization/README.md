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

The settings pages render on the same vendored shadcn components and theme
tokens as the rest of the application: `client/components/ui/*` with the `cn`
helper in `client/lib/utils.ts`, one page shell in
`client/components/page-shell.tsx` that supplies the heading, the loading card,
the retry card and the refusal card, and the management chrome in
`client/components/management-ui.tsx` built on those components. The Permission
Sets panel lives in `client/pages/permission-sets/`, one file per concern —
list, detail, permissions tab, assignments tab, editor, resource picker,
database policy editor — with its draft model and display text in
`drafts.ts` and `labels.ts`.

Every toolbar carrying a filter is a defined bar rather than loose controls on
the page background: `client/components/filters.tsx` supplies that bar, a search
field that clears itself, the resource-type chips and the control returning a
bar's filters to their defaults. Lists that grow page ten rows at a time through
`client/components/pagination.ts` and the pager at the foot of the table frame;
this is presentation over rows the panel already holds and asks the server for
nothing. The permissions tab opens on every resource the set grants, one row
each: the resource on one line with its type quietly beneath it, each granted
action with the mark saying what it reaches and its name beside it, a label
never splitting across lines while the column wraps between them,
and, for a collection, its records and its fields as two short clauses — the
record access policy as the options endpoint labels it, or `Mixed records`
where the actions disagree. A resource-type chip narrows it to that type's own
table, where the actions become columns and each collection cell shows whether
that action starts from every record, from a scoped set, or is not granted at
all. Opening a row reports that resource's actions one by one: whether each is
allowed, the record access policy and the parameters it holds, and the writable
and visible fields by name.

Every destructive action in these pages confirms first, through one
`ConfirmDialog` in `client/components/confirm-dialog.tsx` over the vendored
`client/components/ui/dialog.tsx`: deleting a permission set, a default access
rule, a sharing rule or a restriction rule, removing a granted resource from a
set, and revoking an assignment. The body names what is about to happen and to
what, the focus opens on cancel, and Escape or the backdrop leaves without
doing anything. Confirmation runs before the call, so the existing failure
paths are unchanged.

The four authorization plugins are separable packages, so no screen here reads
across them: each settings page edits its own layer and nothing else.

The settings module ships English and Chinese. `client/locales/` holds
`en-US.ts`, `zh-CN.ts` and an `index.ts` exporting one dynamic import per
locale, registered as `locales` on the client plugin, and every screen reads
them under the package name as its namespace through
`useAuthorizationTranslation()` in `client/i18n.ts`. Keys are structured by
screen, such as `permissionSets.list.title`, and a label helper that composes a
sentence takes the translator as its first argument rather than holding English
in a string.

The vocabulary the options endpoints send is translated on the server instead,
from `server/locales/`, registered as `locales` on the server plugin under the
same namespace. Resource type names, resource and action labels, subject types
and record access policy titles are resolved against the request's locale and
sent as plain strings, so the wire format carries no keys and no client threads
a translator to render them. The two catalogues share no key: each side owns the
strings it is the only one able to resolve. A request carries its language in
`Accept-Language`, which `@nocobase/app-client` sends from the application's
current locale, and the settings pages reload their options when the language
changes.

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
    plugins: [pages(), defaultAccess(), sharingRules(), restrictionRules()],
  }),
);
```

| Field            | Default                                     | What it decides                                                                                                                 |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `permissionSets` | `{ rootSet: 'root', defaultSet: 'member' }` | The keys of the two code-owned sets. The plugin installs Permission Sets itself; an application names its sets, not the plugin. |
| `plugins`        | none                                        | The rest of the Authorization plugins this application installs. Dropping one is deleting a line.                               |

The plugin ships no default list beyond the two built-in plugins, Permission
Sets and database authorization: an application that configures nothing else
installs nothing else, and the library's own errors say what is missing at
first use. Neither built-in plugin appears in an application's list, and
neither can be dropped.

## The database resource plugin

Database authorization is built in and reached as `authz.db`. It lives here
rather than in `@nocobase/authorization` because it is the adapter between the
library's grant model and `@nocobase/db`'s Repository Policy, and an adapter
belongs on the side that knows both — the library stays storage-agnostic and
hands out opaque scope references for a resource plugin to interpret. It
produces db's filter AST directly, and `authz.db.policyFor(collection, scope)`
folds a request's read, create, update and delete decisions into one
`RepositoryPolicy` that `repository.withPolicy()` binds, so a route runs plain
`findMany` and `createOne` instead of compiling a filter by hand.

`authz.db.collections` is the permission model: an application registers the
Collections it means to grant on, and a Collection nobody registered has no
permission at all — every request for it is denied with
`COLLECTION_NOT_REGISTERED`, an unrestricted identity included, because a
superuser bypasses grants rather than the model. Registration carries intent
only: a name, and optionally a `title` and `description` the permission UI
shows. Each of those is a string used as written, or `{ key, ns }` naming an
entry in a catalogue the registering package ships — the options endpoint
resolves it per request, so a plugin with no client bundle can still be named in
the reader's language. Field names, the primary key and whether the database generates it keep
coming from db at authorize time, so the two can never disagree. Repeating an
identical registration is a no-op, because boot runs more than once in some
hosts; one that disagrees with what is already registered throws.

```ts
authz.db.collections.add({ name: 'orders', title: 'Orders' });
authz.db.collections.add({
  name: 'invoices',
  title: { key: 'collections.invoices', ns: '@example/app-plugin-billing' },
});
```

`authz.db.repositories()` applies the same fold to
`defineRepositoryApiRoutes()` endpoints, narrowing each exposure's declared
shape with the caller's grants. It registers nothing: a Collection joins the
model only through `add()` — from the provider that owns it, at boot — which is
what lets it carry the title the permission UI shows, and an exposure naming an
unregistered Collection is refused like any other request for it.
See [docs/database-usage.md](./docs/database-usage.md), and
`@nocobase/app-plugin-authorization-example` for a runnable reference that puts
both an authorized Repository API and an owner-stamping route over one
collection.

The plugin always registers the identity step that turns a session into a
principal, and keeps Realtime permission invalidation in step with grant
changes through `authz.onGrantsChanged`, which reaches whichever Grant
Provider is installed rather than naming Permission Sets. Everything else is
the application's list. An application cannot drop Permission Sets or database
authorization, and an application plugin that also provides grants is refused
as a second Grant Provider.

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
