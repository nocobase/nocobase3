# @nocobase/app-plugin-authorization

Application integration for `@nocobase/authorization`: authenticated user identities, database authorization, database stores and migrations, and permission management UI.

## Runtime boundaries

The library owns authorization decisions, permission sets, access-rule services, store contracts. This plugin owns permission-set management HTTP handlers, database adapters, application identity middleware and shared administration UI. Permission sets, page and database authorization are built in; the application explicitly installs `@nocobase/app-plugin-authz-default-access`, `@nocobase/app-plugin-authz-sharing-rules` and `@nocobase/app-plugin-authz-restriction-rules` as needed. Each owns its database migration, store, management routes, settings resource, page and feature translations.

`authorization.permissionSets.rootSet` and `authorization.permissionSets.defaultSet` configure the built-in set names, defaulting to `root` and `member`. The root set grants unrestricted access and may be assigned only to users. The member set applies through its `authenticated:*` assignment. Protection metadata determines which management operations each set allows.

Register each collection explicitly with `authz.getResource('database.collection').items.add(...)`. Database metadata supplies fields and primary keys. `authz.db.policyFor()` produces the Repository Policy for a request; `authz.db.repositories()` narrows static Repository API policies and does not register collections. See [database usage](docs/database-usage.md) and [page authorization](docs/pages.md).

## Permission management

Permission sets use a collapsible sidebar and routed tabs for permissions, user assignments and basic information. Each editable tab owns its save action. The permission editor displays explicitly composed business operations in flat business and administration groups. Named scopes configure the data each operation can use. Underlying page, collection and custom resource types are never listed directly, including when no business group exists.

Default access and sharing rules expand record scopes for users who already have the relevant action permission. Restriction rules limit those scopes. These rules do not grant action or field permissions.

The permission inspector displays an authorization subject's decisions, reasons and conditions through `POST /api/authz/inspect` and `POST /api/authz/inspect/batch`. It requires `settings/authorization.inspector/inspect`. Management endpoints under `/api/authz` enforce their corresponding settings permissions.

Client and server locale catalogues provide English and Chinese messages. Options preserve translation descriptors for resource titles and action labels. Client rendering resolves them in the current language without refetching permission data. Integration instructions and examples live in [the authorization Skill](skills/nocobase-app-plugin-authorization/SKILL.md).

## Resource registration

`authz.resourceTypes.add()` registers an underlying authorization handler. `authz.getResource(type)` accesses its item registry; `authz.pages.add()` and `authz.db.collections.add()` register page and collection targets. These registrations define executable authorization boundaries and never create permission-editor entries.

`authz.resourceGroups.add()` and `authz.resources.add()` declare the operations administrators configure. The flat group's `category` is `business` or `administration` and only controls presentation. Each operation composes underlying grants; the resulting data conditions must still be enforced by the server.

```ts
authz.resourceGroups.add({
  name: 'ai',
  title: 'AI',
  category: 'administration',
});
authz.resources.add({
  name: 'ai.models',
  title: 'Models',
  group: 'ai',
  actions: ['read', 'update'].map((name) => ({
    name,
    title: name,
    grants: [authz.settings.grant('ai.models', [name])],
  })),
});
```

The server checks `{ resource: { type: 'settings', id: 'ai.models' }, action: 'update' }`. Registering the operation does not grant it: a permission set must grant the composed operation and be assigned to the requesting subject. Explicit client checks such as `access: { resource: 'type:id', action: 'action' }` only control visibility and do not replace server enforcement.

## Selectable authorization subjects

Subject types use the existing `authz.subjects.define(type, definition)` registration. The application plugin augments the library's subject definition with optional `administration` metadata; the authorization library does not depend on user directories or HTTP services.

```ts
authz.subjects.define('department', {
  filterActive: (ids, transaction) =>
    departments.filterActive(ids, transaction),
  administration: {
    title: 'Departments',
    selection: {
      type: 'collection',
      async list(query, { authz }) {
        await authz.require({
          resource: { type: 'department', id: '*' },
          action: 'read',
        });
        return departments.listOptions(query);
      },
      async resolve(ids, { authz }) {
        await authz.require({
          resource: { type: 'department', id: '*' },
          action: 'read',
        });
        return departments.resolveOptions(ids);
      },
    },
  },
});
```

