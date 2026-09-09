# @nocobase/app-plugin-ai-knowledge-base

## 0.1.0-beta.5

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
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.5
  - @nocobase/app-plugin-authentication@0.1.0-beta.9

## 0.1.0-beta.4

### Minor Changes

- dc517b1: Add declarative, Drive-backed knowledge-base Manifest imports, config-managed vector database synchronization, persistent recovery state, a public Manifest service token, and read-only protection for configuration-owned vector databases.

### Patch Changes

- dc517b1: Refactored the AI knowledge-base server around property-cached repository, manager, and service factories; added complete AI feature provider registries, authenticated `/api` and `/v2/api` routes, lifecycle-managed vectorization and PGVector resources, and a standardized Server registration entry.
- dc517b1: Restore AI knowledge-base cleanup and vectorization parity by removing document and shard objects with their database records, deleting vectors with the correct knowledge-base and document selectors, persisting segment edits and deletions back to shard files, tracking segment revisions during rebuilds, and allowing stale queue jobs to exit safely.
- 0811f18: Fix knowledge base management sizing, segment validation, date and status display, document downloads, retrieval detail overlays, scrolling, and Chinese localization coverage.
- dc517b1: Inline vector database, LLM service, embedding model, configuration hash, and change timestamps on knowledge-base records; remove the legacy vector-store configuration repository and schema; and resolve built-in vector stores by knowledge-base key.
- 96493f9: Remove the document-list upload hint, place document management in a card, and align the vector database enabled control with the knowledge base editor layout.
- 96493f9: Move all AI knowledge-base APIs under `/api/ai` and remove the unprefixed `/api` and legacy `/v2/api` endpoints.
- Updated dependencies [dc517b1]
- Updated dependencies [d29d1fe]
- Updated dependencies [dc517b1]
- Updated dependencies [0811f18]
- Updated dependencies [7057ee0]
- Updated dependencies [5281fd1]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.4
  - @nocobase/app-server@1.0.0-beta.8
  - @nocobase/ai-employee@0.2.0-beta.3
  - @nocobase/drive@0.1.0-beta.4
  - @nocobase/app-plugin-authentication@0.1.0-beta.8
  - @nocobase/app-client@1.0.0-beta.11
  - @nocobase/app-portal-sdk@1.0.0-beta.3
  - @nocobase/db@1.0.0-beta.3
  - @nocobase/i18n@1.0.0-beta.2
  - @nocobase/queue@0.1.0-beta.3
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.3

### Minor Changes

- a4d4982: Add application-owned AI Knowledge Base Registry items for providers, controlled components, and a complete editable workspace, plus six development-only showcase routes under `/dev/ai-knowledge-base`.

### Patch Changes

- Updated dependencies [9536bf5]
  - @nocobase/app-client@1.0.0-beta.11
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- 8b18b47: Fixed knowledge-base document uploads in ESM applications, made parsed-document cache paths filesystem-safe, corrected embedding-model API requests and database boolean handling, and prevented non-image chat attachments from rendering as broken image previews.
- Updated dependencies [8b18b47]
  - @nocobase/ai-employee@0.2.0-beta.2
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 81c6d6d: Replace the temporary AI file manager with metadata-aware, drive-backed file storage factories, configurable storage disks, and per-domain metadata repositories.

### Patch Changes

- 813da59: Declare browser-only packages as devDependencies rather than dependencies, and make `react-i18next` an optional peer of `@nocobase/i18n` provided by `@nocobase/app-client`. Client code is bundled by the consuming application, so these entries did nothing for the bundle while `dist/package.json` pulled every one of them into the server deployment to be installed and never required.
- Updated dependencies [8d88ff4]
- Updated dependencies [43d5bf0]
- Updated dependencies [813da59]
- Updated dependencies [81c6d6d]
- Updated dependencies [cee3251]
  - @nocobase/ai-employee@0.2.0-beta.1
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.1
  - @nocobase/app-server@1.0.0-beta.6
  - @nocobase/app-client@1.0.0-beta.9
  - @nocobase/i18n@1.0.0-beta.2
  - @nocobase/app-portal-sdk@1.0.0-beta.3
  - @nocobase/db@1.0.0-beta.2
  - @nocobase/queue@0.1.0-beta.3
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
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.0
  - @nocobase/db@1.0.0-beta.2
  - @nocobase/i18n@1.0.0-beta.1
  - @nocobase/ai-employee@0.1.1-beta.0
  - @nocobase/queue@0.1.0-beta.3
  - @nocobase/service-provider@0.0.2-beta.1

## 0.0.1

### Patch Changes

- Add the AI Knowledge Base App plugin with database-backed knowledge bases, document ingestion and segmentation, retrieval APIs, and vector database management.
- Add the built-in PGVector provider and background document vectorization jobs.
- Register knowledge base management pages in application settings.
