# @nocobase/app-plugin-authz-sharing-rules

Adds sharing rules: selected records, or a record access selection, for the subjects a rule lists, in addition to what their grants select. Sharing never grants an action, a page, a field or related records, and a sharing rule cannot select all records. Grants, default access and sharing combine first; restriction rules then narrow the result.

## Terminology

| Term             | Meaning                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sharing rule     | `SharingRule { key, resource, actions, title?, subjects, reason? }`, stored by this plugin.                              |
| Rule action      | `RuleAction { action, scopeKey?, selection }`: one action of the rule and the records it shares.                         |
| Record selection | `records` with ids, or `recordAccess` with a key and params. `all` is rejected.                                          |
| Data scope       | A named slot on a business action; `scopeKey` names it when the rule targets a business resource.                        |
| Subject          | Who the rule applies to, `{ type, id }`: a user, a team, or any subject type the application declares.                   |
| Settings item    | `settings:authorization.sharing-rules`, whose `read`, `create`, `update` and `delete` actions gate this plugin's routes. |

## Layers

```text
 storage                     judgement                                                use
 ──────────────────────      ─────────────────────────────────────────────────        ────────────────────────────
 sharing rules ────────────▶ `expand` constraint for the rule's subjects ─┐           context.authorize(...)
                              Permission Set grants ──────────────────────┴▶ type     authz.database.policyFor(...)
 display: the "Sharing rules" settings page; its settings item sits in the authorization subsection
```

## Entry points

| Import                                                   | Contents                                      |
| -------------------------------------------------------- | --------------------------------------------- |
| `@nocobase/app-plugin-authz-sharing-rules/server`        | Server plugin and the `sharingRules` factory. |
| `@nocobase/app-plugin-authz-sharing-rules/client`        | Client plugin.                                |
| `@nocobase/app-plugin-authz-sharing-rules/client/plugin` | The client plugin factory alone.              |
| `@nocobase/app-plugin-authz-sharing-rules/client/routes` | The settings route contribution.              |
| `@nocobase/app-plugin-authz-sharing-rules/package.json`  | The package manifest.                         |

## Install

Register the default exports of `./client` and `./server` beside the main authorization plugin and run the application's migrations. Then add the factory to the application's authorization configuration:

```ts
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';

export default { plugins: [sharingRules()] };
```

`sharingRules({ store? })` wraps `sharingRulesPlugin` from `@nocobase/authorization/sharing-rules` with the bundled database store; a replacement store implements `SharingRuleStore<DatabaseConnection>`. During setup it registers the settings item `authorization.sharing-rules` in the `authorization` subsection with actions `read`, `create`, `update` and `delete`, and registers its HTTP handler with `authz.routes.add('/sharing-rules', handler)`. Without the factory in the configuration the plugin adds no API and no route.

## Service API

```ts
import { selection } from '@nocobase/authorization/core';
import {
  defineSharingRule,
  type SharingRulesAuthorizationApi,
} from '@nocobase/authorization/sharing-rules';
import type { DatabaseConnection } from '@nocobase/db';

if (!('sharingRules' in authz))
  throw new Error('Sharing rules is not configured');
const rules = (
  authz as typeof authz & SharingRulesAuthorizationApi<DatabaseConnection>
).sharingRules;

await rules.create(
  defineSharingRule('proposal-handover', quotes.reference())
    .title('Proposal handover')
    .subjects({ type: 'sales.team', id: 'proposal' })
    .scope('submit', 'quotes', selection.records(['quote-7']))
    .scope(
      'submit',
      'projects',
      selection.recordAccess('sales.region', { region: 'north' }),
    )
    .reason('Delegate this proposal to the team')
    .build(),
);
await rules.create({
  key: 'orders-for-alice',
  resource: { type: 'database.collection', id: 'orders' },
  subjects: [{ type: 'user', id: 'alice' }],
  actions: [{ action: 'read', selection: selection.records(['order-1']) }],
});
```

| `authz.sharingRules` method         | Contract                                                                |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `create(rule)`                      | Stores a new rule after validating it; a selection of `all` is refused. |
| `update(key, rule)`                 | Replaces a rule with a complete definition; the key may change.         |
| `delete(key)`, `get(key)`, `list()` | Remove and read rules.                                                  |
| `withTransaction(transaction)`      | An API bound to a caller-owned transaction.                             |

