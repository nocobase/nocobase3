# @nocobase/app-plugin-authz-restriction-rules

Adds restriction rules: for the subjects a rule lists, the records an action reaches are intersected with the rule's selection. The selection describes the records still allowed, not the records to hide. Several matching restrictions all apply; none can grant an action or widen a range.

## Terminology

| Term             | Meaning                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Restriction rule | `RestrictionRule { key, resource, actions, title?, subjects, reason? }`, stored by this plugin.                              |
| Rule action      | `RuleAction { action, scopeKey?, selection }`: one action of the rule and the records still allowed.                         |
| Record selection | `all`, `records` with ids, or `recordAccess` with a key and params. Every kind is accepted.                                  |
| Data scope       | A named slot on a business action; `scopeKey` names it when the rule targets a business resource.                            |
| Subject          | Who the rule applies to, `{ type, id }`.                                                                                     |
| Settings item    | `settings:authorization.restriction-rules`, whose `read`, `create`, `update` and `delete` actions gate this plugin's routes. |

## Layers

```text
 storage                       judgement                                                    use
 ────────────────────────      ────────────────────────────────────────────────────         ────────────────────────────
 restriction rules ──────────▶ `restrict` constraint for the rule's subjects ─┐             context.authorize(...)
                                grants, default access, sharing ──────────────┴▶ type       authz.database.policyFor(...)
 display: the "Restriction rules" settings page; its settings item sits in the authorization subsection
```

## Entry points

| Import                                                       | Contents                                          |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `@nocobase/app-plugin-authz-restriction-rules/server`        | Server plugin and the `restrictionRules` factory. |
| `@nocobase/app-plugin-authz-restriction-rules/client`        | Client plugin.                                    |
| `@nocobase/app-plugin-authz-restriction-rules/client/plugin` | The client plugin factory alone.                  |
| `@nocobase/app-plugin-authz-restriction-rules/client/routes` | The settings route contribution.                  |
| `@nocobase/app-plugin-authz-restriction-rules/package.json`  | The package manifest.                             |

## Install

Register the default exports of `./client` and `./server` beside the main authorization plugin and run the application's migrations. Then add the factory to the application's authorization configuration:

```ts
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';

export default { plugins: [restrictionRules()] };
```

`restrictionRules({ store? })` wraps `restrictionRulesPlugin` from `@nocobase/authorization/restriction-rules` with the bundled database store; a replacement store implements `RestrictionRuleStore<DatabaseConnection>`. During setup it registers the settings item `authorization.restriction-rules` in the `authorization` subsection with actions `read`, `create`, `update` and `delete`, and registers its HTTP handler with `authz.routes.add('/restriction-rules', handler)`. Without the factory in the configuration the plugin adds no API and no route.

## Service API

```ts
import { selection } from '@nocobase/authorization/core';
import {
  defineRestrictionRule,
  type RestrictionRulesAuthorizationApi,
} from '@nocobase/authorization/restriction-rules';
import type { DatabaseConnection } from '@nocobase/db';

if (!('restrictionRules' in authz))
  throw new Error('Restriction rules is not configured');
const rules = (
  authz as typeof authz & RestrictionRulesAuthorizationApi<DatabaseConnection>
).restrictionRules;

await rules.create(
  defineRestrictionRule('public-proposals', quotes.reference())
    .title('Exclude confidential proposals')
    .subjects({ type: 'sales.team', id: 'proposal' })
    .scope('submit', 'quotes', selection.recordAccess('sales.public'))
    .reason('Proposal collaboration excludes confidential work')
    .build(),
);
await rules.create({
  key: 'interns-orders',
  resource: { type: 'database.collection', id: 'orders' },
  subjects: [{ type: 'team', id: 'interns' }],
  actions: [
    { action: 'update', selection: selection.records(['order-1', 'order-2']) },
  ],
});
```

| `authz.restrictionRules` method     | Contract                                                        |
| ----------------------------------- | --------------------------------------------------------------- |
| `create(rule)`                      | Stores a new rule after validating it.                          |
| `update(key, rule)`                 | Replaces a rule with a complete definition; the key may change. |
| `delete(key)`, `get(key)`, `list()` | Remove and read rules.                                          |
| `withTransaction(transaction)`      | An API bound to a caller-owned transaction.                     |

