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

import { ExampleProvider } from './providers/example-provider';

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
