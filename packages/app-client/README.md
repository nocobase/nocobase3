# @nocobase/app-client

Shared browser runtime for NocoBase applications built with React, Refine,
React Router, and shadcn.

For now, this package only owns the stable application root:

- React Router and Refine setup;
- application-level provider composition;
- client plugin registration, bootstrap, route, and provider contribution
  contracts;
- the smallest shared shadcn UI primitives.

Application routes, pages, authentication wiring, and product-specific layout
stay in the application package, such as `app-template-default/client`.
Plugin loading, Registry discovery, ACL UI, and the complete application shell
stay in the application package until those boundaries are shared by more than
one application.

Applications use the same contribution contracts as plugins without
pretending to be plugins. An application loader explicitly identifies the
application-owned bootstrap, routes, and providers:

```ts
import { defineClientApplication } from '@nocobase/app-client/plugins';

export default defineClientApplication({
  packageName: '@nocobase/app-template-default',
  bootstrap: () => import('./bootstrap.js'),
  routes: () => import('./routes.js'),
  providers: () => import('./providers.js'),
});
```

The application bootstrap runs first, followed by registered plugin bootstraps
in registration order. The application may own `/`; plugins may not.

## The plugin registration surface

A plugin exposes its client contributions through `client/plugin.ts`, which
default-exports the factory returned by `defineClientPlugin`. This file is the
plugin's outward-facing registration surface: it names the package, points at
the four optional entries, and declares the options an application may pass:

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface ExampleClientOptions {
  readonly undoLabel?: string;
}

const example: AppClientPluginFactory<ExampleClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-example',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    settings: () => import('./settings.js'),
    providers: () => import('./providers.js'),
  });

export default example;
```

Every entry is optional; declare only the ones the plugin actually has.

Re-export that factory as the default from `client/index.ts`, so an application
imports the plugin as `<package>/client`:

```ts
export { default } from './plugin.js';
```

Publish both subpaths in `exports` and `publishConfig.exports`. `./client` is
what applications import; `./client/plugin` stays available for anything that
wants the descriptor alone.

The application imports that factory statically, so anything reachable from
`client/index.ts` at value level can land in the application entry chunk.
Reference the four entries with `() => import()`, import plugin types with
`import type`, and declare `"sideEffects": false` so a bundler can drop the
barrel exports the application does not use. Declaring it is only correct when
the package really has no module-level side effects — a bare `import './x.css'`
is one, and would be dropped along with everything else.

Keep components, provider factories, and service classes inside `bootstrap`,
`routes`, `settings`, and `providers` rather than importing them here. This is a
recommendation rather than an enforced rule; nothing validates it.

A plugin that wants to let an application replace one of its route components
maps options to overrides with `routeComponentOverrides`. It receives the
resolved options and returns an array, empty when the option is absent:

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';

import { EXAMPLE_ROUTE_IDS } from './route-contracts.js';

export interface ExampleClientOptions {
  readonly detailPage?: AppClientRouteComponentLoader;
}

const example: AppClientPluginFactory<ExampleClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-example',
    routes: () => import('./routes.js'),
    routeComponentOverrides: (options) =>
      options.detailPage
        ? [
            {
              routeId: EXAMPLE_ROUTE_IDS.detail,
              componentLoader: options.detailPage,
            },
          ]
        : [],
  });

export default example;
```

Declare such options as `AppClientRouteComponentLoader` rather than
`ComponentType`. A loader keeps the page out of the application entry chunk and
keeps `client/plugins.ts` loadable outside Vite, which is how
`pnpm client:inspect` reads it.

## Assembling an application's plugins

The application lists its plugins in `client/plugins.ts` and passes the result
to its runtime:

```ts
import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';
import authentication from '@nocobase/app-plugin-authentication/client';
import example from '@nocobase/app-plugin-example/client';

const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication(),
  example({ undoLabel: 'Revert' }),
]);

export default clientPlugins;
```

Array order is bootstrap order, and appearing in the array is what enables a
plugin; there is no `enabled` flag. A plugin that needs no configuration is a
pair of empty parentheses. Registering the same package twice throws with the
package name.

`defineClientPlugins` returns `plugins`, the loaders in registration order, and
`routeComponentOverrides`, the merged overrides every registration contributed.
The application passes the first to the runtime and merges the second with its
own overrides.

