# @nocobase/create-plugin

## 0.1.0-beta.1

### Minor Changes

- fb1a752: Replace the ambiguous plugin scaffold capabilities `server.providers`, `client.providers`, and `client.bootstrap` with `server.service-providers`, `client.service-providers`, and `client.react-providers`.

  Generate static Client and Server contribution declarations, Client ServiceProvider lifecycle structure, and explicitly named React Provider structure for the selected capabilities.

- ac3f033: Export every server plugin from its package's `./server` entry point, and update application composition, plugin discovery, and generated plugins to use the unified entry point.

### Patch Changes

- 78cf0a2: Return a single versioned JSON envelope for both successful and failed Create
  Plugin and Plugin Skills synchronization commands. Plugin Skills
  synchronization now includes consistent success and failure statuses. JSON
  failures keep a non-zero exit code and expose stable error codes, readable
  messages, and actionable suggestions without appending non-JSON usage output.
- 78cf0a2: Add a complete App-facing Plugin Skill example with a reusable Notice component, an authenticated Server API, target-App integration tests, and capability-aware Skill scaffolding. Clarify System Info ownership, authorization, and behavioral verification guidance.
- 78cf0a2: Align Route examples, scaffolding guidance, and Agent-facing Client and Server Route documentation with the latest ownership and testing practices.
- 78cf0a2: Generate runtime-aware TypeScript, ESLint, Node engine, and development dependency configuration for Client-only, Server-only, and full-stack plugins, including stable package-scoped Queue Job identities.

  Keep plugins aligned with the Agent development contract by giving Queue, System Information, and Workflow Routes path-scoped authentication, documenting the Queue API path and Database declaration source accurately, and storing example tests under each plugin's root test directory.

- Updated dependencies [fb1a752]
  - @nocobase/dev-config@0.0.1-beta.2

## 0.0.2-beta.0

### Patch Changes

- Add explicit `client.locales` and `server.locales` capabilities, and stop generating locale resources implicitly for unrelated Client capabilities.
- b049266: Scaffold a plugin with locale files and a declared `locales` entry, so a new plugin starts out translatable rather than needing i18n retrofitted.
- 7cdffbd: Replace separate API and root route arrays with one ordered `routes` contribution array. Route factories now receive the Application, create and return their own Hono router, and are mounted automatically at `/api` or the application root according to their definition.

  Standardize plugin server modules around `providers/index.ts` and `routes/index.ts` collection entries, `services/` domain implementations, and a stable `tokens.ts` public contract.

  Generated plugins now declare conventional database and queue contribution directories by default. Missing optional directories are ignored until executable migrations, seeds, or jobs are added.

  Generated plugins now include an App-facing starter Agent Skill under the package's `skills/` directory. Plugin registration and skill synchronization copy these package-owned Skills into registered applications' `.agents/skills/` directories.

  Unify Client page contributions behind one `routes` loader. Plugins now use `defineAppRoutes()` and `defineSettingsRoutes()` to add child Routes to the application's two built-in Client Routes, mirroring how Server plugins use `defineRootRoutes()` and `defineApiRoutes()` with the built-in Hono routers.

- 12dfb68: Add the template-based `@nocobase/create-plugin` scaffold with complete client and server examples, including shadcn configuration for plugin-owned runtime UI and an application-owned Registry component recipe with build, materialize, and publishing metadata. Reuse the `nb3 app plugin` commands from the monorepo root, and register exported server plugin definitions in the application's explicit `server/plugins.ts` composition root.
- Updated dependencies [b049266]
  - @nocobase/dev-config@0.0.1-beta.1

## 0.0.1

### Patch Changes

- Add a template-based generator for NocoBase 3 application plugins.
- Document that the registration command automatically connects the generated `./server` export to the target application's explicit server composition root.
- Replace the complete default scaffold with explicit, composable plugin
  capabilities and a shared generation plan. Add structured JSON dry runs and
  require callers to select capabilities or explicitly request an empty
  package foundation.