A rule on a business resource names the data scope in `scopeKey` and applies to that business action's branch only. A rule on a `database.collection` omits `scopeKey` and applies across every branch that reaches the collection. Record ids are stored per action and data scope. The service is a trusted provisioning API: a custom HTTP caller must check the settings item itself and validate the rule with `validateDataScopeRule`, as this plugin's handler does.

## Check access

Rules take effect through the ordinary checks; nothing calls them directly.

```ts
const decision = await c.get('authz').authorize({
  resource: { type: 'business', id: 'sales.quotes' },
  action: 'submit',
});
const policy = decision.conditions?.database?.quotes; // includes quote-7 for the proposal team
```

An unrestricted identity skips every rule.

## HTTP API

Paths are under `/api/authz` and require a signed-in user. Every route checks `{ resource: { type: 'settings', id: 'authorization.sharing-rules' }, action }`. Responses wrap results in `{ data }`; creation answers `201` and deletion `204`. Errors answer `403 { code: 'FORBIDDEN' }`, `400 { code: 'INVALID_AUTHORIZATION_INPUT' }` and `404` for an unknown key.

| Method and path                              | Required action | Request                             | Response `data`                     |
| -------------------------------------------- | --------------- | ----------------------------------- | ----------------------------------- |
| `GET /sharing-rules`                         | `read`          |                                     | `SharingRule[]`                     |
| `POST /sharing-rules`                        | `create`        | a complete `SharingRule`            | the rule                            |
| `PUT /sharing-rules/:key`                    | `update`        | a complete `SharingRule`            | the rule                            |
| `DELETE /sharing-rules/:key`                 | `delete`        |                                     | none                                |
| `GET /sharing-rules/options`                 | `read`          |                                     | `AuthorizationOptions`              |
| `GET /sharing-rules/subjects/:type`          | `read`          | query `search?`, `page`, `pageSize` | `{ items: SubjectOption[], total }` |
| `POST /sharing-rules/subjects/:type/resolve` | `read`          | `{ ids: string[] }`                 | `SubjectOption[]`                   |
| `GET /sharing-rules/records/:collection`     | `read`          |                                     | `[{ id, label, description? }]`     |

The settings page is `/settings/authorization/sharing-rules`; its route declares `authz: { resource: { type: 'settings', id: 'authorization.sharing-rules' }, action: 'read' }`.

## `@nocobase/app-plugin-authz-sharing-rules/server`

### Exports

| Export                | Kind     | Signature                                                                                                                                | Purpose                        |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `default`             | plugin   | `defineServerPlugin(...)`                                                                                                                | The server plugin to register. |
| `sharingRules`        | function | `sharingRules(options?: SharingRulesOptions): AuthorizationPlugin<SharingRulesAuthorizationApi<DatabaseConnection>, DatabaseConnection>` | The configuration factory.     |
| `SharingRulesOptions` | type     | `{ store?: SharingRuleStore<DatabaseConnection> }`                                                                                       | Replaces the bundled store.    |

## `@nocobase/app-plugin-authz-sharing-rules/client`

### Exports

| Export    | Kind   | Signature                 | Purpose                        |
| --------- | ------ | ------------------------- | ------------------------------ |
| `default` | plugin | `defineClientPlugin(...)` | The client plugin to register. |

## `@nocobase/app-plugin-authz-sharing-rules/client/plugin`

### Exports

| Export    | Kind   | Signature                | Purpose                    |
| --------- | ------ | ------------------------ | -------------------------- |
| `default` | plugin | `AppClientPluginFactory` | The client plugin factory. |

## `@nocobase/app-plugin-authz-sharing-rules/client/routes`

### Exports

| Export    | Kind  | Signature                    | Purpose                                       |
| --------- | ----- | ---------------------------- | --------------------------------------------- |
| `default` | const | `AppClientRouteContribution` | The settings route of the sharing-rules page. |

## `@nocobase/app-plugin-authz-sharing-rules/package.json`

The package manifest.
