---
'@nocobase/app-client': patch
'@nocobase/app-plugin-repository-example': patch
---

Reach the API client through `@nocobase/app-client` instead of importing `@nocobase/api-client` directly from the example plugin's client code. The plugin value-imported `ApiClientError` and `buildFindManyOptions` from a package it declares only as a `devDependency`, which resolved solely because pnpm happened to hoist that package for another consumer. `ApiClientError` is also compared with `instanceof`, so a second copy would make the check silently return false and leave `error.code` undefined under code that looks correct. Re-export `buildFindManyOptions` alongside the existing `ApiClientError` so the plugin resolves both through the single copy the application already provides.
