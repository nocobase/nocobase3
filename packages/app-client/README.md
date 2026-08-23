# @nocobase/app-client

Shared browser runtime for NocoBase applications built with React, Refine,
React Router, and shadcn.

For now, this package only owns the stable application root:

- React Router and Refine setup;
- application-level provider composition;
- client plugin bootstrap, route, and provider contribution contracts;
- the smallest shared shadcn UI primitives.

Application routes, pages, authentication wiring, and product-specific layout
stay in the application package, such as `app-template-default/client`.
Plugin discovery and loading, Registry discovery, ACL UI, and the complete
application shell stay in the application package until those boundaries are
shared by more than one application.

Client plugins declare authenticated routes in a dedicated entry. Route pages
use a second dynamic import so their code is only loaded when the URL is
rendered:

```ts
import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'index',
    path: '/example',
    componentLoader: () => import('./pages/example'),
  },
]);

export default routes;
```

Global providers are synchronous components declared separately:

```ts
import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { ExampleProvider } from './components/example-provider';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: 'example',
      component: ExampleProvider,
    },
  ],
);

export default providers;
```

Provider definitions may use full provider IDs in `before` and `after`.
Provider arrays are ordered from outer to inner with stable topological
sorting. Missing references, duplicate IDs, and cycles fail before the first
React render.

The plugin manifest declares each optional entry explicitly:

```json
{
  "nocobase": {
    "plugin": {
      "client": {
        "bootstrap": "./client/bootstrap",
        "routes": "./client/routes",
        "providers": "./client/providers"
      }
    }
  }
}
```

The application owns route placement, authentication, loading, error UI, and
the final provider tree. `bootstrap` remains the imperative initialization
entry; routes and providers remain inspectable declarations.

The bootstrap context exposes a plugin-scoped Refine registry. Its setters are
derived from `RefineProps`, so every Refine prop has a required `setXxx()`
method:

```ts
import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

const bootstrap: AppClientPluginBootstrap = ({ refine }) => {
  refine.setChildren(customAppContent);
  refine.setAuthProvider(authProvider);
  refine.setDataProvider(dataProvider);
  refine.setRouterProvider(routerProvider);
  refine.setLiveProvider(liveProvider);
  refine.setNotificationProvider(notificationProvider);
  refine.setAccessControlProvider(accessControlProvider);
  refine.setAuditLogProvider(auditLogProvider);
  refine.setI18nProvider(i18nProvider);
  refine.setOnLiveEvent(onLiveEvent);
  refine.setOptions({ mutationMode: 'optimistic' });
  refine.setResources([{ name: 'records' }]);
};

export default bootstrap;
```

Each `setXxx()` property may be claimed by only one plugin. Duplicate claims
fail with both package names. Multiple plugins can instead contribute resources
with `addResources()` and live event listeners with `addLiveEventHandler()`.
The resolved configuration is frozen as `runtime.refine` before rendering.
Application routes are the default Refine children; calling `setChildren()`
explicitly replaces them.
