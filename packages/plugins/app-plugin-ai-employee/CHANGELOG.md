# @nocobase/app-plugin-ai-employee

## 0.1.0-beta.2

### Patch Changes

- 8b18b47: Fixed knowledge-base document uploads in ESM applications, made parsed-document cache paths filesystem-safe, corrected embedding-model API requests and database boolean handling, and prevented non-image chat attachments from rendering as broken image previews.
- Updated dependencies [8b18b47]
  - @nocobase/ai-employee@0.2.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 8d88ff4: Replace the public AI Employee LLM service filesystem loader with the application `config.yml` contract at `ai.llmServices`. Configured model entries use a simple label/value array and are converted internally to custom mode. The App plugin validates and synchronizes declarative service definitions at startup and on application-config reload while preserving repository-managed enabled state for matching services. The default App template includes a commented configuration example, and the App config validator supports unique object properties for rejecting duplicate service names.
- 81c6d6d: Replace the temporary AI file manager with metadata-aware, drive-backed file storage factories, configurable storage disks, and per-domain metadata repositories.

### Patch Changes

- 43d5bf0: Publish the application-owned AI Employee frontend Registry with its chat components. Plugin-owned development showcases now live under `client/dev`, outside the materialized Registry item, and are excluded from production application builds. The Registry uses the application-scoped `@nocobase/app-client` transport for JSON, upload, and streaming requests instead of the deprecated Portal SDK client. The Default and Hub templates scan plugin Registry source for Tailwind utilities, so materialized components retain their intended responsive layout and sizing.
- 813da59: Declare browser-only packages as devDependencies rather than dependencies, and make `react-i18next` an optional peer of `@nocobase/i18n` provided by `@nocobase/app-client`. Client code is bundled by the consuming application, so these entries did nothing for the bundle while `dist/package.json` pulled every one of them into the server deployment to be installed and never required.
- Updated dependencies [8d88ff4]
- Updated dependencies [43d5bf0]
- Updated dependencies [813da59]
- Updated dependencies [81c6d6d]
- Updated dependencies [cee3251]
  - @nocobase/ai-employee@0.2.0-beta.1
  - @nocobase/app-server@1.0.0-beta.6
  - @nocobase/app-client@1.0.0-beta.9
  - @nocobase/i18n@1.0.0-beta.2
  - @nocobase/app-plugin-authentication@0.1.0-beta.6
  - @nocobase/db@1.0.0-beta.2
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.0

### Minor Changes

- 1527426: Declare identity-sensitive runtime packages as peer dependencies of every plugin.

  A plugin used to list `@nocobase/app-server`, `@nocobase/db`, `@nocobase/service-provider`, `@nocobase/i18n`, `@nocobase/queue`, `@nocobase/app-portal-sdk`, and the plugins it builds on among its `dependencies`. Each of these carries state that only works while exactly one copy of the module exists in the process: `ServiceContainer` keys its bindings by the token object itself, React contexts match only the provider created from the same module, and `@nocobase/queue` registers job classes into a global `Locator`. A `dependencies` range lets a package manager install a second copy to satisfy it, which splits that state.

  The monorepo could never show the problem, because `workspace:` links every consumer to one directory. It appears once a plugin is installed from a registry into an application, and it appears at runtime rather than at install time: a service that is registered reports `Service "..." is not registered`, or a context reads `undefined` under a mounted provider.

  Each of these packages is now a peer dependency paired with a devDependency. The peer is the published contract that makes the installing application provide the single copy; the devDependency pins this repository's copy for development and tests, which the deliberately wide peer range does not. Applications built from the templates are unaffected — they already install every one of these packages directly, which is what satisfies the new peer ranges.

  `pnpm plugin:create` generates the same shape, and `pnpm peers:check` enforces it in CI.

### Patch Changes

- Updated dependencies [174eab5]
- Updated dependencies [ab7b341]
- Updated dependencies [1527426]
- Updated dependencies [174eab5]
  - @nocobase/app-client@1.0.0-beta.6
  - @nocobase/app-portal-sdk@1.0.0-beta.2
  - @nocobase/app-server@1.0.0-beta.4
  - @nocobase/app-plugin-authentication@0.1.0-beta.5
  - @nocobase/db@1.0.0-beta.2
  - @nocobase/i18n@1.0.0-beta.1
  - @nocobase/snowflake@1.0.0-beta.3
  - @nocobase/ai-employee@0.1.1-beta.0
  - @nocobase/service-provider@0.0.2-beta.1

## 0.0.1

### Patch Changes

- Add the AI Employee App plugin with database-backed runtime integration, local API routes, and packaged built-in resources.
- Move the application-specific `CurrentUser` type from AI Employee Core into the App plugin public server API.
- Remove the developer built-in employees and the document-search skill from packaged AI resources.
- Register the AI Employee management page in application settings and localize its settings tabs.
