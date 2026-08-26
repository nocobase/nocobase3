# @nocobase/app-template-default

## 0.0.1-beta.4

### Patch Changes

- 0465323: Introduce the plugin-based authorization core and permission management UI. Replace the previous authorization API with composable core, database, permission-set, default-access, sharing-rule, restriction-rule, and page plugins; add route access metadata to the application client; publish and enable the authorization app plugin in the default template; and correct the Hub documentation to use the v3 Portal SDK package name.

## 0.0.1-beta.3

### Patch Changes

- 31245b6: Align `nocobase.defaultTemplateVersion` with the package version. Releases now synchronize the two, so an application generated from the template no longer inherits a stale template version.

## 0.0.1-beta.2

### Patch Changes

- 89fc34a: Upgrade Agent Annotations to version 0.1.5 and prevent its runtime files from triggering repeated Vite page reloads.

## 0.0.1-beta.1

### Patch Changes

- 509d812: Localize the shadcn UI components used by applications, plugins, and registries so they can customize their presentation independently. Remove the `@nocobase/app-client/ui` entry point and migrate its consumers to package-local components.

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
