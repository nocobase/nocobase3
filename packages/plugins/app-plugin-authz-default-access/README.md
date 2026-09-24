# @nocobase/app-plugin-authz-default-access

Adds default access: records every identity that already holds an action reaches, in addition to what its own grants select. A default-access rule never grants an action, a page or a field; it widens the records of an action some grant already allows, and restriction rules still narrow the result. Choose it as an intentional baseline, not as a fallback for identities without a selection of their own.

## Terminology

| Term                | Meaning                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Default-access rule | `DefaultAccessRule { key, resource, actions }`, stored by this plugin.                                                    |
| Rule action         | `RuleAction { action, scopeKey?, selection }`: one action of the rule and the records it adds.                            |
| Record selection    | `all`, `records` with ids, or `recordAccess` with a key and params.                                                       |
| Data scope          | A named slot on a business action; `scopeKey` names it when the rule targets a business resource.                         |
| Settings item       | `settings:authorization.default-access`, whose `read`, `create`, `update` and `delete` actions gate this plugin's routes. |

## Layers

```text
 storage                         judgement                                        use
 ─────────────────────────       ────────────────────────────────────────         ────────────────────────────
 default-access rules ─────────▶ `expand` constraint for every identity ─┐        context.authorize(...)
                                  Permission Set grants ─────────────────┴▶ type  authz.database.policyFor(...)
 display: the "Default access" settings page; its settings item sits in the authorization subsection
```

## Entry points

| Import                                                    | Contents                                       |
| --------------------------------------------------------- | ---------------------------------------------- |
| `@nocobase/app-plugin-authz-default-access/server`        | Server plugin and the `defaultAccess` factory. |
| `@nocobase/app-plugin-authz-default-access/client`        | Client plugin.                                 |
| `@nocobase/app-plugin-authz-default-access/client/plugin` | The client plugin factory alone.               |
| `@nocobase/app-plugin-authz-default-access/client/routes` | The settings route contribution.               |
| `@nocobase/app-plugin-authz-default-access/package.json`  | The package manifest.                          |

## Install

Register the default exports of `./client` and `./server` beside the main authorization plugin and run the application's migrations. Then add the factory to the application's authorization configuration:

```ts
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';

export default { plugins: [defaultAccess()] };
```

`defaultAccess({ store? })` wraps `defaultAccessPlugin` from `@nocobase/authorization/default-access` with the bundled database store; a replacement store implements `DefaultAccessStore<DatabaseConnection>`. During setup it registers the settings item `authorization.default-access` in the `authorization` subsection with actions `read`, `create`, `update` and `delete`, and registers its HTTP handler with `authz.routes.add('/default-access', handler)`. Without the factory in the configuration the plugin adds no API and no route.

## Service API

```ts
import { selection } from '@nocobase/authorization/core';
import {
  defineDefaultAccessRule,
  type DefaultAccessAuthorizationApi,
} from '@nocobase/authorization/default-access';
import type { DatabaseConnection } from '@nocobase/db';

if (!('defaultAccess' in authz))
  throw new Error('Default access is not configured');
const rules = (
  authz as typeof authz & DefaultAccessAuthorizationApi<DatabaseConnection>
).defaultAccess;

await rules.create(
  defineDefaultAccessRule('quotes-baseline', quotes.reference())
    .scope('view', 'quotes', selection.recordAccess('sales.public'))
    .build(),
);
await rules.create({
  key: 'orders-baseline',
  resource: { type: 'database.collection', id: 'orders' },
  actions: [
    { action: 'read', selection: selection.recordAccess('recordsIOwn') },
  ],
});
```

| `authz.defaultAccess` method        | Contract                                                        |
| ----------------------------------- | --------------------------------------------------------------- |
| `create(rule)`                      | Stores a new rule after validating it.                          |
| `update(key, rule)`                 | Replaces a rule with a complete definition; the key may change. |
| `delete(key)`, `get(key)`, `list()` | Remove and read rules.                                          |
| `withTransaction(transaction)`      | An API bound to a caller-owned transaction.                     |