`list` receives `{ search?, page, pageSize }` and returns `{ items, total }`. `resolve` returns items for a batch of IDs. Each item has `{ id, title, description? }`. Both callbacks must enforce the directory's read permissions, including record restrictions where applicable. A fixed subject uses `selection: { type: 'fixed', id: '*' }` instead. Titles accept the same translation-key structure as resource titles.

Permission-set, sharing-rule, and restriction-rule options expose these descriptions. Their `subjects/:type` and `subjects/:type/resolve` endpoints check the corresponding settings resource's read permission before calling the registered selector. Queries are capped at 100 items, as are resolution batches. Write endpoints independently enforce permission to assign or edit the rule; reading candidates never grants permission to save authorization changes.

The common picker supports multiple types, server-side search and pagination, and grouped selected items. Unknown or unreadable subjects retain their original type and ID. The owning plugin must also add the current principal's department or position memberships to `request.subjects`; registering a selector alone does not establish membership.

## Custom filter editor

The shared client `FilterEditor` takes `fields`, a native DB `FilterNode` as `value`, and `onChange(FilterNode)`. Permission sets, default access, sharing rules, and restriction rules use it through `CustomFilterEditor`. Groups use `{ kind: 'group', logic: 'and' | 'or', items }`; conditions use `{ kind: 'condition', path, operator, value? }`. The UI does not serialize a separate `$and`/`$or` shorthand. The server attaches the collection and wraps the node in `FilterAst` when creating the repository policy.

The authorization boundary currently permits direct fields and scalar conditions, not relation traversal or JSON conditions. The visual editor offers a subset of those operators, retains unsupported existing nodes without rewriting them, and preserves scalar value types. Empty groups must be completed or removed before saving. Field metadata currently contains names only, so operators are not yet filtered by the database field type. Unrecognized legacy filter payloads remain untouched until the user explicitly chooses to replace them.

## Subject permission inspector

The inspector selects an authorization subject through its registered fixed or collection selector and displays registered resources by type and group, with 20 resources per page. It batches up to 100 resource/action checks per request to `POST /authz/inspect/batch`, limits concurrent evaluations to four, and shares the scoped grant provider and built-in rule-list caches across the batch. Each new request reads fresh configuration; it does not scan business records or calculate accessible-record counts.

All inspection endpoints require `settings/authorization.inspector/inspect`; permission-set read access is not required. For user subjects, the inspector includes the authenticated audience used by the application. Other subject types are inspected directly without adding that audience: a department or position result describes grants assigned to that subject, not the effective permissions of every member. Integrations that add user identity memberships must extend identity resolution before those memberships can be represented. Built-in owner/creator record scopes require a user principal; inspections of other subjects display a context-required result instead of comparing a department identifier against a user field.

Results distinguish full, limited, denied, and failed checks. Database details display the effective record filter, writable and returned fields, and structured grant/constraint sources. Source identifiers are shown as reported by the authorization provider; they are not presented as translated permission-set titles. The first version returns each page’s explanations with the batch, so opening a result drawer does not re-evaluate or mix results from separate requests.

The resource-type sidebar uses `POST /authz/inspect/configured` to summarize the subject’s effective permission-set configurations, including policy-bearing grants and unrestricted access. The shield denotes configured permissions, not a count of accessible resources, and is independent of resource pagination or search.

Shared administration components and data types are exported from `./client/management`; server option queries and request helpers are exported from `./server/management`. Feature plugins depend on these exports; this plugin does not import them at runtime.

The decision drawer leads with whether the selected operation is allowed, then shows deduplicated source titles and the named record scopes present in the returned decision. “Me” refers to the inspected subject. Effective conditions and fields are available on demand; underlying page/table checks, reason codes and the raw decision appear in one collapsed technical section. Redundant Boolean conditions are simplified only for display, without changing executable policies.

Authorization sources may provide a localized `title` alongside their plugin and record identifiers. The inspector renders those titles and returned reason messages without a plugin-specific lookup or an assumed rule pipeline. Custom reason codes retain their supplied message; codes recognized by the inspector use its localized wording.
