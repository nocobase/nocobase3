# @nocobase/app-plugin-hub

## 0.1.0-beta.8

### Patch Changes

- 415d763: Add optional standalone HTTP and WebSocket proxy routing and configure Hub to forward paths outside its public mount to the current ready App Host port. Preserve public request identity and streaming, release proxy connections during shutdown, and use the shared public entry for hosted application links.

  Return 502 and close the upstream connection when a regular HTTP request receives an unexpected protocol upgrade. Validate App IDs against the normalized Hub mount and the managed Host's reserved `__` namespace before creating an application.

- Updated dependencies [415d763]
- Updated dependencies [1fea79a]
  - @nocobase/app-server@1.0.0-beta.16
  - @nocobase/app-plugin-authorization@0.2.0-beta.11
  - @nocobase/app-plugin-authentication@0.1.0-beta.15

## 0.1.0-beta.7

### Patch Changes

- d927494: Fix development startup of generated Hub applications by selecting the App Host launcher from the loaded package format, preserving source development in the workspace and using compiled JavaScript in installed packages. Keep the optional application configuration commented out so an empty YAML section cannot override application identity defaults during production startup. Correct the AI Employee plugin Skill namespace so generated applications can synchronize their registered plugins' Skills.
- Updated dependencies [d927494]
- Updated dependencies [6acf3bc]
- Updated dependencies [89955c5]
  - @nocobase/app-host@0.1.0-beta.7
  - @nocobase/app-plugin-users@0.0.2-beta.3
  - @nocobase/authorization@0.1.0-beta.6
  - @nocobase/app-plugin-authentication@0.1.0-beta.15
  - @nocobase/app-server@1.0.0-beta.15
  - @nocobase/db@1.0.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- 1decf5f: Keep a dialog's actions and its step indicator in view while its content scrolls

  `DialogContent` made the whole popup one scroll container, so a dialog tall enough to overflow moved its own footer below the fold. Deploying an application was the worst case: the configuration step stacks a source picker, a notice, and two editors, and the primary action could only be reached by scrolling past all of it.

  The popup is now a column that does not scroll. A header, an optional subheader, and a footer stay put, and a single body between them is what moves. `AppDialog` gained `footer` and `subheader` for this, and the deploy wizard puts its step indicator and configuration-source picker in the subheader — controls a reader needs in order to act on the body scroll out of reach exactly when the content is long enough to need them.

  The configuration editor's height is capped against the viewport as well as in pixels, so on a short screen it shrinks rather than spending the whole body on itself.

  One behavioural note: the create-application dialog's submit button now sits outside the `<form>` it belongs to, and is reassociated with it by `form` id, so both clicking it and pressing Enter in a field still submit.

- a60decd: Require an explicit absolute baseDir for Server plugins and resolve migrations, seeds, jobs, and package metadata from the loaded plugin copy. Generate and validate database task manifests during builds so TypeScript and JavaScript share source checksums, with verified legacy JavaScript history conversion and synchronized plugin scaffolding and application templates.
- Updated dependencies [1decf5f]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [a60decd]
- Updated dependencies [1a85a86]
- Updated dependencies [1a85a86]
- Updated dependencies [1c70f60]
- Updated dependencies [63db898]
  - @nocobase/app-host@0.1.0-beta.6
  - @nocobase/app-server@1.0.0-beta.15
  - @nocobase/db@1.0.0-beta.7
  - @nocobase/app-plugin-authentication@0.1.0-beta.14
  - @nocobase/app-plugin-authorization@0.2.0-beta.10
  - @nocobase/app-plugin-users@0.0.2-beta.2
  - @nocobase/app-client@1.0.0-beta.16
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.5

### Patch Changes

- a2dbe54: Publish only the compiled `dist/database`, no longer the TypeScript sources beside it. The runtime resolves a plugin's declared `database/migrations` and `database/seeds` against the package directory first and its `dist` second, so an installed plugin that shipped both served the sources, and Node refuses to strip types from a file under `node_modules`: `@nocobase/app-plugin-ai-employee` failed every application start with `Stripping types is currently unsupported for files under node_modules` while every development checkout, which resolves the same sources outside `node_modules`, kept working.

## 0.1.0-beta.4

### Minor Changes

- f17f3a6: Provide editable TypeScript defaults for application modules, assembled by the runtime before services start. Module factories receive the runtime with application paths and plugin metadata; deployment files and environment variables override defaults, and configuration reload preserves code defaults.

  Keep deployment settings in YAML examples and reserve explicit environment overrides for secrets and startup integration. Simplify application configuration loading, merging and reload subscriptions.

  Align client configuration assembly with the server: runtime merges application TypeScript defaults beneath public configuration before services start. Client inspection reports the application configuration entry.

- e11b855: Improve Hub App management with server-side catalog search and pagination, URL-addressable App detail Tabs, unified runtime status and action availability feedback, and application removal from the catalog.

  The catalog search is scoped to the Collection's database schema, so it works on PostgreSQL when the application runs outside the connection's default schema, and Hub reads no longer wait indefinitely for startup restoration; Apps the Host has not reached yet are reported as pending in the meantime.

  `GET /hub/apps` now returns a pagination object rather than an array. The response body changes from `HubAppSummary[]` to `{ items, total, page, pageSize }`, and accepts `search`, `page`, and `pageSize` query parameters. Any HTTP client reading the array directly has to read `items` instead. The `HubService.listApps()` method keeps its existing array return type; the new `HubService.listAppsPage()` serves the paginated route.

### Patch Changes