A rule on a business resource names the data scope in `scopeKey` and applies to that business action's branch only. A rule on a `database.collection` omits `scopeKey` and applies across every branch that reaches the collection. The service is a trusted provisioning API: a custom HTTP caller must check the settings item itself and validate the rule against the registered model with `validateDataScopeRule`, as this plugin's handler does.

## Check access

Rules take effect through the ordinary checks; nothing calls them directly.

```ts
const decision = await c.get('authz').authorize({
  resource: { type: 'business', id: 'sales.quotes' },
  action: 'view',
});
const policy = decision.conditions?.database?.quotes; // includes the baseline records
```

An unrestricted identity skips every rule.

## HTTP API

Paths are under `/api/authz` and require a signed-in user. Every route checks `{ resource: { type: 'settings', id: 'authorization.default-access' }, action }`. Responses wrap results in `{ data }`; creation answers `201` and deletion `204`. Errors answer `403 { code: 'FORBIDDEN' }`, `400 { code: 'INVALID_AUTHORIZATION_INPUT' }` and `404` for an unknown key.

| Method and path                               | Required action | Request                             | Response `data`                     |
| --------------------------------------------- | --------------- | ----------------------------------- | ----------------------------------- |
| `GET /default-access`                         | `read`          |                                     | `DefaultAccessRule[]`               |
| `POST /default-access`                        | `create`        | a complete `DefaultAccessRule`      | the rule                            |
| `PUT /default-access/:key`                    | `update`        | a complete `DefaultAccessRule`      | the rule                            |
| `DELETE /default-access/:key`                 | `delete`        |                                     | none                                |
| `GET /default-access/options`                 | `read`          |                                     | `AuthorizationOptions`              |
| `GET /default-access/subjects/:type`          | `read`          | query `search?`, `page`, `pageSize` | `{ items: SubjectOption[], total }` |
| `POST /default-access/subjects/:type/resolve` | `read`          | `{ ids: string[] }`                 | `SubjectOption[]`                   |
| `GET /default-access/records/:collection`     | `read`          |                                     | `[{ id, label, description? }]`     |

The settings page is `/settings/authorization/default-access`; its route declares `authz: { resource: { type: 'settings', id: 'authorization.default-access' }, action: 'read' }`.

## `@nocobase/app-plugin-authz-default-access/server`

### Exports

| Export                 | Kind     | Signature                                                                                                                                   | Purpose                        |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `default`              | plugin   | `defineServerPlugin(...)`                                                                                                                   | The server plugin to register. |
| `defaultAccess`        | function | `defaultAccess(options?: DefaultAccessOptions): AuthorizationPlugin<DefaultAccessAuthorizationApi<DatabaseConnection>, DatabaseConnection>` | The configuration factory.     |
| `DefaultAccessOptions` | type     | `{ store?: DefaultAccessStore<DatabaseConnection> }`                                                                                        | Replaces the bundled store.    |

## `@nocobase/app-plugin-authz-default-access/client`

### Exports

| Export    | Kind   | Signature                 | Purpose                        |
| --------- | ------ | ------------------------- | ------------------------------ |
| `default` | plugin | `defineClientPlugin(...)` | The client plugin to register. |

## `@nocobase/app-plugin-authz-default-access/client/plugin`

### Exports

| Export    | Kind   | Signature                | Purpose                    |
| --------- | ------ | ------------------------ | -------------------------- |
| `default` | plugin | `AppClientPluginFactory` | The client plugin factory. |

## `@nocobase/app-plugin-authz-default-access/client/routes`

### Exports

| Export    | Kind  | Signature                    | Purpose                                        |
| --------- | ----- | ---------------------------- | ---------------------------------------------- |
| `default` | const | `AppClientRouteContribution` | The settings route of the default-access page. |

## `@nocobase/app-plugin-authz-default-access/package.json`

The package manifest.
