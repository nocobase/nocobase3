# @nocobase/app-plugin-registry-example

## 0.0.2-beta.0

### Patch Changes

- c8f38c8: Register client plugins explicitly in the application's `client/plugins.ts` instead of discovering them from `nocobase.plugins` through a Vite virtual module.

  Each plugin now ships a `client/plugin.ts` descriptor, exported as `./client/plugin`, that declares its bootstrap, routes, providers, and route component overrides. An application composes them with `defineClientPlugins([...])`, where array order is bootstrap order and a plugin is enabled by being present. The entry is real, type-checked application source: it can be read, diffed, and edited, and Vite reloads it like any other module.

  Plugins can also accept options. `defineClientPlugin` takes an options type that reaches the bootstrap context, the routes and providers factories, and the route component overrides, so an application can pass a custom login page or a notification label at registration.

  `@nocobase/app-plugin-registry-example` only drops its now-unread `nocobase.plugin.client` manifest field; it contributes no client extensions.

- Updated dependencies [062f5b1]
- Updated dependencies [c8f38c8]
  - @nocobase/app-client@1.0.0-beta.3

## 0.0.1

### Patch Changes

- 5881647: Add an example of runtime UI and application-owned registry UI.