- ceb356b: Fix published package metadata and database test driver registration.
- e11b855: Generate and persist an authentication secret when a Config file deployment does not provide one.
- e11b855: Format dates in the language the application is in rather than the browser's. `Intl.DateTimeFormat` was constructed without a locale, which resolves to the browser's own language, so an English Hub on a Chinese browser rendered `2026年9月14日` beside its English labels — and a Chinese Hub on an English browser rendered `Sep 14, 2026`. The catalog, App detail header, Releases, Deployments and configuration history all read the application's language now.
- e11b855: Default the deploy dialog to the newest uploaded release instead of the one already running, mark the running and newest releases in the picker so two uploads of the same version can be told apart, and show the release checksum in the review step.
- e11b855: Preserve an existing App configuration when deploying a newer Release with a configuration template.
- Updated dependencies [ceb356b]
- Updated dependencies [f17f3a6]
- Updated dependencies [f17f3a6]
- Updated dependencies [f17f3a6]
- Updated dependencies [43d25b4]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [40e2d49]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [590861e]
- Updated dependencies [e11b855]
- Updated dependencies [72ed008]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [e11b855]
- Updated dependencies [e11b855]
- Updated dependencies [e11b855]
- Updated dependencies [ceb356b]
- Updated dependencies [e11b855]
- Updated dependencies [e11b855]
- Updated dependencies [ceb356b]
- Updated dependencies [40e2d49]
- Updated dependencies [590861e]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
  - @nocobase/app-server@1.0.0-beta.11
  - @nocobase/app-client@1.0.0-beta.14
  - @nocobase/app-plugin-authentication@0.1.0-beta.11
  - @nocobase/db@1.0.0-beta.5
  - @nocobase/authorization@0.1.0-beta.5
  - @nocobase/app-host@0.1.0-beta.5
  - @nocobase/app-plugin-users@0.0.2-beta.1

## 0.1.0-beta.3

### Minor Changes

- e3fa827: Add reusable user administration and Hub-scoped role-based authorization. Authentication now supports disabled accounts, transaction-aware administration, stable duplicate-identity conflicts, Session revocation, and immediate Realtime disconnects. Authorization supports protected Permission Sets, atomic scoped assignment replacement, and Client permission invalidation. The Users page supports protected role options, readable multi-role editing, explicit unassigned states, and a distinction between direct roles and authenticated-user defaults; password reset and database Session revocation share one transaction. The default App exposes its direct Authorization Permission Sets as application roles while keeping System administrator changes in Authorization. The Hub defines Administrator, Operator, and Viewer roles, batch-loads their user assignments, enforces every Hub and user-management action on the server, protects the final enabled Administrator, and hides unauthorized Client controls. Both templates register the reusable Users plugin; Hub exposes Applications, User management, and a read-only role matrix directly in its control-plane navigation, while the default App keeps Users in Settings. Only the Hub template receives Hub roles, disables public sign-up, and omits ordinary App Settings, workflows, notifications, and example plugins.

### Patch Changes

- 1d042c0: Support recursive page routes and navigation groups across App, Settings, and Dev. Render application menus from route navigation instead of Refine resources, preserve parent access checks, and migrate template and example navigation. Refine resources remain available for CRUD integration.
- Updated dependencies [e3fa827]
- Updated dependencies [c3e02bf]
- Updated dependencies [0a3fa83]
- Updated dependencies [1d042c0]
  - @nocobase/app-server@1.0.0-beta.9
  - @nocobase/authorization@0.1.0-beta.4
  - @nocobase/app-plugin-authentication@0.1.0-beta.10
  - @nocobase/app-plugin-authorization@0.2.0-beta.9
  - @nocobase/app-plugin-users@0.0.2-beta.0
  - @nocobase/app-client@1.0.0-beta.12
  - @nocobase/db@1.0.0-beta.4

## 0.0.2-beta.2

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
  - @nocobase/app-plugin-authorization@0.2.0-beta.8

## 0.0.2-beta.1

### Patch Changes

- a3cb4bb: Show release templates on the left and editable deployment drafts on the right. Initialize subsequent deployment drafts from current configuration and allow template changes to be applied selectively while reviewing against the active configuration.
- Updated dependencies [0e9505a]
- Updated dependencies [9536bf5]
- Updated dependencies [9536bf5]
  - @nocobase/app-plugin-authentication@0.1.0-beta.8
  - @nocobase/drive@0.1.0-beta.3
  - @nocobase/app-client@1.0.0-beta.11
  - @nocobase/app-plugin-authorization@0.2.0-beta.7

## 0.0.2-beta.0

### Patch Changes

- a864497: Register the Application Hub in the Hub template and provide an application control plane. Release artifacts supply their version and an optional `config.example.yml` or `config.example.yaml` template, while applications choose Config file or External configuration and reserve Hub-managed configuration for a future database-backed implementation. Hub actions reconcile only the selected application, reuse an already installed matching artifact, report deployment phase timings, and support removing an application and its persisted resources. Separate Hub desired configuration files from Host-owned runtime configuration, rebuild recovery targets when Host becomes ready, and split the management page into business modules.
- a864497: Paginate deployment history on the server and add page navigation to the Hub workspace. Refresh only the selected page and show new deployments on the first page.
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
  - @nocobase/app-host@0.1.0-beta.4
  - @nocobase/app-plugin-authorization@0.2.0-beta.7

## 0.0.1

### Patch Changes

- Add the initial single-Host application management flow with immutable Release builds, asynchronous deployment history, rollback operations, deployment-scoped configuration, Host-owned runtime status, and non-blocking eager App restoration during Hub startup.
