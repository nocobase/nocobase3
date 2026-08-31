# @nocobase/app-client

Browser application runtime for NocoBase v3. It provides the stateful
`ClientApplication`, application-scoped services, static Client plugin
composition, Refine integration, React tree composition, routes, locale
resources, and public runtime configuration.

## Architecture

```text
public HTML config + static declarations
                    ↓
          resolveAppRuntime()
                    ↓
          ClientApplication
          ├── config
          ├── ServiceContainer
          ├── ServiceProviders
          ├── Refine configuration
          └── React render configuration
                    ↓
          start() → host render()
```

The Client and Server use the same explicit `serviceProviders` term for
application services and lifecycle. Client React tree contributions are named
`reactProviders`, so they cannot be confused with ServiceProviders or with
Refine properties such as `authProvider` and `dataProvider`.

## Application runtime declaration

Startup-required declarations use static imports. Lazy loading belongs at leaf
boundaries such as route pages, locale messages, heavy SDKs, and truly optional
features.

```ts
import { createAppClientConfig } from '@nocobase/app-client';
import { defineAppRuntime } from '@nocobase/app-client/runtime';

import locales from './locales/index.js';
import plugins from './plugins.js';
import serviceProviders from './providers/index.js';
import reactProviders from './react-providers/index.js';
import routes from './routes.js';

export default defineAppRuntime({
  packageName: '@example/app',
  config: createAppClientConfig,
  serviceProviders,
  reactProviders,
  routes,
  locales,
  plugins: plugins.plugins,
  routeComponentOverrides: plugins.routeComponentOverrides,
});
```

Static import makes the composition plan available to runtime resolution and
inspection. It does not register a service, execute lifecycle hooks, render a
React component, load a route page, or load locale messages. Declaration
modules must therefore remain side-effect-free.

## Client entry

```tsx
import { AppClientRoot } from '@nocobase/app-client';
import { resolveAppRuntime } from '@nocobase/app-client/runtime';
import { createRoot } from 'react-dom/client';

import { createApp } from './app.js';
import appRuntime from './runtime.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing application root element.');
const root = createRoot(container);

const runtime = await resolveAppRuntime(appRuntime);
const app = createApp(runtime);

await app.start();
root.render(<AppClientRoot app={app} />);
```

`app.start()` performs the complete ServiceProvider lifecycle and finalizes the
Refine and render configuration. The Browser host owns the React root and
renders `AppClientRoot` only after startup succeeds. During disposal, the host
unmounts its React root and `app.shutdown()` shuts down providers in reverse
order.

## ClientApplication

An application owns:

- the resolved Runtime;
- a read-only `app.config`;
- one application-scoped `ServiceContainer`;
- ServiceProvider instances and lifecycle state;
- the API client binding under `appApiClientToken`;
- mutable `app.refine` setters during Provider lifecycle;
- finalized `app.refineConfig` after startup;
- finalized React render configuration consumed by `AppClientRoot`.

Create an application directly when the default helper is sufficient:

```ts
import { createApp } from '@nocobase/app-client';

const app = createApp(runtime, (application) => {
  const { runtime, refineConfig } = application;
  return {
    basename: runtime.basename,
    reactProviders: runtime.reactProviders.map(({ component }) => component),
    routes: createRoutes(runtime.routes, refineConfig),
  };
});
```

The default template constructs `ClientApplication` directly because it adds
its own router and application-level i18n wrapper.

## ServiceProviders

Client ServiceProviders share `@nocobase/service-provider` with Server
applications:

```ts
import { ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';

export class AuditServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@example/audit/client';

  public override register(): void {
    this.app.container.singleton(auditToken, () =>
      createAuditService(this.app.config),
    );
  }

  public override async boot(): Promise<void> {
    this.app.refine.setLiveProvider(createLiveProvider());
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolve(auditToken).close();
  }
}
```

The lifecycle order inside `app.start()` is:

```text
register all
→ boot all
→ finalize Refine and render configuration
→ validate Runtime
→ start all
→ ready all
```

Startup failure triggers reverse cleanup for providers that entered lifecycle.
Async hooks retain the owning Provider context, so `this.app.refine` remains
valid across `await` while the hook is running. Outside Provider lifecycle,
read the finalized `app.refineConfig` instead of mutating `app.refine`.

Application components can resolve services through:

```tsx
import { useClientApplication, useService } from '@nocobase/app-client';

const app = useClientApplication();
const audit = useService(auditToken);
```

## React Providers

React Providers are synchronous React components that receive `children`:

```tsx
import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      name: 'audit-context',
      component: AuditContextProvider,
      layer: 'extension',
      after: ['theme'],
    },
  ]);

export default reactProviders;
```

React Providers are ordered outer-to-inner by layer and explicit `before`/`after`
constraints. Their components render only when the Browser host renders
`AppClientRoot` for a started application. Use a
Wrapper for React Context or tree-local UI behavior; use a ServiceProvider for
application services, Container bindings, Refine setup, connections, listeners,
and lifecycle cleanup.

## Routes and locale resources

Route definitions are static, while page components remain lazy:

```ts
import { defineAppRoutes } from '@nocobase/app-client/plugins';

export default defineAppRoutes([
  {
    name: 'audit-log',
    path: '/audit-log',
    auth: 'required',
    componentLoader: () => import('./pages/audit-log.js'),
  },
]);
```

Locale manifests are static, while each language module remains lazy:

```ts
export default {
  'en-US': () => import('./locales/en-US.js'),
  'zh-CN': () => import('./locales/zh-CN.js'),
};
```

Settings pages use `defineSettingsRoutes()`. Route component overrides replace
only a page component loader and keep the plugin-owned route identity, path,
authentication, navigation, and access metadata.

## Client plugin declaration

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import serviceProviders from './providers/index.js';
import reactProviders from './react-providers/index.js';
import routes from './routes.js';

export interface AuditClientOptions {
  readonly resourceLabel?: string;
}

const audit: AppClientPluginFactory<AuditClientOptions> = defineClientPlugin({
  packageName: '@example/app-plugin-audit',
  config: [auditClientConfig],
  serviceProviders,
  reactProviders,
  routes,
  locales,
});

export default audit;
```

The target application enables plugins explicitly:

```ts
import audit from '@example/app-plugin-audit/client';
import { defineClientPlugins } from '@nocobase/app-client/plugins';

export default defineClientPlugins([audit({ resourceLabel: 'Audit logs' })]);
```

Array order is contribution order. Plugin options are immutable registration
configuration; they are not deployment secrets or mutable global state.

## Public runtime configuration

Server-rendered SPA HTML contains a versioned JSON data block:

```html
<script id="nocobase-runtime-config" type="application/json">
  { "version": 1, "config": { "app": { "title": "NocoBase" } } }
</script>
```

`resolveAppRuntime()` reads and validates this payload, then passes its public
`config` value to the application config factory. Plugin config contributions
provide namespaced defaults and validation; deployment values override those
defaults. Runtime code reads the normalized result with `app.config.get()`.

Only public Browser configuration belongs in this payload. Server secrets must
never be copied into the HTML data block, Client plugin options, logs, or
inspection output.

## Inspection boundary

Client inspection imports `client/runtime.ts` and `client/plugins.ts` and reads
static declarations. It does not create `ClientApplication`, instantiate or run
ServiceProviders, render React Providers, load route page components, or load
locale messages. Inspection is a composition diagnostic, not proof of runtime
behavior.

## Verification

```bash
pnpm --filter @nocobase/app-client lint
pnpm --filter @nocobase/app-client typecheck
pnpm --filter @nocobase/app-client test
pnpm --filter @nocobase/app-client build
```

After changing a public contract, also validate the default template and the
plugins that consume the changed fields.
