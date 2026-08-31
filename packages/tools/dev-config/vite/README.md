# Portal Vite factory

`createPortalViteConfig` provides the shared Portal build baseline:

- an injected Portal SDK compatibility plugin;
- React and Tailwind Vite plugins;
- `dist/client` build output;
- development HMR client port from `APP_VITE_DEV_PORT`;
- development HMR host from `APP_VITE_DEV_HOST` when it is set to a specific
  hostname. When it is unset or `0.0.0.0`, Vite uses the page hostname.

Pass a Vite config object or config function. It is merged after the shared
configuration, so local values can extend or override the baseline:

```js
import { createPortalViteConfig } from '@nocobase/dev-config/vite/portal';
import { portalSdkCompatibilityPlugin } from '@nocobase/app-portal-sdk/vite';
import path from 'node:path';

export default createPortalViteConfig(
  portalSdkCompatibilityPlugin,
  ({ command, mode }) => ({
    base: '/my-portal/',
    define: {
      __PORTAL_MODE__: JSON.stringify(`${command}:${mode}`),
    },
    envPrefix: ['VITE_', 'NOCOBASE_'],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './client'),
      },
    },
  }),
);
```

The compatibility plugin is injected to keep this package independent from
`@nocobase/app-portal-sdk`; this avoids a package cycle because the SDK itself uses
the shared development config. The effective Vite `root` defaults to
`process.cwd()`. Set `root` in the local config when Vite runs from another
directory; the factory passes the same absolute root to the compatibility
plugin.

Keep `base`, API and proxy addresses, environment prefixes, aliases, package
metadata defines, and package-specific plugins local.