This mechanism covers client contributions only. Server plugin loading still
reads `nocobase.plugins` from the application `package.json`; there is no
server-side equivalent of `client/plugins.ts` yet.

## Routes, settings, and providers

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

Settings pages go in their own entry. They are lazily loaded the same way
routes are, but the application mounts them inside its settings centre and
builds the navigation from them, so a plugin declares only the page:

```ts
import {
  defineClientSettings,
  type AppClientSettingDefinition,
} from '@nocobase/app-client/plugins';

const settings: readonly AppClientSettingDefinition[] = defineClientSettings([
  {
    id: 'example/general',
    title: 'General',
    group: 'Example',
    access: { resource: 'example.settings.general', action: 'read' },
    pageLoader: () => import('./pages/general'),
  },
]);

export default settings;
```

`id` is both the identity and the URL: a setting is served at `/settings/<id>`,
so the entry above lands at `/settings/example/general`. Slashes namespace a
plugin's pages, which is what keeps ids from colliding between plugins; an id
may not begin or end with one, and no segment may be empty. `group` is the
heading the application groups the page under, and both groups and their
members keep registration order.

`access` is optional. When present the application checks it before loading the
page: a setting the check denies is left out of the navigation and cannot be
reached by its URL either. A setting without it is visible to anyone who can
open the settings centre.

Routes and settings share one path space. A setting with id `general` and a
route at `/settings/general` are a conflict, and resolution fails with both
identities named rather than mounting two pages at one address.

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

A routes, settings, or providers entry may default-export a function of the
plugin's options instead of an array. The runtime calls it with the options the
application passed, so a plugin can add or drop contributions per application
without a second entry:

```ts
import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

import type { SettingsClientOptions } from './plugin.js';

const routes = (
  options: SettingsClientOptions,
): readonly AppClientRouteDefinition[] =>
  defineClientRoutes(
    options.settingsPages === false ? [] : [...SETTINGS_ROUTES],
  );

export default routes;
```

For providers this is also the only place configuration can reach the
component, since `AppClientProviderDefinition.component` is a
`ComponentType<PropsWithChildren>` and takes no extra props; the factory form
gives the plugin a closure to capture options in. Entries that need no options
stay arrays; nothing about them changes.

Provider definitions may use full provider IDs in `before` and `after`.
Provider arrays are ordered from outer to inner by the fixed layers
`root -> application -> extension`, with stable topological sorting inside
each layer. Application providers default to `application` and may explicitly
use `root`; plugin providers always use `extension`. Ordering constraints may
only reference another provider in the same layer. Missing references,
cross-layer constraints, duplicate IDs, and cycles fail before the first React
render.

The application owns route placement, authentication, loading, error UI, the
settings centre chrome, and the final provider tree. `bootstrap` remains the
imperative initialization entry; routes, settings, and providers remain
inspectable declarations.

## Route component overrides

An application may customize a plugin route's final component without taking
over its path or auth metadata:

```ts
import {
  applyClientRouteComponentOverrides,
  defineClientRouteComponentOverrides,
} from '@nocobase/app-client/plugins';

const overrides = defineClientRouteComponentOverrides([
  {
    routeId: '@nocobase/app-plugin-authentication:login',
    componentEntry: './client/auth/pages/login-page',
    componentLoader: () => import('./auth/pages/login-page'),
  },
]);

const finalRoutes = applyClientRouteComponentOverrides(routes, overrides);
```

Overrides are applied after route normalization and before the route module is
loaded.
They can replace only the loader. Missing targets, duplicate overrides, invalid
loaders, and invalid component modules fail with the stable route ID.

A route may be overridden exactly once, no matter where the override comes
from. Passing a plugin option that produces an override for a route another
override already claims fails with that route ID; move the override to one
place rather than layering two.

## The bootstrap context

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

The context also carries `options`, the value the application passed to this
plugin's factory, or an empty object when it passed none. This is where
imperative configuration lands, as opposed to the declarative route
replacements that go through `routeComponentOverrides`. Type the bootstrap with
the plugin's own options interface to read it:

```ts
import type { AppClientBootstrap } from '@nocobase/app-client/plugins';

import type { ExampleClientOptions } from './plugin.js';
import { createNotificationProvider } from './notification-provider.js';

const bootstrap: AppClientBootstrap<ExampleClientOptions> = ({
  refine,
  options,
}) => {
  refine.setNotificationProvider(createNotificationProvider(options));
};

export default bootstrap;
```
