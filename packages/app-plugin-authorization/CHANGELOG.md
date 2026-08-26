# @nocobase/app-plugin-authorization

## 0.1.1-beta.0

### Patch Changes

- 0465323: Introduce the plugin-based authorization core and permission management UI. Replace the previous authorization API with composable core, database, permission-set, default-access, sharing-rule, restriction-rule, and page plugins; add route access metadata to the application client; publish and enable the authorization app plugin in the default template; and correct the Hub documentation to use the v3 Portal SDK package name.
- b269e38: Publish this package. It was marked private, so it never reached the registry even though the default template depends on it and enables it, which left `pnpm install` in a generated application failing with a 404.
- Updated dependencies [0465323]
- Updated dependencies [0465323]
  - @nocobase/authorization@0.0.1-beta.1
  - @nocobase/app-client@1.0.0-beta.2
  - @nocobase/app-server-kit@0.0.1-beta.1
