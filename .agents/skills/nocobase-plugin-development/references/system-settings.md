# Design and develop system settings

Use this reference for persistent configuration and administration of a plugin: permission management, service configuration, policy editors or account administration. Settings are normal client route contributions with explicit server capabilities. The authorization plugin is the reference for a routed settings workspace; the default-access plugin is the smaller example for one configuration page.

## Decide ownership and operations

Define the configuration entity, stable identifier, persistence service and who can read or change it. Separate `read` from mutation rights. Use `configure` for saving/clearing a singleton baseline; use create/update/delete for a rule collection and `assign` for membership changes. A settings reader must not gain write access by loading the page.

Put validation, persistence and transactions in the owning service. Routes authenticate, authorize, validate input and map errors. Keep declarations static and service tokens owned by their exporting package. Database migrations create the fixed schema; seeds initialize missing defaults without overwriting administrator edits. Never store user-editable settings by rewriting source files or environment variables at runtime.

## Register administration capabilities

Resolve `authorizationToken` in provider boot. Register an administration group and a composed resource. These declarations make actions configurable; an assigned permission set activates them.

```ts
authz.resourceGroups.add({
  name: 'delivery-admin',
  title: 'Delivery administration',
  category: 'administration',
});
authz.resources.add({
  name: 'delivery.configuration',
  title: 'Delivery configuration',
  group: 'delivery-admin',
  actions: ['read', 'configure'].map((name) => ({
    name,
    title: name,
    grants: [authz.settings.grant('delivery.configuration', [name])],
  })),
});
```

Use translated descriptors for real titles. Keep the same stable settings ID in declarations, client checks and server checks. Do not create a separate settings item registry or compose page grants into the administration action. For business data permissions, read `packages/plugins/app-plugin-authorization/skills/nocobase-app-plugin-authorization/SKILL.md` instead of treating all data editing as system administration.

## Contribute the page

```ts
import { defineSettingsRoutes } from '@nocobase/app-client/plugins';
export default defineSettingsRoutes([
  {
    name: 'delivery-configuration',
    path: '/delivery-configuration',
    navigation: { title: 'navigation.deliveryConfiguration' },
    breadcrumb: { title: 'navigation.deliveryConfiguration' },
    authz: {
      resource: { type: 'settings', id: 'delivery.configuration' },
      action: 'read',
    },
    componentLoader: () => import('./pages/delivery-configuration-page.js'),
  },
]);
```

Register this contribution through the plugin's client `routes`. Do not include `/settings` or a deployment prefix in the declared path. The page module default-exports a React component. Settings require authentication; the explicit `authz` check controls whether the page is available. Every child route needs the appropriate domain check; dynamic detail URLs must not become a bypass.

A standalone leaf fits a small configuration surface. A collection workspace can use a sidebar list and child routes for editor, assignments and basic information, as `app-plugin-authorization/client/routes.ts` does. The parent renders an `Outlet`; child Tabs navigate routes, with the URL as the selection state. Do not duplicate route state in local tab state. Independent plugins can join a declared group through entry-level `parent`; the rule plugins use `parent: 'authorization'` while keeping their own translation namespace.

## Protect each endpoint

In the real `defineApiRoutes` factory, resolve authentication, authorization and the settings service from the container. Install both middlewares before handlers, then check the exact action on each endpoint:

```ts
router.use('*', authentication.required(), authz.middleware());
router.get('/delivery-configuration', async (c) => {
  await c.get('authz').require({
    resource: { type: 'settings', id: 'delivery.configuration' },
    action: 'read',
  });
  return c.json({ data: await service.read() });
});
router.put('/delivery-configuration', async (c) => {
  await c.get('authz').require({
    resource: { type: 'settings', id: 'delivery.configuration' },
    action: 'configure',
  });
  const input = parseConfiguration(await c.req.json());
  return c.json({ data: await service.save(input) });
});
```

Here `service` and `parseConfiguration` belong to the feature. Add request limits, validate identifiers and supported fields, and map `AuthorizationDeniedError` to 403 through the route's error handling. Never return secrets from the read endpoint; define explicit public read shapes for settings containing credentials. A client route's read check does not authorize PUT/DELETE. Protect options, record search, uploads and subject resolution as well as main CRUD endpoints.

If a selector queries another module's directory, it needs that directory's authorization and record constraints. Selection does not authorize assignment. For authorization-specific extensions, use exported `./server/management` and `./client/management` helpers instead of copying handlers or importing private source.

## Editor state and feedback

Read through the application's API client (`useApiClient`); resolve permission clients inside components/hooks. Keep one saved baseline and one editable draft per independently saved section. Derive dirty state from them; preserve the draft on save failure, replace the baseline with the server result on success, and distinguish loading, empty, failed and unavailable data.

Gate mutations with `useCan` for their actual action and server checks. Render read-only data for readers. Protect unsaved work on route navigation and browser unload; avoid duplicate confirmation flows or multiple overlapping dirty-state implementations. Preserve unknown fields and translation descriptors when editing unrelated properties. Hide or disable protected operations based on server metadata, not hard-coded special record names.

Keep lists/selection and dependent views consistent after create/update/delete. Paginate and search large directories on the server. Prefer shared filter/subject controls when contracts match; avoid speculative component abstractions for a single form. Use the repository's shadcn components and theme tokens, translated text and accessible labels. See [client routing](client-routing.md) and [components](client-components.md).

## Verify the complete surface

Test the production route contribution's `createRouter` output: anonymous denial, read-only access, mutation denial, granted writes, invalid payloads and protected records. Test option/search endpoints and direct child URLs too. For transactional multi-entity changes, verify rollback and concurrent invariants. For the UI, verify deep links, back/forward, dirty navigation, failed saves, read-only presentation, session changes and updated data after successful save.

Run the owning package and relevant consumer checks. Keep package README API examples and its published Skill aligned with the final configuration workflow. Refer to `app-plugin-authorization/client/pages/permission-sets/`, its management handlers, and the optional rule plugin pages for maintained examples; copy their patterns only where the new settings domain has the same needs.
