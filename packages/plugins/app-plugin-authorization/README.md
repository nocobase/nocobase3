# @nocobase/app-plugin-authorization

Application integration for `@nocobase/authorization`: authenticated user identities, database authorization, database stores and migrations, and permission management UI.

## Runtime boundaries

The library owns authorization decisions, permission sets, access-rule services, store contracts and HTTP handlers. This plugin owns database adapters, application identity middleware and UI. Permission sets, page and database authorization are built in; the application explicitly installs default access, sharing rules and restriction rules as needed.

`authorization.permissionSets.rootSet` and `authorization.permissionSets.defaultSet` configure the built-in set names, defaulting to `root` and `member`. The root set grants unrestricted access and may be assigned only to users. The member set applies through its `authenticated:*` assignment. Protection metadata determines which management operations each set allows.

Register each collection explicitly with `authz.getResource('database.collection').items.add(...)`. Database metadata supplies fields and primary keys. `authz.db.policyFor()` produces the Repository Policy for a request; `authz.db.repositories()` narrows static Repository API policies and does not register collections. See [database usage](docs/database-usage.md) and [page authorization](docs/pages.md).

## Permission management

Permission sets use a collapsible sidebar and routed tabs for permissions, user assignments and basic information. Each editable tab owns its save action. The permission editor displays registered resource types and nested display groups; database actions provide record-scope and field configuration.

Default access and sharing rules expand record scopes for users who already have the relevant action permission. Restriction rules limit those scopes. These rules do not grant action or field permissions.

The permission inspector displays a user's decision, reasons and conditions through `POST /api/authz/inspect`. It requires `settings/authorization.permission-sets/read`. Management endpoints under `/api/authz` enforce their corresponding settings permissions.

Client and server locale catalogues provide English and Chinese messages. Server options resolve resource titles and action labels for the request locale. Integration instructions and examples live in [the authorization Skill](skills/nocobase-app-plugin-authorization/SKILL.md).

## Resource groups and items

Use `authz.getResource(type)` to access a registered resource type. Settings and page authorization are built in. An unknown type throws. Each resource has a `groups` tree for display and a flat `items` registry for grantable resources. Group IDs must be unique within the resource type, including all descendants. An item's optional `group` references one of those IDs; omit it to display the item at the root. Group membership never grants access or changes an item's authorization ID.

```ts
const settings = authz.getResource('settings');
settings.groups.add({
  id: 'ai',
  title: 'AI',
  children: [{ id: 'ai.configuration', title: 'Configuration' }],
});
settings.items.add({
  id: 'ai.models',
  title: 'Models',
  group: 'ai.configuration',
  actions: ['read', 'update'],
});
```

Check this item with `{ resource: { type: 'settings', id: 'ai.models' }, action: 'update' }`. Authorization's own sections use `authorization.permission-sets`, `authorization.default-access`, `authorization.sharing-rules`, and `authorization.restriction-rules` under the same `settings` type. No data migration or legacy identifier fallback is provided.

Database collections use `authz.getResource('database.collection').items.add({ name: 'orders', title: 'Orders', group: 'sales' })`, retaining the database-specific registration shape and opt-in authorization boundary. Register display groups on that resource's `groups` first. Client page discovery preserves navigation-only route groups recursively and references them from flat page items; route nodes that load a page retain their existing authorization boundary. Server-declared page items and groups are also exposed in the picker.
