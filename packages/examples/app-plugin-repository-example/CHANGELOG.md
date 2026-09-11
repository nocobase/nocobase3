# @nocobase/app-plugin-repository-example

## 0.1.0-beta.3

### Patch Changes

- 1d042c0: Support recursive page routes and navigation groups across App, Settings, and Dev. Render application menus from route navigation instead of Refine resources, preserve parent access checks, and migrate template and example navigation. Refine resources remain available for CRUD integration.
- Updated dependencies [e3fa827]
- Updated dependencies [c3e02bf]
- Updated dependencies [0a3fa83]
- Updated dependencies [1d042c0]
  - @nocobase/app-server@1.0.0-beta.9
  - @nocobase/app-plugin-authentication@0.1.0-beta.10
  - @nocobase/app-client@1.0.0-beta.12
  - @nocobase/db@1.0.0-beta.4

## 0.1.0-beta.2

### Patch Changes

- 52d1107: Resolve the shared UI packages through the workspace catalog: `@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`, `shadcn`, `tailwind-merge`, and `tw-animate-css`.

  Every package already agreed on one version for each of these — the catalog is what keeps them agreeing. A range edited in one manifest and not the others would otherwise put two copies of a UI primitive into an application's bundle, which is the kind of drift nothing reports until a component behaves differently depending on which plugin rendered it.

  Peer dependencies use `catalog:` too. `pnpm pack` resolves it before publishing, so a consumer still reads an ordinary range.

- 52d1107: Declare the packages each plugin's browser code imports as peer dependencies, so an application that installs the plugin can resolve them while a server deployment installs none of them.

  A plugin's `client/` is not bundled by the plugin: `build` is `tsc`, so `dist/client/*.js` keeps its bare imports and the consuming application's Vite build resolves them. That application has only what the published manifest declares, and npm does not publish `devDependencies` — so a client import declared only there fails with `Could not resolve "…"`. `sonner` and `@xyflow/react` both shipped that way. Ten of these plugins appeared to work only because `app-template-default` happened to declare the same package for its own use; `@nocobase/app-plugin-hub`'s CodeMirror imports had no such coincidence and were unresolvable wherever it was installed.

  Peer dependencies are what satisfy both sides. An application installs one shared copy, and a deployment — which sets `autoInstallPeers: false` — installs none, so packages a server never requires stay out of it. Each keeps a matching devDependency so the workspace still resolves it and the version used here stays pinned. None is marked `optional`: an optional peer is not auto-installed anywhere, including in the application that needs it.

  `create-plugin` emits the same shape and its generated `AGENTS.md` teaches it, so a plugin created tomorrow declares its browser packages as peers rather than repeating the mistake.

- 52d1107: Declare each peer dependency once, dropping the devDependency that used to accompany it.

  The pairing was required on the grounds that a peer range is wide enough for development to drift off this repository's copy. It is not: pnpm installs a peer and links it into the plugin's own `node_modules`, resolving `workspace:^` to the same package `workspace:*` would. A plugin with the devDependency removed still links, typechecks, builds, and tests against it — verified against a clean install with every plugin's `node_modules` deleted first.

  What remained was a second declaration that changed nothing and had to be kept in step with the first. `pnpm peers:check` no longer asks for it, and `create-plugin` no longer emits it.

- Updated dependencies [52d1107]
- Updated dependencies [52d1107]
- Updated dependencies [52d1107]
  - @nocobase/app-plugin-authentication@0.1.0-beta.9

## 0.1.0-beta.1

### Patch Changes

- 9536bf5: Reach the API client through `@nocobase/app-client` instead of importing `@nocobase/api-client` directly from the example plugin's client code. The plugin value-imported `ApiClientError` and `buildFindManyOptions` from a package it declares only as a `devDependency`, which resolved solely because pnpm happened to hoist that package for another consumer. `ApiClientError` is also compared with `instanceof`, so a second copy would make the check silently return false and leave `error.code` undefined under code that looks correct. Re-export `buildFindManyOptions` alongside the existing `ApiClientError` so the plugin resolves both through the single copy the application already provides.
- Updated dependencies [0e9505a]
- Updated dependencies [9536bf5]
  - @nocobase/app-plugin-authentication@0.1.0-beta.8
  - @nocobase/app-client@1.0.0-beta.11

