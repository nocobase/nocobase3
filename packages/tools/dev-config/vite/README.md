# Portal Vite factory

`createPortalViteConfig` provides the shared Portal build baseline:

- React and Tailwind Vite plugins;
- `dist/client` build output;
- development HMR client port from `APP_VITE_DEV_PORT`;
- development HMR host from `APP_VITE_DEV_HOST` when it is set to a specific
  hostname. When it is unset or `0.0.0.0`, Vite uses the page hostname.

Pass a Vite config object or config function. It is merged after the shared
configuration, so local values can extend or override the baseline:

```js
import { createPortalViteConfig } from '@nocobase/dev-config/vite/portal';
import path from 'node:path';

export default createPortalViteConfig(({ command, mode }) => ({
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
}));
```

The effective Vite `root` defaults to `process.cwd()`. Set `root` in the local
config when Vite runs from another directory.

Keep `base`, API and proxy addresses, environment prefixes, aliases, package
metadata defines, and package-specific plugins local.

Portal development excludes `@silurus/ooxml` from dependency prebundling to preserve its parser WASM asset URLs.

## Application plugin contributions

Call `await loadAppVitePlugins({ appRoot, environment })` from `@nocobase/dev-config/vite/plugins` and include the returned plugins in the application's Vite config. The loader reads the explicit `defineClientPlugins([...])` calls in `client/plugins.ts`, without importing browser modules into the configuration process. Use default imports of package `/client` entries and explicit factory calls in that array; aliases of `defineClientPlugins` are supported. Merely importing a plugin or listing it in management metadata does not enable its contribution.

A registered package may export `./vite` with a default factory accepting `{ appRoot, environment, registration }`. The loader resolves that export with Node ESM import conditions from the application, so it works with pnpm's isolated dependencies and import-only exports. A package need not export its own `package.json`.

A contribution must not require the package's client code to import an id that only its Vite plugin can resolve. An installing application pre-bundles that client code from `node_modules` with esbuild, which runs no Vite plugin, and an application that does not call the loader must still build. When the page needs a virtual module, inject it from the plugin, for example with a development-only `transformIndexHtml` script, as the Workflow contribution does.
