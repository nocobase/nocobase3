# Client routes, action visibility and record eligibility

Use the sales example's three independent pages: Projects, Quotes and Orders. Delivery specialists enter Orders without gaining entry to Projects or Quotes. The overview is an authenticated demonstration guide; its `authz: 'skip'` is not a pattern for business pages.

## Register the runtime first

Register the main authorization client factory and server plugin alongside authentication. The authorization React provider depends on the authentication provider; retain their normal composition order. A package dependency alone does not activate either side. Optional rule screens require their owning installed Skills; follow [capability discovery](optional-capabilities.md) before using them. See [runtime setup](runtime-api.md).

Application-owned pages belong in the App's `client/routes.ts` and page modules. A reusable plugin contributes routes through its client declaration. Use stable page IDs that match server registration and the permission-set page grant:

```ts
import { defineAppRoutes } from '@nocobase/app-client/plugins';

export default defineAppRoutes([
  {
    name: 'sales-quotes',
    path: '/sales/quotes',
    auth: 'required',
    navigation: { title: 'sales.quotes' },
    authz: { resource: { type: 'page', id: 'sales.quotes' }, action: 'access' },
    componentLoader: () => import('./pages/quotes-page.js'),
  },
]);
```

The page module default-exports a React component. Translate the navigation key in its owning namespace. Paths omit the deployment base path. The management UI discovers grantable pages from the client's normalized route declarations. Registering the same stable page ID server-side with `authz.pages.add({ name: 'sales.quotes', title, actions: ['access'] })` also supplies metadata to server consumers; server registration is not required for client page discovery. The page and business permission categories remain visible when empty and explain how to ask AI to develop their resources; those placeholders grant no access. Page navigation groups come from client navigation, whereas business and administration groups come from `resourceGroups`. A page grant opens an entry; business data needs its own action grants.

## Check feature visibility

```tsx
import { useCan } from '@nocobase/app-plugin-authorization/client';

const permission = useCan({
  resource: { type: 'resource', id: 'sales.quotes' },
  action: 'submit',
});
// permission: { can, isPending, error, retry }
```

Call Hooks inside a component or custom Hook. While pending or failed, `can` is false; show a loading state or retryable permission error without exposing stale actions. `{ enabled: false }` as the second argument skips a check. Never call Hooks conditionally. A successful check means the feature is granted, not that a particular quote can be submitted.

React code can obtain the shared client with `useAuthorizationClient()`. Outside React, resolve `authorizationClientToken` from the App container and call `client.can({ resource, action })`. `useAuthorizationRevision()` supports custom state that must reload on invalidation. Avoid a module-global client or permission response surviving an identity change. The standard provider and `useCan` already handle session invalidation; do not duplicate snapshot caching.

## Obtain row eligibility from the server

The sales list endpoints return per-record allowed operations; the client combines this with feature visibility. On the server, compute submission eligibility from the same declared action policies: required quote read/write fields, quote scope, actual parent-project scope, positive amount and draft status. Check all required scopes; merely seeing the row through View does not prove Submit.

Do not implement a parallel role-to-button matrix or infer permissions from role names. Never download all rows and filter them locally. Eligibility is a UI hint and can become stale; the mutation endpoint must authorize and validate again.

```tsx
import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useState } from 'react';

export function SubmitQuote({
  quote,
  reload,
}: {
  quote: { id: string; canSubmit: boolean };
  reload: () => Promise<void>;
}) {
  const api = useApiClient();
  const access = useCan({
    resource: { type: 'resource', id: 'sales.quotes' },
    action: 'submit',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (access.isPending) return <span>Checking access…</span>;
  if (access.error)
    return (
      <button onClick={() => void access.retry()}>
        Retry permission check
      </button>
    );
  if (!access.can) return null;
  return (
    <>
      <button
        disabled={!quote.canSubmit || pending}
        onClick={async () => {
          setPending(true);
          setError(undefined);
          try {
            await api.request({
              path: `sales/quotes/${encodeURIComponent(quote.id)}/submit`,
              method: 'POST',
            });
            await reload();
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : 'Submission failed',
            );
          } finally {
            setPending(false);
          }
        }}
      >
        Submit
      </button>
      {error && <p role='alert'>{error}</p>}
    </>
  );
}
```

This component illustrates a customer-owned endpoint and a `canSubmit` response field that its server must implement. The installed example's paths start with `authorization-example/sales/`; use the actual owning endpoint rather than mixing the two prefixes. Replace the minimal button/status markup with App UI primitives and translation keys in production. `api.request` uses `path`, `method`, `query` and `json`; it returns the parsed response body. Do not repeat `/api` or the deployment mount, construct a second API client, or import server registration modules into the client bundle to obtain a resource name. Share small browser-safe identifiers when needed.

After a write, reload affected records and relationship controls, preserve the current selected order where possible, and recompute eligibility. For stale state, forbidden and validation responses, display the server outcome and refresh relevant data; never force the optimistic state to remain submitted after rejection. No client flag can replace server enforcement.

## Delivery relation controls

The order relation endpoint returns existing relations, permitted relation operations and target options derived from the `manageRelations` policy. Offer only allowed create/update/upsert/connect/disconnect/set/delete controls. Existing relation reads use the View policy; mutation eligibility also requires an eligible order and business state. Team options come from the relation target scope, for example active teams. They do not use the authorization-management subject picker.

Example request bodies for the current plugin's `POST authorization-example/sales/orders/:id/relations` are:

```json
{ "deliveryTeam": { "connect": { "id": "delivery" } } }
```

```json
{
  "checks": {
    "update": [{ "filter": { "id": "check-1" }, "values": { "done": true } }]
  }
}
```

```json
{
  "collaborators": {
    "connect": [
      { "where": { "id": "proposal" }, "through": { "note": "Review" } }
    ]
  }
}
```

These are demonstration IDs; fetch actual options in a customer App. Never expose protected foreign keys or internal join fields as a shortcut around a denied relation operation. A rejected nested mutation must leave the whole write rolled back.

## Settings screens

Use `defineSettingsRoutes` with a stable `settings` resource ID/action, a lazy page module and navigation keys. Do not put `/settings` in its declared path. Register corresponding administration actions on the server and check read/mutation capabilities separately in endpoints. Existing permission-set and rule screens already provide assignment and scope editing; reuse them rather than building another editor.

For a new configuration screen, use the shared API client, one saved baseline and one draft per saved section, route-backed child tabs with `Outlet`, unsaved-navigation protection and explicit save/error states. Read-only access should render data without writable controls. Options/search endpoints need the calling settings permission too. Only add an independent directory permission if the business directory has that additional boundary; the example's team authorization picker relies on existing management permissions.

Verify menu and direct URL behavior, no-grant/page-only/action-only cases, pending/failed checks, session switching, out-of-scope rows, stale transitions, relation target constraints and post-save refresh. Perform actual API requests as ordinary users in addition to UI checks.

Settings routes and their standalone detail routes use the relevant `settings` capability, never `page/access`. Their grants belong to composed administration resources. Do not add the Settings route tree to ordinary page discovery, and do not infer authorization ownership solely from whether a route was declared with `defineAppRoutes`.