## 0.1.0-beta.0

### Minor Changes

- 90a4903: Add a Repository API example plugin with relational CRM and order tables, transactional sample data seeds, authenticated CRUD endpoints, and localized management pages with grouped navigation, detail child routes and create/edit drawers, product-aware order details and nested order-item creation. Include an atomic numeric update playground with seeded counters, guarded deductions and concurrent increments. Add aggregate statistics, status filters, product grouping with HAVING, and customer relation counts over the seeded orders. Enable the example in the Default Template.
- 90a4903: Add self-contained migrations and deterministic seed data for six prefixed relationship-write example collections.
- 90a4903: Add a seeded example page comparing array and streamed `findMany` consumption.
- 90a4903: Add an authenticated interactive page demonstrating nested and incremental Repository HTTP relationship writes, including through payloads and target lifetime checks.
- 566492d: Replace the combined relationship-write walkthrough with independent forms and tables for create, connect, disconnect, set, update, upsert, and delete. Support hasOne, hasMany, and many-to-many examples with isolated targets, through-role inputs, request previews, and explicit relationship and target-lifetime feedback. Expand the example repositories' nested-write allowlists to cover these operations.
- 566492d: Add five interactive select combine examples covering independent branches, relation aggregates, nested selections, shared and branch-local filters, and many-to-many relations, with tabular results, nested record tables, and inspectable JSON requests and responses.
- 566492d: Add interactive Repository sorting examples covering field order, stable ties, NULL placement, relation paths and aggregates, local include ordering, and invalid sort targets, with builder snippets, serialized requests, and tabular results.

### Patch Changes

- 90a4903: Support enum fields as Repository groupBy keys with exact member identity across database collations, nullable groups and stored-value validation. Preserve existing enum ordering restrictions. Replace per-status aggregate queries in the Repository example with a single enum groupBy request.
- 90a4903: Add server-owned writePolicy for single and bulk creates/updates, root upserts and
  mutation preflight. Internal Repository calls default to true. Explicit policies
  restrict scalar fields, each relation operation, nested create/update/upsert branches
  and through payloads before any writes. Add buildWritePolicy, buildUpsertWritePolicy
  and synchronous callback input, frozen snapshots and structured policy errors.

  Replace defineRepositoryApiRoutes action arrays with configuration objects and move
  maxLimit to actions.findMany. API create/update actions default to writePolicy false
  and require explicit allowlists; true and client-supplied policies are rejected.
  Return HTTP 403 for forbidden writes and migrate the Repository example's routes,
  fixtures and integration guidance to field and relationship policies.

- 90a4903: Align example filter and sort ASTs with the stricter Repository input types, including aggregate relation filters.
- 90a4903: Extend the aggregate page with customer order ranking, customer/status and product/price grouping examples. Add interactive row-count HAVING filters, readable relation links and per-panel request/result traces using the existing seed data.
- 90a4903: Expose opt-in aggregate and groupBy Repository HTTP actions with JSON AST validation, grouped filters and sorting, and lossless BigInt result serialization. Add matching remote Repository methods and public types. Switch the aggregate example to the generic authenticated endpoints and display its actual Repository requests.
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [a864497]
- Updated dependencies [a864497]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
  - @nocobase/db@1.0.0-beta.3
  - @nocobase/app-server@1.0.0-beta.7
  - @nocobase/app-client@1.0.0-beta.10
  - @nocobase/app-plugin-authentication@0.1.0-beta.7

## 0.0.1

### Patch Changes

- Add relational CRM and order management examples with authenticated Repository CRUD APIs, transactional sample data seeds and localized pages.