A rule on a business resource names the data scope in `scopeKey` and narrows that business action's branch only. A rule on a `database.collection` omits `scopeKey` and narrows every branch that reaches the collection. The service is a trusted provisioning API: a custom HTTP caller must check the settings item itself and validate the rule with `validateDataScopeRule`, as this plugin's handler does.

## Check access

Rules take effect through the ordinary checks; nothing calls them directly.

```ts
const policy = await authz.database.policyFor('orders', c.get('authz')); // interns update order-1 and order-2 at most
```

An unrestricted identity skips every rule.

## HTTP API

Paths are under `/api/authz` and require a signed-in user. Every route checks `{ resource: { type: 'settings', id: 'authorization.restriction-rules' }, action }`. Responses wrap results in `{ data }`; creation answers `201` and deletion `204`. Errors answer `403 { code: 'FORBIDDEN' }`, `400 { code: 'INVALID_AUTHORIZATION_INPUT' }` and `404` for an unknown key.

| Method and path                                  | Required action | Request                             | Response `data`                     |
| ------------------------------------------------ | --------------- | ----------------------------------- | ----------------------------------- |
| `GET /restriction-rules`                         | `read`          |                                     | `RestrictionRule[]`                 |
| `POST /restriction-rules`                        | `create`        | a complete `RestrictionRule`        | the rule                            |
| `PUT /restriction-rules/:key`                    | `update`        | a complete `RestrictionRule`        | the rule                            |
| `DELETE /restriction-rules/:key`                 | `delete`        |                                     | none                                |
| `GET /restriction-rules/options`                 | `read`          |                                     | `AuthorizationOptions`              |
| `GET /restriction-rules/subjects/:type`          | `read`          | query `search?`, `page`, `pageSize` | `{ items: SubjectOption[], total }` |
| `POST /restriction-rules/subjects/:type/resolve` | `read`          | `{ ids: string[] }`                 | `SubjectOption[]`                   |
| `GET /restriction-rules/records/:collection`     | `read`          |                                     | `[{ id, label, description? }]`     |

The settings page is `/settings/authorization/restriction-rules`; its route declares `authz: { resource: { type: 'settings', id: 'authorization.restriction-rules' }, action: 'read' }`.

## `@nocobase/app-plugin-authz-restriction-rules/server`

### Exports

| Export                    | Kind     | Signature                                                                                                                                            | Purpose                        |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `default`                 | plugin   | `defineServerPlugin(...)`                                                                                                                            | The server plugin to register. |
| `restrictionRules`        | function | `restrictionRules(options?: RestrictionRulesOptions): AuthorizationPlugin<RestrictionRulesAuthorizationApi<DatabaseConnection>, DatabaseConnection>` | The configuration factory.     |
| `RestrictionRulesOptions` | type     | `{ store?: RestrictionRuleStore<DatabaseConnection> }`                                                                                               | Replaces the bundled store.    |

## `@nocobase/app-plugin-authz-restriction-rules/client`

### Exports

| Export    | Kind   | Signature                 | Purpose                        |
| --------- | ------ | ------------------------- | ------------------------------ |
| `default` | plugin | `defineClientPlugin(...)` | The client plugin to register. |

## `@nocobase/app-plugin-authz-restriction-rules/client/plugin`

### Exports

| Export    | Kind   | Signature                | Purpose                    |
| --------- | ------ | ------------------------ | -------------------------- |
| `default` | plugin | `AppClientPluginFactory` | The client plugin factory. |

## `@nocobase/app-plugin-authz-restriction-rules/client/routes`

### Exports

| Export    | Kind  | Signature                    | Purpose                                           |
| --------- | ----- | ---------------------------- | ------------------------------------------------- |
| `default` | const | `AppClientRouteContribution` | The settings route of the restriction-rules page. |

## `@nocobase/app-plugin-authz-restriction-rules/package.json`

The package manifest.
