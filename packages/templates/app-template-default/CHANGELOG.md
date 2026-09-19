# @nocobase/app-template-default

## 1.0.0-beta.35

### Patch Changes

- e9da3c2: Resolve installed official database drivers asynchronously from application configuration before provider registration or standalone database tasks. Configure only the needed dialects and install their optional peer packages in application dependencies. Preserve explicit driver registrations and synchronous core manager APIs; direct core consumers continue to register drivers explicitly. Standard development and test loaders require no synchronous ESM compatibility configuration.
- Updated dependencies [c84bfe8]
- Updated dependencies [e9da3c2]
- Updated dependencies [9628cdd]
- Updated dependencies [7542686]
  - @nocobase/db@1.0.0-beta.11
  - @nocobase/app-server@1.0.0-beta.20
  - @nocobase/app-plugin-workflow@0.1.0-beta.20
  - @nocobase/app-plugin-scheduler@0.1.0-beta.2
  - @nocobase/app-plugin-authorization@0.2.0-beta.14

## 1.0.0-beta.34

### Minor Changes

- e13ed84: Unify application directory fields and path helpers in AppPaths, shared by configuration factories, runtime and Application. Replace ConfigPaths and runtime.configPaths with AppPaths and runtime.paths, and construct applications through createAppFromRuntime so Host logging policy and the runtime application reference are wired consistently.

  Standalone applications declare their deployment root separately from their code root. Configuration and default persistent storage use that deployment root in both source and compiled execution. Explicit storage paths take precedence over HUB_STORAGE_DIR, and embedded applications retain Host-provided volumes.

  Standardize Hub storage and expanded releases on the hub, host and apps layout, remove legacy layout detection and offline storage migration commands, and replace appDeploymentsDir with appRevisionsDir. Expanded releases use appRevisionsDir/<appId>/<sha256>; standalone discovery records the selected revision. Consumers must update removed path and storage APIs and configure existing data locations explicitly before adopting this release. Rebuild application artifacts with the updated runtime and templates.

### Patch Changes

- a255f91: Use the Compact theme by default across application templates while preserving configured defaults and saved browser preferences. Label the other theme Spacious instead of Default to avoid confusing its name with the default selection. Update theme development guidance.
- e55b17d: Add localized header tooltips for component examples and settings, plus the Examples notification entry, and open appearance and account panels immediately on hover using the built-in shadcn behavior. Preserve click, touch, keyboard, and default dismissal behavior; close the account menu when selecting a language.
- 00362cf: Report a reused Hub deployment honestly. A repeated `app deploy` for the same Release and configuration is answered from the earlier idempotent request, so the Hub now returns `reused` and the deployment's `createdAt` with the accepted operation, and the CLI reports that field and warns that nothing was deployed now instead of printing the same success line as a new deployment. Existing retries keep their exit code; only the output changes.
- e13ed84: Organize Hub storage by ownership, add explicit managed revision and log directories, retain legacy layouts, and provide an offline migration preview and copy workflow. Keep standalone Hub data outside build output and place template build archives under storage/exports with matching publishing defaults.
- e13ed84: Wait for artifact upload streams to close before publishing returns, preventing unhandled file errors when a Hub response or network failure arrives before the upload body is consumed.
- 8607909: Update agent-annotations to 0.1.9 so the development annotation toolbar remembers its collapsed or expanded state across page reloads.
- e13ed84: Make development logs concise and application-scoped while retaining structured file diagnostics. Route configuration and authentication diagnostics through application logging, reduce routine startup and request noise, distinguish optional AI Skill directories from missing configured paths, and align development console settings across templates. Document that deployed applications need rebuilding to adopt the current logging protocol.
- 64733b6: Clarify that useRouteOverlay must run in a descendant of the intended overlay, with complete usage examples and guidance on avoiding the parent context in nested overlays.
- e13ed84: Persist per-deployment phase and failure logs and expose application runtime logs in Hub with scoped access, incremental reading, retention, and independent file and console outputs.

  Unify runtime logging configuration and source routing, merge default outputs into app files, connect workflow diagnostics with execution identities, and preserve legacy configuration and historical log readability.

  Enforce hosted capture policy, declare the Host server runtime peer, merge paged source logs chronologically with bounded opaque cursors, and preserve correlation and error details when truncating oversized records. Handle expired scans explicitly in the Hub viewer and downloads.

  Route HTTP request logs to separate request files by default in all application templates.

- Updated dependencies [e0c4b3d]
- Updated dependencies [e13ed84]
- Updated dependencies [78e3c42]
- Updated dependencies [5f92529]
- Updated dependencies [e13ed84]
- Updated dependencies [e13ed84]
- Updated dependencies [00362cf]
- Updated dependencies [9e3bbee]
- Updated dependencies [e13ed84]
- Updated dependencies [e13ed84]
- Updated dependencies [25cf9f6]
- Updated dependencies [49a7890]
  - @nocobase/app-plugin-scheduler@0.1.0-beta.1
  - @nocobase/queue@0.1.0-beta.6
  - @nocobase/db@1.0.0-beta.10
  - @nocobase/app-server@1.0.0-beta.19
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.14
  - @nocobase/app-plugin-file@0.1.0-beta.14
  - @nocobase/app-plugin-workflow@0.1.0-beta.19
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.16
  - @nocobase/app-plugin-authentication@0.1.0-beta.18
  - @nocobase/app-plugin-notification@0.1.0-beta.12
  - @nocobase/app-plugin-install@0.1.0-beta.9

## 1.0.0-beta.33

### Minor Changes

- 60fa139: Add streamed, checksum-verified Hub release uploads, persistent upload and deployment retry identities, explicit upload-and-deploy requests, and App CLI upload/deploy commands. Reuse existing upload-release and deploy authorization actions and expose minimal deployment status for CI. Preserve historical releases during canonical checksum migration. Normalize permissions returned by the generic API key service.

  Support optional runtime configuration files for deploy and upload-with-deploy, with bounded streaming transport, existing configuration reuse, and configuration-aware retry checks.

  Reject upload-and-deploy requests that cannot return a publishing deployment, including CLI calls without waiting. Correct the unmerged publishing migration rollback.

### Patch Changes

- 60fa139: Check the status of reused upload-and-deploy operations even without waiting. Report failed or cancelled deployments as failures and unconfirmed results as unknown, while preserving asynchronous acceptance for pending operations.
- 365a9fe: Complete English and Chinese translations for authentication, route feedback, authorization, shared controls, File and Notification Registry components, and development examples. Use concise semantic keys consistently for the new translations. Resolve AI Registry copy from the active language and localize development navigation and section headings. Translate MCP configuration guidance, tool drawer labels, and transport descriptions.
- 60fa139: Include upload and deploy package scripts that forward arguments to the existing Hub publishing CLI, and document their usage from the application root.
- 365a9fe: Translate application shell copy, settings and development empty states, return links, and header action labels using the application locale and its configured fallback chain.
- 60fa139: Validate Hub publishing response envelopes, release and deployment IDs, and deployment statuses. Report malformed success responses and unknown statuses as unconfirmed outcomes with exit code 3, including when waiting is disabled.
- 60fa139: Read Hub publishing defaults from the App root .env for upload and deploy commands, with command flags and process environment taking precedence. Ignore local credentials in version control.
- f5b066d: Include the tests directory in the published application templates.
- 60fa139: Reject configured upload retries that omit the original deployment configuration and report known failed or cancelled deployment retries as CLI failures even without --wait.
- 60fa139: Remove the ambiguous app publish alias. Use app upload to upload releases and app deploy to deploy existing releases; update CLI guidance accordingly.
- 26ac480: Add code-defined Cron scheduling with timezone support, transactional synchronization, and stable schedule identities. Applications and plugins register schedules with `SchedulerService.defineSchedule(definition)` and execution targets with `registerTarget()` during provider registration or boot.

  Route scheduled jobs and workers through the application's configured logical queue, with an adapter-neutral schedule store. Keep the upstream queue dependency unmodified and store queue and scheduler timestamps compatibly with their adapters while preserving absolute instants.

  Move queue storage migrations from Scheduler into the queue library, which resolves configured database connections and physical tables. Assemble these sources centrally in app-server for startup and CLI commands, rejecting overlapping active queue tables before execution. Support immutable target parameters, shared migration history and locks, upstream-compatible physical schemas, and read-only execution conditions that leave skipped migrations unapplied.

  Track idempotent occurrences through the target's final outcome, including asynchronous Workflow completion and recovery with stable run references. Target registration returns a completion-reporting handle scoped to that target; long-running executions can report completion without a fixed scheduler observation timeout.

  Provide an authorized, read-only schedule management page and API with paginated schedules, trigger counts, execution history, and separate schedule and execution statuses. Register `pnpm nocobase schedule sync` as a global CLI command and integrate it into all application templates.

  Include application examples for custom task targets and scheduled Workflows, and agent guidance for schedule definition, target selection, asynchronous execution, diagnostics, and recovery.

  Keep the database manifest CLI entry available before compilation so fresh workspace installs link the command required by package builds.

  Declare the OpenTelemetry dependencies referenced by the upstream queue declarations so consumers can typecheck published Server APIs without enabling tracing or skipping library checks.

- 60fa139: Wait for the final deployment result by default in app deploy and app upload --deploy. Support --no-wait for asynchronous acceptance, preserve explicit --wait compatibility, and keep upload-only commands independent of deployment polling.
- Updated dependencies [d4ca00e]
- Updated dependencies [365a9fe]
- Updated dependencies [365a9fe]
- Updated dependencies [ec93611]
- Updated dependencies [60fa139]
- Updated dependencies [21d3ed4]
- Updated dependencies [24e771f]
- Updated dependencies [60fa139]
- Updated dependencies [26ac480]
- Updated dependencies [365a9fe]
- Updated dependencies [d4ca00e]
- Updated dependencies [60fa139]
- Updated dependencies [60fa139]
- Updated dependencies [d4ca00e]
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.13
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.15
  - @nocobase/app-plugin-api-keys@0.1.0-beta.3
  - @nocobase/app-plugin-authorization@0.2.0-beta.13
  - @nocobase/app-plugin-file@0.1.0-beta.13
  - @nocobase/app-plugin-notification@0.1.0-beta.11
  - @nocobase/app-plugin-users@0.0.2-beta.5
  - @nocobase/app-plugin-authentication@0.1.0-beta.17
  - @nocobase/app-plugin-i18n@0.1.0-beta.8
  - @nocobase/db@1.0.0-beta.9
  - @nocobase/app-plugin-scheduler@0.1.0-beta.0
  - @nocobase/queue@0.1.0-beta.5
  - @nocobase/app-server@1.0.0-beta.18
  - @nocobase/app-plugin-workflow@0.1.0-beta.18
  - @nocobase/app-plugin-database-explorer@0.1.0-beta.3

## 1.0.0-beta.32

### Patch Changes

- 4349a40: Preserve navigation group expansion when switching pages in the application, Settings, and Dev tools.
- d86f6aa: Synchronize agent skills from direct NocoBase package dependencies with the new skills:sync command while preserving plugin:skills:sync compatibility, and share application development and upgrade skills through @nocobase/app-skills across all application templates.

  Add package:remove to uninstall a NocoBase dependency and clean up its synchronized skills and ownership records, reusing plugin unregistration for plugin packages. Document the removal workflow in application templates and the shared development and upgrade skills.

- 028dd7c: Use host-provided peers for shared database types, authorization errors, service tokens, cache registries, and repository filter metadata. Declare their production providers in all application templates so deployments with automatic peer installation disabled retain the required runtime packages. Document the provider contract for generated plugins.

  Existing applications upgrading these packages must add compatible versions of their required shared peers to production dependencies: @nocobase/db, @nocobase/service-provider, @nocobase/repository-input, @nocobase/authorization, @nocobase/caching, @nocobase/i18n, and @nocobase/queue for the standard server stack, plus @nocobase/ai-employee when using its plugin. Update the lockfile and verify the production install; peer declarations do not remove incompatible historical versions automatically.

- Updated dependencies [d86f6aa]
- Updated dependencies [028dd7c]
  - @nocobase/nb3-cli@1.0.0-beta.8
  - @nocobase/ai-employee@0.2.0-beta.6
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.14
  - @nocobase/app-plugin-authentication@0.1.0-beta.16
  - @nocobase/app-plugin-authorization@0.2.0-beta.12
  - @nocobase/app-plugin-users@0.0.2-beta.4
  - @nocobase/app-server@1.0.0-beta.17
  - @nocobase/authorization@0.1.0-beta.7
  - @nocobase/db@1.0.0-beta.8
  - @nocobase/queue@0.1.0-beta.4

## 1.0.0-beta.31

### Patch Changes

- 1fea79a: Refresh permission snapshots, navigation, and route guards when sessions or permissions change, and discard obsolete permission responses without requiring a browser reload. Support explicit type:id domain resources in client access checks without rewriting their actions.
- 1fea79a: Show localized sign-out errors instead of silently refreshing an active session after an API or network failure.
- Updated dependencies [415d763]
- Updated dependencies [1fea79a]
  - @nocobase/app-server@1.0.0-beta.16
  - @nocobase/app-plugin-authorization@0.2.0-beta.11

## 1.0.0-beta.30

### Patch Changes

- 489d08a: Read settings navigation from the existing application runtime and remove the redundant settings route context from template headers.
- 9b6c645: Add the PageContainer component from the Examples template to the Default and Hub templates.

  Require PageContainer when writing page components in all three application development Skills, and align page and child-route examples with the shared container.

- Updated dependencies [9131230]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.13
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.12

## 1.0.0-beta.29

### Patch Changes

- d927494: Align shared application tooling and dependency declarations with Default while preserving Examples demonstrations and Hub management features. Remove duplicate and unused dependencies, correct repository metadata, and remove obsolete global OpenSSL options from Examples.

  Add Default's Users role scope, permission seed, and complete API Keys authentication integration to Examples. Remove unused workflow, notification, and heartbeat configuration and demonstration routes from Hub. Provide an explicit Playwright entry for the optional AI server test in Default and Examples, using the current API and a real test user's API key.

  Restore the shared Settings surface in Hub so its registered API Keys page is reachable for authorized users. Show the Settings entry only when an accessible navigation page exists across all three templates, correct stale template development and upgrade guidance, and resolve test dependencies through public package exports instead of monorepo-only source paths.

- f5b066d: Increase the compact theme's base corner radius from 0.25rem to 0.375rem for softer corners on controls and containers.
- 89955c5: Upgrade better-sqlite3 to ^13.0.3 and keep its dependency declaration in @nocobase/db-sqlite only. Remove redundant test dependencies from consumers so they use the same SQLite driver as applications.

  Preserve the bundled musl binary when building applications for Alpine Linux.

- 92c355f: Add build command help that exits before loading build dependencies or changing deployment artifacts. Record deployment target metadata even when no native modules are present, detect musl for current-machine Linux builds, and document the platform and Node fields available for deployment checks.
- Updated dependencies [6acf3bc]
- Updated dependencies [d927494]
- Updated dependencies [6acf3bc]
- Updated dependencies [89955c5]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.12
  - @nocobase/app-plugin-database-explorer@0.1.0-beta.2
  - @nocobase/app-plugin-users@0.0.2-beta.3
  - @nocobase/app-plugin-api-keys@0.1.0-beta.2
  - @nocobase/app-plugin-workflow@0.1.0-beta.17
  - @nocobase/app-plugin-notification@0.1.0-beta.10
  - @nocobase/db-sqlite@0.1.0-beta.2
  - @nocobase/app-plugin-authentication@0.1.0-beta.15
  - @nocobase/app-plugin-file@0.1.0-beta.12

## 1.0.0-beta.28

### Patch Changes

- d3429aa: Deduplicate dependencies during template upgrades and resolve stale dependency type conflicts. Replace outdated migration documents with upgrade Skill guidance based on template differences and application state, preserving migration history and user-authored operational notes. Check application code and configuration before proposing plugin removal, and obtain user confirmation before removing unused dependencies and registrations.
- Updated dependencies [11c276a]
- Updated dependencies [7c0ec03]
- Updated dependencies [7c0ec03]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.11
  - @nocobase/app-plugin-workflow@0.1.0-beta.16

## 1.0.0-beta.27

### Minor Changes

- 1a85a86: Add route breadcrumbs, nested child pages, and reusable page headers to the client and application templates.

### Patch Changes

- 63db898: Reorganize application database guidance around complete configuration factory examples. Clarify YAML overrides and SQLite paths, managed and external connections, default database selection, and verification that distinguishes reads from migrations. Keep driver installation and type inference details in troubleshooting guidance.
- 63db898: Exclude the application's complete build output from Vite file watching to prevent EMFILE errors after a build, while preserving hot updates for linked workspace dependencies.

  Check native file watching before development startup, fall back to polling with agent annotations disabled when native watchers are unavailable, and poll application configuration files so watcher resource errors no longer crash the development process.

- 63db898: Add `defineAppDatabaseConfig` to infer connection types from the drivers returned by a runtime configuration callback. Application templates now directly export this helper without explicit factory annotations, driver type maps, or `satisfies` clauses. Keep declaration emission but use full TypeScript inference for application server builds; library packages retain isolated declaration checking.
- a60decd: Require an explicit absolute baseDir for Server plugins and resolve migrations, seeds, jobs, and package metadata from the loaded plugin copy. Generate and validate database task manifests during builds so TypeScript and JavaScript share source checksums, with verified legacy JavaScript history conversion and synchronized plugin scaffolding and application templates.
- 63db898: Add a `database connections` reference to the application development Skill, covering how to switch the database and add a connection.

  Nothing documented this. `database-and-data.md` states in its first line that it is about reading and writing rows at runtime, and `migrations.md` covers per-connection migrations without saying how a connection comes to exist — so of the eight dialects the runtime supports, only SQLite was reachable from the documentation.

  The new page covers why a dialect is registered in `server/config/database.ts` rather than configured in `config.yml`, the four steps to switch the default connection, a table of every dialect with its package, native driver, default port and connection fields, which drivers install a native binary and which do not, and the fact that switching does not carry data across. It is routed from `SKILL.md` and `AGENTS.md` in each template.

  It also shows how to configure `kingbase`, `oceanbase` and `dameng`, whose connection shapes `@nocobase/db` does not declare, by naming them on `AppDatabaseConfig`.

- e067113: Depend on one zod major, so a deployment can resolve better-auth

  An application that installed both the AI employee plugin and the API keys plugin failed to start with `z.ipv4 is not a function`, thrown while loading `@better-auth/core`. Nothing in better-auth was wrong: the AI employee packages asked for `zod: ^3` while better-auth asks for `^4`, and a deployment installs `dist/` with `nodeLinker: hoisted`, where one version of a package takes the root slot and the rest are nested underneath whoever depends on them. zod 3 won the root, which forced better-auth's whole subtree to be nested, and a `@better-auth/core` that ended up next to the root zod bound to the wrong major.

  The same collision has a second failure mode that is harder to read. `@better-auth/api-key` declares `@better-auth/core`, `better-call`, `jose`, `kysely` and `nanostores` as peer dependencies, and a deployment sets `autoInstallPeers: false` so it installs none of them. It works anyway when better-auth's dependencies hoist to the root, because the peers are then sitting where the resolver looks; it stops working the moment the zod conflict pushes them down into `node_modules/better-auth/node_modules`, and the application fails with `Cannot find package '@better-auth/core'`.

  So the fix is not to declare better-auth's internals somewhere. `@nocobase/ai-employee` never imported zod at all and no longer declares it, `@nocobase/app-plugin-ai-employee` moves to zod 4, and all three templates and the plugin now take it from the `zod` catalog entry, so one version is what an application gets. Its schemas use `z.object`, `z.string`, `z.number`, `z.array`, `z.record`, `z.coerce`, `z.any` and `z.unknown`, all of which carry over unchanged; `buildStandardAgentMiddleware` gained an explicit `AgentMiddleware[]` return type, which the new resolution made necessary.

  A deployment tree now holds a single `zod` and a single `@better-auth/core`, hoisted to the root where `@better-auth/api-key` resolves them.

- Updated dependencies [1c70f60]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [a60decd]
- Updated dependencies [1a85a86]
- Updated dependencies [1c70f60]
- Updated dependencies [63db898]
- Updated dependencies [e067113]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.10
  - @nocobase/app-server@1.0.0-beta.15
  - @nocobase/db@1.0.0-beta.7
  - @nocobase/db-sqlite@0.1.0-beta.1
  - @nocobase/app-plugin-notification@0.1.0-beta.9
  - @nocobase/app-plugin-workflow@0.1.0-beta.15
  - @nocobase/app-plugin-api-keys@0.1.0-beta.1
  - @nocobase/app-plugin-authentication@0.1.0-beta.14
  - @nocobase/app-plugin-authorization@0.2.0-beta.10
  - @nocobase/app-plugin-database-explorer@0.1.0-beta.1
  - @nocobase/app-plugin-file@0.1.0-beta.11
  - @nocobase/app-plugin-i18n@0.1.0-beta.7
  - @nocobase/app-plugin-install@0.1.0-beta.8
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.11
  - @nocobase/app-plugin-notification-providers@0.2.0-beta.6
  - @nocobase/app-plugin-users@0.0.2-beta.2

## 1.0.0-beta.26

### Patch Changes

- c258b92: Declare `auth.secret` and `session.secret` as live keys in `config.example.yml` rather than commented-out placeholders, and describe how a generated application's `config.yml` and database now come about.

  `@nocobase/create-app` generates `config.yml` from this file and fills the two secrets in. Leaving them commented meant the generator had to uncomment them, which made the exact comment syntax of this file part of its contract; a live key with a placeholder value is a target it can simply replace.

  The other way this file is used — copying it to `config.yml` by hand — is covered separately: the placeholder is a non-empty string that would otherwise pass for a configured secret, so the runtime now refuses it by name and says how to generate a replacement.

  The generator no longer asks which database to use, so "Review your configuration" in each README no longer says `config.yml` carries the database you chose. An application starts on SQLite, and another database means registering its dialect in `server/config/database.ts` and adding the matching `@nocobase/db-*` package — drivers are code rather than settings, and a dialect the application does not register cannot be introduced from `config.yml`.

  The Hub's upgrade skill no longer describes `app-dist/`, which the generator stopped creating and nothing reads.

- Updated dependencies [c258b92]
  - @nocobase/app-server@1.0.0-beta.14
  - @nocobase/app-plugin-authentication@0.1.0-beta.13

## 1.0.0-beta.25

### Minor Changes

- 154e09e: Register `@nocobase/app-plugin-api-keys` so an application generated from either template can issue API keys out of the box.

  Both halves are wired: the server plugin for the `apikey` table and the Settings page in the client plugin list, plus `apiKey()` in `server/config/auth.ts` and `apiKeyClient()` in `client/config/auth.ts`. Registering only one half is the failure worth knowing about — the plugin list alone creates the table and mounts no endpoints, and the auth config alone mounts endpoints against a table that does not exist.

  The page declares `page:api-keys/access`. Keys are self-service and every endpoint acts only on the caller's own, so an application normally grants it to all authenticated users.

### Patch Changes

- c01baf6: Resolve application namespace aliases in React translations, synchronize the document language at startup and on changes, and inject the configured default language into served HTML. Allow client-only language selections with an English server fallback and an informational toast, and standardize documented locale checks on `pnpm nocobase app i18n:check`.
- Updated dependencies [154e09e]
- Updated dependencies [154e09e]
- Updated dependencies [154e09e]
- Updated dependencies [154e09e]
- Updated dependencies [154e09e]
- Updated dependencies [c01baf6]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.9
  - @nocobase/app-plugin-api-keys@0.1.0-beta.0
  - @nocobase/app-plugin-authentication@0.1.0-beta.12
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.10
  - @nocobase/app-server@1.0.0-beta.13
  - @nocobase/app-plugin-i18n@0.1.0-beta.6

## 1.0.0-beta.24

### Minor Changes

- 1d5ee9a: Add `pnpm collections:generate` for writing and checking Collection artifacts

  `pnpm nocobase app collections generate` reads every Collection of a managed connection and writes `collection.json`, `metadata.json` and `schema.json` under `database/<connection>/collections/<name>/`, plus a `_manifest.json` per connection recording the dialect, whether the schema is managed or external, and the last applied migration. `--connection` targets one connection, `--all` every configured one including external connections, and `--check` compares the result with the files on disk and exits non-zero on any difference without writing, which is what a CI step runs.

  The command is a thin entry over `generateAppCollectionsArtifact()` from `@nocobase/app-server`; the files are derived output for developers, documentation and AI tooling, and nothing reads them back at runtime. `AGENTS.md` and the README describe the directory.

### Patch Changes

- a153ad8: Add a read-only Database Explorer plugin and enable it in the Default and Examples templates.

  The Settings page browses the application's database connections, the collections on each one, and their fields and physical columns. The two detail panes are child routes and the selection rides in the query string, so any view can be linked to and is restored by browser Back.

  Read-only means the plugin creates, alters or drops no collection and changes no row. One qualifier: reading a collection initializes the collection registry, whose metadata store creates `__nocobase_collection_metadata` on a managed connection when it is missing, so that one bookkeeping table is the only object a read can bring into existence — and only when the first NocoBase activity against a database is an Explorer read. External connections cannot reach that path. A test states this boundary against a real database rather than assuming it.

  Listing connections reads configuration and opens no database, so one unreachable external connection cannot take down the page. A connection reports its dialect, schema management, logical database, schemas, naming options, and internal tables, and never its credentials, host, port, socket path, or SQLite file — enforced as an allow-list, so a field a new dialect introduces stays inside by default. Driver errors are withheld from responses and recorded in logs by classification only, never by message or cause.

  The collections list follows the server's cursor to the end so its client-side search sees every collection, and says so when a connection exceeds the bound.

  Every endpoint requires `page:database-explorer/access`, the grant the page and both of its panes declare, which the seeded System Administrator permission set covers.

- 22d0d2a: Resolve client chunk URLs at run time so a built application works wherever it is mounted.

  Vite bakes `base` into the bundle at build time, while an App Host mounts a deployed application under its own App ID. A build made for `/main` and deployed as `/crm` therefore asked for `/main/assets/<chunk>.js` and got a 404 for every chunk the browser had to fetch at run time, which is every lazily imported route: the application loaded, its shell rendered, and each lazy page failed with "Route … could not be loaded". Pages whose chunks `index.html` preloads kept working, so the failure looked like it belonged to a particular plugin rather than to the deployment.

  Only the URLs emitted into JavaScript become runtime-relative, resolved against `import.meta.url`; every chunk sits beside the entry chunk, so this is correct at any mount path. The URLs in `index.html` stay absolute: the document is served at arbitrary SPA route depths where a relative URL would resolve against the current route, and the Host rewrites those root-relative attributes to the mount path, which it can only do while they start with `/`.

  Applications generated from these templates need to rebuild to pick this up. No configuration changes, and a build deployed at the path it was built for behaves as before.

- 73f7538: Resolve a Portal build's asset URLs from the runtime base path so a build keeps working when a host mounts it under a different prefix. Vite inlined the build-time `base` into its `__vitePreload` helper, and that helper awaits every stylesheet link it inserts, so a lazy chunk carrying its own CSS rejected its dynamic import and rendered the route's error state once the application was served from somewhere other than the prefix it was built for.

  The templates each carried their own copy of this fix, added before it existed in the shared configuration. They now inherit it from `createPortalViteConfig` instead. A consumer that configures `experimental.renderBuiltUrl` itself still overrides the shared one, so nothing that needs its own strategy loses it — the templates simply no longer need one.

- Updated dependencies [be92e2b]
- Updated dependencies [6d43421]
- Updated dependencies [1d5ee9a]
- Updated dependencies [1d5ee9a]
- Updated dependencies [a153ad8]
- Updated dependencies [1d5ee9a]
- Updated dependencies [211538b]
- Updated dependencies [1d5ee9a]
- Updated dependencies [1d5ee9a]
- Updated dependencies [6d43421]
- Updated dependencies [6d43421]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.7
  - @nocobase/app-server@1.0.0-beta.12
  - @nocobase/app-plugin-database-explorer@0.1.0-beta.0
  - @nocobase/db@1.0.0-beta.6

## 1.0.0-beta.23

### Minor Changes

- 0f80d52: Support PROXY_TARGET_URL during development to run the local Vite client against another application's API and WebSocket service, including browser origin handling for authentication, without starting a local backend.
- 3bb34a3: Add RouteDialog and RouteDrawer with guarded closing and a shared useRouteOverlay hook. The wrappers insert no child outlet: the page that owns a child route places one itself, so an overlay can render its next child wherever the page needs it. Include route overlay examples and application development guidance.

### Patch Changes

- ceb356b: Declare database dialect drivers on the application's own database config.

  An application lists the dialect packages it installs under `database.drivers`,
  next to the connections that use them, and the runtime, the CLI commands and the
  tests all resolve a dialect from that one place. The app-server runtime stays
  independent of every concrete database driver.

  This replaces the process-wide `registerAppDatabaseDrivers` registry and the
  `databaseDrivers` option on `Application`, both of which are removed. An
  application that used either one moves its drivers into `database.drivers` and
  drops the module it imported only for the registration side effect.

- f17f3a6: Provide editable TypeScript defaults for application modules, assembled by the runtime before services start. Module factories receive the runtime with application paths and plugin metadata; deployment files and environment variables override defaults, and configuration reload preserves code defaults.

  Keep deployment settings in YAML examples and reserve explicit environment overrides for secrets and startup integration. Simplify application configuration loading, merging and reload subscriptions.

  Align client configuration assembly with the server: runtime merges application TypeScript defaults beneath public configuration before services start. Client inspection reports the application configuration entry.

- f17f3a6: Move the password authentication pages to the application. The authentication plugin keeps only the protocol, session state, guards and headless actions: it no longer declares `/login`, `/register`, `/forgot-password` or `/reset-password`, drops the `client/routes` and `client/route-contracts` entries, and removes the `loginPage`/`registerPage` route override options.

  Each application template now declares those four guest routes in `client/routes.ts` and loads the application-owned pages from `client/pages/auth/`, which compose the preinstalled UI from `client/extensions/nocobase-auth-ui/`. The pages use ordinary relative links; URL handling remains with the application router and basename.

- f17f3a6: Support TypeScript authentication options in application templates and use the native authentication client. Keep authentication plugins and callbacks in editable server and client configuration, with YAML as the default format for deployment settings.

  Runtime assembly now prepares complete configuration before application creation. Module configuration factories use defineAppConfig and defaultAppConfigs, receive the runtime once, and retain their defaults when environment configuration reloads.

- ceb356b: Supply plugin migration and seed sources to database planning directly instead
  of through the database configuration.

  `AppDatabaseConfig.taskSources` is removed. It held the application's package
  name and the migration and seed directories contributed by registered server
  plugins — values the runtime derives from resolved plugins rather than values
  anyone configures. Carrying them in the `database` namespace put them where a
  `config.yml` deep-merges: `database.taskSources.migrations: []` silently
  dropped every plugin's migrations, and the application still started.

  They now travel as an `AppDatabaseTaskContributions` value alongside the
  configuration. `planAppDatabaseTasks`, `runAppDatabaseTasks`, `runAppMigrations`
  and `runAppSeeds` take an options object carrying it, with `paths`, `drivers`
  and the task selection, in place of their positional parameters.
  `createAppPluginDatabaseConfig` and `resolveAppPluginDatabaseConfig` are
  replaced by `createAppDatabaseTaskContributions`, which maps resolved plugins to
  that value. `contributions` is required, so a call site that has not been
  updated fails to compile rather than quietly planning without its plugins.

  An application's `server/config/database.ts` keeps only what it configures —
  drivers and connections — and no longer calls into the plugin resolver. Its
  `cli/database-command.ts` builds the contributions from the runtime it already
  resolves; `cli/commands/migrate.ts` and `cli/commands/seed.ts` are unchanged.

- d566dde: Fix the AI employee custom Skill menu and include App-root custom Skills for verification.
- e11b855: Locate a built application's `config.yml` next to `dist/` when none exists inside it, build the client against the same `.env` files the server loads, and prefer the compiled dependency tree when resolving plugins from a production build.
- ceb356b: Add the destructive `pnpm migrate --fresh --force` workflow for managed
  connections. It clears dialect-owned schema objects, reruns visible migrations,
  requires confirmation in interactive terminals, and rejects external
  connections.
- bf0f05b: Replace the `plugin update --plugin` flag with an optional plugin name argument, supporting full package names and short names while preserving updates of all registered plugins when no name is supplied.

  Document the positional plugin update command, version-range behavior, and Skills synchronization in all three application templates' README, agent guidelines, and development Skill.

- f718a90: Honor APP_SERVER_PORT as the local Vite port during remote-backend development while retaining local backend port configuration in normal development.
- f5b066d: Keep header navigation entries visible on their destination pages while retaining the development-only Dev tools entry.
- e11b855: Use consistent medium-weight typography for sidebar navigation items, so an item's weight no longer changes as the selection moves.
- Updated dependencies [d566dde]
- Updated dependencies [c8f8a93]
- Updated dependencies [d566dde]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [f17f3a6]
- Updated dependencies [f17f3a6]
- Updated dependencies [f17f3a6]
- Updated dependencies [43d25b4]
- Updated dependencies [027d13d]
- Updated dependencies [c8f8a93]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c8f8a93]
- Updated dependencies [027d13d]
- Updated dependencies [027d13d]
- Updated dependencies [40e2d49]
- Updated dependencies [c8f8a93]
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
- Updated dependencies [22b9672]
- Updated dependencies [5e17578]
- Updated dependencies [28132fd]
- Updated dependencies [d566dde]
- Updated dependencies [28132fd]
- Updated dependencies [e11b855]
- Updated dependencies [ceb356b]
- Updated dependencies [e11b855]
- Updated dependencies [c8f8a93]
- Updated dependencies [ceb356b]
- Updated dependencies [c8f8a93]
- Updated dependencies [40e2d49]
- Updated dependencies [e11b855]
- Updated dependencies [c8f8a93]
- Updated dependencies [590861e]
- Updated dependencies [35f9722]
- Updated dependencies [ceb356b]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [bf0f05b]
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
- Updated dependencies [c8f8a93]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [027d13d]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [c960d07]
- Updated dependencies [c8f8a93]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c8f8a93]
- Updated dependencies [c8f8a93]
- Updated dependencies [ceb356b]
- Updated dependencies [c8f8a93]
- Updated dependencies [ceb356b]
- Updated dependencies [027d13d]
- Updated dependencies [0867612]
- Updated dependencies [027d13d]
- Updated dependencies [72ed008]
- Updated dependencies [027d13d]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.6
  - @nocobase/db-sqlite@0.1.0-beta.0
  - @nocobase/app-server@1.0.0-beta.11
  - @nocobase/app-plugin-notification@0.1.0-beta.8
  - @nocobase/app-plugin-workflow@0.1.0-beta.14
  - @nocobase/app-plugin-authentication@0.1.0-beta.11
  - @nocobase/config@0.1.0-beta.1
  - @nocobase/app-plugin-install@0.1.0-beta.7
  - @nocobase/db@1.0.0-beta.5
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.9
  - @nocobase/app-plugin-file@0.1.0-beta.10
  - @nocobase/nb3-cli@1.0.0-beta.7
  - @nocobase/app-plugin-users@0.0.2-beta.1

## 1.0.0-beta.22

### Minor Changes

- a009e2d: Derive the languages an application offers from its own locale files, and configure the default language in one place.

  `i18n.defaultLocale` in `config.yml` now names the language the application starts in, for the browser and the server alike. The `i18n.locales` setting and its `APP_LOCALES` environment variable are removed, along with `client.app.defaultLocale`: an application offers whichever languages its own `client/locales/index.ts` and `server/locales/index.ts` declare loaders for, so adding a language means adding its file rather than editing a second list. A plugin's locale file supplies translations for those languages and no longer adds one, which keeps an installed plugin from putting an unexpected language in the picker.

  The browser resolves its startup language as the visitor's stored choice, then `i18n.defaultLocale`, then `en-US`. `navigator.language` is no longer consulted. Switching language in the interface remains a user-level choice and does not change the configured default.

  An untranslated key now falls back through `i18n.defaultLocale` and then `en-US`, rather than through the default alone. An application that defaults to Chinese and adds Spanish leaves its plugins translated in neither, and English is the language they are most likely to ship; the fallback languages are loaded alongside the one in use so the fallback has resources to read. `pnpm nocobase app i18n:check` reports a language declared in `client/locales/` but not `server/locales/`, or the reverse — the case where the interface offers a language the server then rejects.

  `LocaleResource` and `PartialLocaleResource` now accept an `overrides` block at the top level. The shape is derived from the source locale, which never declares that key, so annotating a locale file with it and adding the block documented for rewording a plugin's copy was a compile error — the documented example did not compile.

  To migrate, replace `i18n.locales` and `client.app.defaultLocale` with `i18n.defaultLocale`, and make sure every language the application offers has a file in its own `client/locales/` and `server/locales/`.

- e9f796d: Run plugin-registered commands during `pnpm build` and `pnpm dev`

  Both scripts now ask the application's CLI which commands its plugins have registered, and run them at the matching stage. The workflow Artifact build was written directly into these scripts and moves to the workflow plugin, which is what installs it; an application without that plugin no longer carries the step, and a plugin that needs one no longer requires an edit here.

  Failing to read the list fails the run: a build that silently skipped a hook would look successful while missing whatever the hook produces. Declaring no hooks is not that case and changes nothing.

### Patch Changes

- b90a65f: Keep the sidebar at viewport height

  On a tall page the desktop sidebar used to stretch along with the document, because it was a stretched flex item of a `min-h-svh` shell. Its navigation therefore never scrolled: the whole page moved instead, and the sidebar's header and footer drifted out of view. The sidebar now sticks to the viewport at a fixed height, and the menu scrolls inside it once its entries overflow. The same fix applies to the settings and dev-tools surface, which shares the layout.

- 426bd48: Remove logical IM `target` recipients and make `send().to` optional so Webhook Providers can be selected directly by Provider name or fan-out strategy.
- 1d59a9c: Add a template upgrade Skill and record the source template in the generated manifest.

  `skills/nocobase-app-upgrade/` describes how to merge a newer template release into an application generated from a template. It compares the two template releases to learn what changed, then decides file by file how each change lands in the application, so a customization is never reverted and a removal that breaks user code outside the changed files is caught before the upgrade is called done.

  `pnpm create @nocobase/app` now writes `nocobase.templatePackage` into the generated manifest, naming the template package the application came from. An upgrade needs it to know which template to diff: `name` becomes the application's own at generation, and `templateKind` does not distinguish the app templates from each other.

- Updated dependencies [adedf9c]
- Updated dependencies [a009e2d]
- Updated dependencies [e9f796d]
- Updated dependencies [426bd48]
- Updated dependencies [e9f796d]
- Updated dependencies [aa7420a]
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.8
  - @nocobase/app-plugin-i18n@0.1.0-beta.5
  - @nocobase/app-server@1.0.0-beta.10
  - @nocobase/app-plugin-workflow@0.1.0-beta.13
  - @nocobase/app-plugin-notification@0.1.0-beta.7
  - @nocobase/app-plugin-notification-providers@0.2.0-beta.5
  - @nocobase/nb3-cli@1.0.0-beta.6

## 1.0.0-beta.21

### Patch Changes

- f5b066d: Declare `@nocobase/db` and `@nocobase/service-provider` in `dependencies`, so a generated application can build its server

## 1.0.0-beta.20

### Minor Changes

- e3fa827: Add reusable user administration and Hub-scoped role-based authorization. Authentication now supports disabled accounts, transaction-aware administration, stable duplicate-identity conflicts, Session revocation, and immediate Realtime disconnects. Authorization supports protected Permission Sets, atomic scoped assignment replacement, and Client permission invalidation. The Users page supports protected role options, readable multi-role editing, explicit unassigned states, and a distinction between direct roles and authenticated-user defaults; password reset and database Session revocation share one transaction. The default App exposes its direct Authorization Permission Sets as application roles while keeping System administrator changes in Authorization. The Hub defines Administrator, Operator, and Viewer roles, batch-loads their user assignments, enforces every Hub and user-management action on the server, protects the final enabled Administrator, and hides unauthorized Client controls. Both templates register the reusable Users plugin; Hub exposes Applications, User management, and a read-only role matrix directly in its control-plane navigation, while the default App keeps Users in Settings. Only the Hub template receives Hub roles, disables public sign-up, and omits ordinary App Settings, workflows, notifications, and example plugins.
- c3e02bf: Support client.app.defaultLocale, defaultColorScheme, and defaultTheme configuration while preserving saved user preferences and ignoring unsupported defaults.
- 1d042c0: Support recursive page routes and navigation groups across App, Settings, and Dev. Render application menus from route navigation instead of Refine resources, preserve parent access checks, and migrate template and example navigation. Refine resources remain available for CRUD integration.

### Patch Changes

- f79ab75: Remove type declarations, third-party source maps, and third-party documentation from the deployment build, cutting the archive an application deploys from by roughly 30%
- f5b066d: Add `pnpm build --tar`, which packs the deployment build and `config.example.yml` into `storage/dist.tar.gz`
- 1d042c0: Only display navigation icons when explicitly configured.
- 741d0eb: Remove the commercial AI Knowledge Base plugin dependency and default runtime composition from the open-source application templates.
- 1d042c0: Reset page loading and error state when navigating to another route.
- 0a3fa83: Always show the notification test action, use user-facing delivery method labels, and enforce its permission only when a test message is submitted.
- f5b066d: Document `pnpm build --tar` in the template README
- 5a891d7: Replace the File plugin's legacy backend and client protocol with File Repository services, multipart uploads, and configurable content routes. Preserve its editable Registry components and adapt them to ClientFileRepository and contentUrl. Remove the separate File Repository package, rename its example to app-plugin-file-example, and update application registration and Agent integration guidance.

  This is a breaking replacement of the old File API: access-token routes, inventory settings, FilesClient, and runtime component exports are removed. Applications own file collections and route security; metadata deletion retains storage objects. The example migration remains unchanged.

  Keep the File core in Default and the core plus app-plugin-file-example in Examples. Preserve Hub without a default File registration.

  Require the unified API version for Registry components, preserve PDF previews across cross-origin storage redirects, and normalize database file sizes to safe numeric values without treating custom record or records fields as response envelopes.

- Updated dependencies [e3fa827]
- Updated dependencies [0a3fa83]
- Updated dependencies [0a3fa83]
- Updated dependencies [0a3fa83]
- Updated dependencies [eb3bc38]
- Updated dependencies [5a891d7]
  - @nocobase/app-server@1.0.0-beta.9
  - @nocobase/app-plugin-authentication@0.1.0-beta.10
  - @nocobase/app-plugin-authorization@0.2.0-beta.9
  - @nocobase/app-plugin-users@0.0.2-beta.0
  - @nocobase/app-plugin-notification@0.1.0-beta.6
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.7
  - @nocobase/app-plugin-notification-providers@0.2.0-beta.4
  - @nocobase/app-plugin-workflow@0.1.0-beta.12
  - @nocobase/app-plugin-file@0.1.0-beta.9

## 1.0.0-beta.19

### Minor Changes

- 52d1107: Keep client packages out of the server deployment, and make every native binary match the platform being deployed to.

  A plugin's `client/` is compiled by the consuming application's Vite build, so the packages it imports have to be published in the plugin's manifest — but a server has no client build and never requires them. Plugins now declare those as peer dependencies, and the generated `dist/pnpm-workspace.yaml` sets `autoInstallPeers: false`, so an application installs one shared copy while a deployment installs none. What reaches a server is decided by declarations rather than by analysis.

  Native binaries are compiled for one platform, architecture, C library, and Node ABI at once, so a build made on a Mac installs binaries a Linux server cannot load. `pnpm build` targets the machine it runs on, keeping `pnpm build && pnpm start` working; `--target linux-x64` (or `linux-arm64`, `linux-x64-musl`, `darwin-arm64`, `win32-x64`) and `--node-version` select another. Each build states the platform it produced and records it in `dist/package.json` under `nocobase.buildTarget`.

  The build then verifies its own result: it fails when a package the application's own server, database, or CLI code imports would not reach a deployment. It reads literal specifiers, so an import whose name is assembled at run time is invisible to it and has to be declared deliberately.

  Add `pnpm server:deps:retarget` and `pnpm server:deps:verify`, which run the two steps on their own.

### Patch Changes

- 52d1107: Declare the packages an application's server, database, and CLI code imports in `dependencies` rather than `devDependencies`, and generate `dist/package.json` from that declaration instead of by scanning the built output.

  The scan existed because the declaration did not: with every package in `devDependencies`, nothing could tell which of them a deployment needed, so the build walked `dist/server` for bare imports and expanded each transitive dependency by hand. With the declaration correct, `pnpm install` applies the same rules — a plugin's `dependencies` come along, its `peerDependencies` are skipped by `autoInstallPeers: false`, and `devDependencies` were never published — and a scan that resolves specifiers is a scan that can miss one.

- 52d1107: Resolve the shared UI packages through the workspace catalog: `@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`, `shadcn`, `tailwind-merge`, and `tw-animate-css`.

  Every package already agreed on one version for each of these — the catalog is what keeps them agreeing. A range edited in one manifest and not the others would otherwise put two copies of a UI primitive into an application's bundle, which is the kind of drift nothing reports until a component behaves differently depending on which plugin rendered it.

  Peer dependencies use `catalog:` too. `pnpm pack` resolves it before publishing, so a consumer still reads an ordinary range.

- Updated dependencies [52d1107]
- Updated dependencies [52d1107]
- Updated dependencies [52d1107]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.5
  - @nocobase/app-plugin-ai-knowledge-base@0.1.0-beta.5
  - @nocobase/app-plugin-authentication@0.1.0-beta.9
  - @nocobase/app-plugin-authorization@0.2.0-beta.8
  - @nocobase/app-plugin-i18n@0.1.0-beta.4
  - @nocobase/app-plugin-install@0.1.0-beta.6
  - @nocobase/app-plugin-notification@0.1.0-beta.5
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.6
  - @nocobase/app-plugin-workflow@0.1.0-beta.11
  - @nocobase/app-plugin-file-repository@0.0.2-beta.1
  - @nocobase/app-plugin-notification-providers@0.2.0-beta.3

## 1.0.0-beta.18

### Minor Changes

- d29d1fe: Run application migrations and seeds on explicitly selected database connections, with per-connection configuration, startup policies, isolated results and fail-fast execution. Keep plugin tasks on the default system connection and reject task execution against externally managed databases. Preserve legacy configuration and directory support while adopting database/<connectionName> source directories in both application templates; add --connection and --all CLI options and document upgrade rules.
- d29d1fe: Make Default a clean application starting point: remove all nine example plugins, article/demo pages, sample services and APIs, article migrations and seeds, unused article UI primitives, and obsolete starter dependencies. Keep product capabilities and a localized homepage, with empty application database task directories. Document preserving existing application-owned history during source upgrades. Runnable demonstrations remain in Examples.

  Add a notification provider `demo` option so Default can omit the notification demonstration page while retaining notification services and the global host. Existing registrations keep their current behavior.

- ec576ba: Let plugins contribute commands to an application's CLI, and rename the bin to `nocobase`.

  An application now has a `cli/` composition root beside `client/` and `server/`. Its `cli/index.ts` calls `runAppCli()` from `@nocobase/nb3-cli/runtime`, which assembles one command tree from three sources: the built-in plugin management commands under `plugin`, the application's own commands under `app`, and each registered plugin's commands under the topic that plugin declares. `pnpm nocobase` runs it.

  A plugin contributes commands by exporting a `./cli` entry that calls `defineCliPlugin()` with a topic and a map of oclif `Command` subclasses. `@nocobase/app-plugin-cli-example` is the reference implementation. `@oclif/core` is a peer dependency of such a plugin so that the plugin and the application share one copy, which is what keeps help rendering and flag parsing consistent.

  `plugin register`, `plugin unregister`, and `plugin inspect` maintain `cli/plugins.ts` the same way they already maintain `client/plugins.ts` and `server/plugins.ts`, keyed on whether the plugin exports `./cli`. An application without TypeScript degrades to printed instructions for that file exactly as it does for the other two.

  `cli/` is compiled into `dist`, so a deployed application runs the same commands with `node ./cli/index.js`. The application's own `migrate` and `seed` are now commands rather than separate scripts, and `pnpm migrate` / `pnpm seed` dispatch through the CLI — the script names are unchanged. A command that cannot work in a deployment goes in `cli/dev-commands/`, which the build excludes; client inspection lives there because it needs Vite and the browser client. `server:config` was removed outright.

  Two breaking changes come with this. The bin is `nocobase` rather than `nb3`, and the five plugin commands moved from `app plugin *` to the top-level `plugin *`, which frees the `app` topic for the commands an application writes itself. The `pnpm plugin:*` script names are unchanged, so anything invoking those scripts is unaffected.

- d29d1fe: Remove the system information plugin package from the workspace and all application templates. Remove its client page, server API, plugin registrations, dependencies, synchronized Skills and integration test references. Document the source upgrade and use a new plugin name in the scaffolding tutorial.
- d29d1fe: Remove `@nocobase/app-plugin-file` from all application templates, including client/server registration, direct dependencies, test fixtures and installed-plugin guidance. The plugin's file inventory settings page and API are no longer included by default. Preserve stored files and independently registered file Repository capabilities.

### Patch Changes

- dc517b1: Refactored the AI knowledge-base server around property-cached repository, manager, and service factories; added complete AI feature provider registries, authenticated `/api` and `/v2/api` routes, lifecycle-managed vectorization and PGVector resources, and a standardized Server registration entry.
- d29d1fe: Resolve the development entry point's application root two levels above scripts/dev. Start workflow builds, plugin watchers, Vite and the application server from the application directory so pnpm dev no longer tries to read scripts/package.json or writes workflow artifacts under scripts/dist.
- d29d1fe: Add a database-local TypeScript project in both templates so ESLint and editor tooling recognize per-connection migrations and seeds.
- 5281fd1: Add File Repository Client and Server services, multipart uploads and configurable stream/redirect route helpers. Keep the attachments migration, concrete API configuration and development page in a separate example plugin, and register both plugins in the default application.
- a73d1e3: Tell agents to ignore globally installed NocoBase 2 Skills in generated applications, matching the Hub template.
- 93f6cc1: Fix `pnpm dev`, which stopped starting after the development scripts were reorganized.

  `scripts/dev.mjs` became `scripts/dev/index.mjs`, but it finds the application root by walking up from its own location and still walked up only one level. It therefore resolved `scripts/` as the root, looked for a tsconfig that is not there, and reported `Cannot resolve tsconfig at path: .../scripts/tsconfig.server.json`. The same miscalculation sent the workflow build into `scripts/dist/server/workflows`.

  A test now checks the invariant directly: any file resolving the application root from `import.meta.dirname` — or from `path.dirname(fileURLToPath(import.meta.url))` — must walk up exactly as many levels as it sits deep. Moving such a file has broken this several times, always silently, because the wrong path still resolves and only fails somewhere else.

- f5b066d: Fix development startup by building workflows through the application CLI instead of the removed standalone workflow command.
- 008969c: Contribute Workflow check and build commands through the application's unified `nocobase workflow` CLI topic, including structured JSON output, and register the commands in both application templates.
- 67907ec: Remove the duplicate application plugin registry from package.json. Discover registered plugins from explicit Client, Server, and CLI composition roots for CLI updates, Skills synchronization, and development watches, and package server dependencies from compiled imports. Preserve legacy metadata cleanup during unregistration.
- 5281fd1: Allow drive configurations to omit storage links so application startup succeeds when no symbolic links are configured.

  Display an empty links map in application configuration summaries when drive links are omitted.

## 1.0.0-beta.17

### Minor Changes

- 0e9505a: Add App-scoped appearance preferences, theme presets and saved preference restoration. Support semantic colors, sidebar and chart palettes, fonts, type scales, spacing, radius and runtime shadows, with shared AI guidance for theme authors and component authors.

  Provide Default and Compact presets. Compact keeps Default's colors, fonts and shadows while using tighter dimensions.

### Patch Changes

- 9536bf5: Restore the client dependencies an installed application needs to bundle the workflow canvas and the Sonner-backed notification provider. A plugin's `client/` is compiled by the consuming application's Vite build and its `dist/client` keeps bare imports intact, so a package declared only as a `devDependency` is absent once the plugin is installed from the registry rather than linked from this workspace: `pnpm dev` failed with `Could not resolve "@xyflow/react"` and `Could not resolve "sonner"`. Move `@xyflow/react` back into the workflow plugin's `dependencies`, and declare `sonner` in both application templates.
- Updated dependencies [9536bf5]
  - @nocobase/app-plugin-repository-example@0.1.0-beta.1

## 1.0.0-beta.16

### Minor Changes

- 90a4903: Add Microsoft SQL Server support through Knex and the `tedious` driver, including connection configuration, Collection Builder and Query behavior, Schema Inspector introspection, real Docker integration tests, generated-application driver installation, and template runtime packaging.
- 90a4903: Add Oracle Database support through the `oracledb` Thin driver, including connection configuration, Collection Builder and Query behavior, Schema Inspector introspection, real Docker integration tests, generated-application driver installation, and template runtime packaging.

### Patch Changes

- 90a4903: Add a Repository API example plugin with relational CRM and order tables, transactional sample data seeds, authenticated CRUD endpoints, and localized management pages with grouped navigation, detail child routes and create/edit drawers, product-aware order details and nested order-item creation. Include an atomic numeric update playground with seeded counters, guarded deductions and concurrent increments. Add aggregate statistics, status filters, product grouping with HAVING, and customer relation counts over the seeded orders. Enable the example in the Default Template.
- cd59102: Use `client.app.title` from application configuration for the Refine application title and the browser document title.
- a864497: Add standalone and Hub-managed host modes, startup-only YAML or JSON host configuration, FS and S3 release deployment through NocoBase Drive, strict desired deployment reconciliation, file configuration path selection, host-owned structured logging, shared ws-backed App WebSocket handling, private authenticated child-process management over Node IPC, and bounded managed-host crash recovery. Managed deployments use checksum-addressed immutable revision directories, stop-first Runtime replacement with bounded graceful request draining, and a three-revision local cache for fast rollback. Rename the Host's in-process runtime implementation to `InProcessAppHandle`.
- a864497: Register the Application Hub in the Hub template and provide an application control plane. Release artifacts supply their version and an optional `config.example.yml` or `config.example.yaml` template, while applications choose Config file or External configuration and reserve Hub-managed configuration for a future database-backed implementation. Hub actions reconcile only the selected application, reuse an already installed matching artifact, report deployment phase timings, and support removing an application and its persisted resources. Separate Hub desired configuration files from Host-owned runtime configuration, rebuild recovery targets when Host becomes ready, and split the management page into business modules.
- 90a4903: Replace the composite application transport with application-owned `ApiClient` and `RealtimeClient` services. Client plugins, examples, and application templates now use object-style HTTP request options through the shared API client, while realtime subscriptions resolve their dedicated WebSocket client.
- 20d2cf2: Replace the account menu language select with a labeled shadcn submenu that displays the current language and uses radio items for selection, with keyboard navigation and selected-language indicators.
- 90a4903: Preserve configured API and realtime endpoints after splitting the client services. Integrate file inventory and the plugin-owned inbox with the shared API and realtime clients, including reconnection refresh and isolated event listeners.

  Allow the Oracle driver install script in both templates’ standalone deployment workspace settings.

  Resolve SQLite auto-incrementing bigint metadata correctly, narrow Oracle LOB values before reading their type, preserve legacy file timestamps, and rebuild the AI registry against the current API client.

- 19ae76a: Route generated NocoBase 3 applications to their local development guidance instead of globally installed NocoBase 2 Skills.
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [566492d]
- Updated dependencies [566492d]
- Updated dependencies [566492d]
  - @nocobase/app-plugin-repository-example@0.1.0-beta.0

## 1.0.0-beta.15

### Patch Changes

- 15c77a6: Move Workflow source parsing and Artifact generation behind the `workflow build` command while retaining the public build API for applications with custom Instructions. The command uses Node's native TypeScript loading in a disposable process and removes esbuild entirely. CLI build modules remain in the published package, but production servers do not load them or TypeScript at runtime.

## 1.0.0-beta.14

### Minor Changes

- 813da59: Rewrite the template's package name into the generated application's own, in `client/runtime.ts`, `client/service-provider.ts`, and `server/providers/app-example.ts`, and set `displayName` to the application name instead of dropping it. The client previously declared an i18n namespace the server did not share, and `pnpm client:inspect` refused to run because the two disagreed.
- 813da59: Install the deployable `dist/` with pnpm rather than npm, and add the database driver the application declares to `dist/package.json`. The driver was missing from that manifest, so a deployment installed no driver at all and failed on its first query.
- 813da59: Ship `.prettierignore` in the published package, so `pnpm format:check` in a generated application does not fail on the lockfile.
- 813da59: Discover tests with a glob instead of a hand-maintained list of filenames, and pass an empty run so `pnpm test` works in a generated application, which ships no tests. The list named a file that no longer existed while several real test files were absent from it and were never run; those covering removed sources are deleted.

### Patch Changes

- 8d88ff4: Replace the public AI Employee LLM service filesystem loader with the application `config.yml` contract at `ai.llmServices`. Configured model entries use a simple label/value array and are converted internally to custom mode. The App plugin validates and synchronizes declarative service definitions at startup and on application-config reload while preserving repository-managed enabled state for matching services. The default App template includes a commented configuration example, and the App config validator supports unique object properties for rejecting duplicate service names.
- 43d5bf0: Publish the application-owned AI Employee frontend Registry with its chat components. Plugin-owned development showcases now live under `client/dev`, outside the materialized Registry item, and are excluded from production application builds. The Registry uses the application-scoped `@nocobase/app-client` transport for JSON, upload, and streaming requests instead of the deprecated Portal SDK client. The Default and Hub templates scan plugin Registry source for Tailwind utilities, so materialized components retain their intended responsive layout and sizing.
- 813da59: Declare browser-only packages as devDependencies rather than dependencies, and make `react-i18next` an optional peer of `@nocobase/i18n` provided by `@nocobase/app-client`. Client code is bundled by the consuming application, so these entries did nothing for the bundle while `dist/package.json` pulled every one of them into the server deployment to be installed and never required.
- cee3251: Add authenticated realtime subscriptions, refresh their identity after authentication changes, and invalidate in-app notification state through user-scoped events.
- 813da59: Build the workspace packages a template depends on by selecting them with pnpm rather than listing them by hand, and drop the unused `Dockerfile`. The hand-written list had drifted: `@nocobase/config` was missing from it, so building a template on its own failed at "Generate server package".
- 813da59: Add `pnpm deps:check`, which fails when server code imports a package declared only in devDependencies. That mistake resolves in every development checkout and is absent exactly once, on the deployed server, where it surfaces as a bare `Cannot find package`.

## 1.0.0-beta.13

### Patch Changes

- 66dba5d: Pass the complete client plugin composition to `defineAppRuntime()`.

  The runtime now resolves plugin route component overrides from the same `AppClientPlugins` object as every other plugin contribution, while application route overrides remain a separate declaration.

  The Client Application now validates the auth provider and guest login route required by authenticated routes internally, keeping those details out of application composition roots.

## 1.0.0-beta.12

### Minor Changes

- 6f9b399: Rewrite the template's agent and human documentation around building an application rather than developing a plugin. `README.md` now describes the project structure, how to run it, and what each of its own pnpm scripts does; `AGENTS.md` describes how to build a feature — pages, shadcn/ui components, endpoints, database access, migrations, and translations — and routes to a new `skills/nocobase-app-development/` skill whose references carry the detail. The nested `client/AGENTS.md` and `server/AGENTS.md` are rewritten to match: the server guide previously told agents to put new domain APIs in a plugin package, the opposite of what an application scaffold should say, and the client guide was largely about a `client-old/` directory that no longer exists.

  The page-to-sidebar path is now written down. Declaring a route makes the URL work but leaves the page out of navigation, which needs a Refine resource registered in `client/service-provider.ts`; the documentation previously described only the route half, so a page added by following it would have been unreachable from the sidebar. The guidance also now separates the directories business code belongs in from the framework scaffolding the template replaces on upgrade, and asks that both be updated together when an application changes that structure.

  The authorization Skill moves from `@nocobase/authorization` to `@nocobase/app-plugin-authorization` and is renamed `nocobase-app-plugin-authorization`. Skills synchronize from registered plugins, so one published by a library could never reach an application; its example also imported `@nocobase/authorization/database`, which an application does not depend on, and now imports the types the plugin re-exports.

  The guidance now points at the plugins an application already has. A prompt asking for approvals, notifications, or per-user record access was answerable only by building those from scratch, because nothing told an agent that `app-plugin-workflow`, `app-plugin-notification`, and `app-plugin-authorization` are installed and publish their own Skills — `.agents/skills/` was described only as generated output not to edit. Server route guidance also covered `can()` but not `authorize()`, so an ownership rule like "a salesperson sees only their own customers" had no documented path other than filtering rows in memory after fetching them, and scheduled work had no guidance at all.

  Application-owned migrations now reach the build. `database/migrations` and `database/seeds` exist in the template, and `tsconfig.server.json` compiles `database/**/*.ts`, so a migration an application writes is typechecked and emitted to `dist/database/` — which `scripts/build-server-dist-package.mjs` already expected to find. `pnpm migrate` applied such a migration before this change, but `pnpm build` silently dropped it. The unreferenced `tsconfig.migrations.base.json` is removed.

  `app-template-hub` receives the same framework-level change, since it is the same application scaffold with a different product identity: the rewritten documentation and the `nocobase-app-development` Skill, `CLAUDE.md`, and the migration build fix, which it had the identical version of. The repository `AGENTS.md` now records that framework changes to one template belong in the other by default, with the parts that stay template-specific.

## 1.0.0-beta.11

### Major Changes

- 174eab5: Consolidate the browser packages into `@nocobase/app-client`.

  `@nocobase/app-sdk` is gone; its API client now lives in `@nocobase/app-client` and is imported from there. `@nocobase/app-portal-sdk` is deprecated and keeps only what still has consumers: `NocoBaseClient` and the runtime configuration it reads, which exist to reach a v2 NocoBase server, and the route surface containers under `/routing`. Its ACL, auth, data, extension, i18n, and system-settings modules are removed, as is the route tree that `/routing` used to export alongside the surfaces.

  `@nocobase/app-client` gains `resolveAppBase()`, which reports the path the application is mounted at.

  Four plugins built their API client at import time instead of resolving it from the application's service container, so they could not see `api.baseURL` from the application configuration. They now resolve it, which means an application that configures a base URL gets one client rather than two that disagree.

  The injected browser global `NOCOBASE_PORTAL_BASE` is renamed to `APP_BASE_PATH`. Its value has always been the `APP_BASE_PATH` environment variable, and the old name grouped it with the settings that address a v2 NocoBase server. Those keep their names. A client and the server that serves it must be upgraded together.

  `@nocobase/app-plugin-data-provider` is removed. It forwarded the Portal data provider, and applications built on the current client runtime do not use it.

  The Hub template is rebuilt from the default template and now runs the same client and server stack as every other v3 application. Its `/api/apps` endpoint and its v2 API proxy are gone, so a hub's `.env` no longer configures them.

  The Portal SDK's template compatibility check is removed with the rest: it had been disabled behind a constant, and its install script cost every generated project a `pnpm-workspace.yaml` `allowBuilds` entry it did not need. `createPortalViteConfig` no longer takes the plugin that injected it.

- 174eab5: Remove the shadcn Registry both templates shipped. Its recipes were written against the Portal SDK modules that no longer exist — ACL, extensions, routing, i18n, and system settings — so materializing one into an application would have installed code that cannot compile. The Registry the authentication plugin publishes is unaffected, and `client/extensions/nocobase-auth-ui` stays where it is.

### Minor Changes

- ab7b341: Add `defineDevRoutes()`, for pages that exist only while developing an application.

  It takes the same shape as `defineSettingsRoutes()` — pages, one level of groups, `navigation` and `access` — and mounts under `/dev` instead of `/settings`. The two are separate path spaces, so the same relative path may appear in both and resolve to `/settings/orders` and `/dev/orders`.

  What makes it different is that nothing it declares reaches a production bundle. The guard lives inside `defineDevRoutes()` rather than at each call site, so a plugin author calls it unconditionally the way they call `defineSettingsRoutes()` and cannot forget it. A production build replaces `import.meta.env.PROD` with `true`, which makes the argument unreachable and lets the bundler drop the page components behind it, along with any module only those pages import. The templates guard their `/dev` route and the dev entry in the header the same way, so a production build carries no dev route, no dev layout chunk, and no dev entry point.

  This draws its boundary at the build output, not at runtime permissions. A page that has to exist in production but be restricted by role is still a Settings Route with `access`, enforced by the server.

  Both templates' headers offer a dev entry beside the settings gear, visible only during development. A surface withdraws its own entry: the settings centre shows the dev entry but not the gear, the dev tools show the gear but not the dev entry, and the application shell shows both.

  Both templates gain a `client/layouts/` directory. The settings centre's chrome — the navigation rail, group disclosures, the mobile page select, and the per-page access filtering — is now one `SurfaceLayout` that the settings centre and the dev tools each render with their own copy, rather than a second copy of the same layout. The Hub template's settings navigation picks up the translation the default template already had.

  `client:inspect` reports the resolved dev routes and accepts `--type dev-routes`.

### Patch Changes

- ab7b341: Fix `client:inspect`, which failed with `.glob is not a function`.

  The command runs under tsx and imported the application's client declaration modules directly. Those modules are written for a bundler: `client/source-extensions.ts` calls `import.meta.glob()`, which only a bundler implements. This surfaced once `client/runtime.ts` began importing source extensions — before that the inspector never reached a module that needed one.

  Declarations now load through Vite, so aliases such as `@/` and compile-time `define` constants resolve exactly as they do in a real build, rather than being an approximation the inspector maintains separately. The environment is configured to transform modules and nothing else — no HMR, websocket, file watching, or dependency pre-bundling — because each of those leaves a handle open that stops the command from exiting once it has printed its result. The server is closed on every path, including failures.

  The tests missed this because they run under Vitest, which is built on Vite and therefore implements `import.meta.glob` — the declaration modules loaded fine there while the real command was broken. `client:inspect` is now also exercised as a child process under tsx, the way a developer runs it, and that test fails if the loader regresses or if the command stops exiting on its own.

## 0.1.0-beta.10

### Minor Changes

- ac3f033: Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.
- ac3f033: Export every server plugin from its package's `./server` entry point, and update application composition, plugin discovery, and generated plugins to use the unified entry point.

### Patch Changes

- 78cf0a2: Add machine-readable plugin lifecycle results and a read-only plugin registration inspector for Agent workflows.
- 78cf0a2: Complete the four-Route full-stack example and add a stable Agent-facing Client inspection protocol.
- 78cf0a2: Add a complete App-facing Plugin Skill example with a reusable Notice component, an authenticated Server API, target-App integration tests, and capability-aware Skill scaffolding. Clarify System Info ownership, authorization, and behavioral verification guidance.
- 78cf0a2: Keep synchronized `.agents` content out of generated application source control while preserving local Plugin Skill synchronization and inspection.
- 1b5f10f: Accept `--template hub` in `create-app`, and scaffold a hub as a hub rather than as an app.

  A hub has no database, so the app flow was wrong for it in every step that touches one: it would have asked which dialect to use, added a driver dependency the hub never loads, and written a `config.yml` the hub never reads. A template now declares what it is through `nocobase.templateKind`, and `create-app` reads that to decide which flow applies — falling back to the package name so a local path to a checkout predating the field still works. The kind is settled after the template is downloaded, because a package specifier or a local path does not reveal it any earlier.

  A generated hub gets the scaffolding `nb3 hub create` already produced: `.env` derived from the template's `.env.example` with `APP_NAME` set to the project name, `.nb3/hub.json` so the `nb3 hub` commands can find it, `app-dist/` for the apps it serves, the runtime directories it writes into, and the matching `.gitignore` entries. `--db-dialect` is reported as ignored rather than silently dropped when it is passed alongside a hub template.

- 78cf0a2: Generate runtime-aware TypeScript, ESLint, Node engine, and development dependency configuration for Client-only, Server-only, and full-stack plugins, including stable package-scoped Queue Job identities.

  Keep plugins aligned with the Agent development contract by giving Queue, System Information, and Workflow Routes path-scoped authentication, documenting the Queue API path and Database declaration source accurately, and storing example tests under each plugin's root test directory.

- fb1a752: Unify Client and Server application composition around the explicit `serviceProviders` contribution and rename Client React tree contributions to `reactProviders`.

  Replace Client bootstrap modules with application-owned ServiceProvider lifecycle hooks, make the default Client start through `ClientApplication` and render through the Browser host, and update built-in plugins and runtime inspection to the new static contribution protocol.

- 78cf0a2: Add declaration-level Server plugin inspection with real Route contribution order, and make the Routes example own a path-scoped authentication boundary.
- fb1a752: Transport public Client configuration through a versioned, safely escaped JSON data block in SPA HTML and read it automatically during Client runtime resolution.

  Apply the same HTML transformation to production static responses and development Vite proxy responses, and document the public `config.yml` Client section in the default template.

## Unreleased

### Patch Changes

- Show Client and Server locale declarations in application inspection without executing locale loaders.
- Make locale-only Client inspection skip unrelated Route and Provider factories.
- Include explicit Client Route and Settings order in inspection snapshots.

- Simplify Client startup into Runtime definition, application creation, and rendering stages by using the shared `@nocobase/app-client/runtime` API.

## 0.1.0-beta.9

### Minor Changes

- 7cdffbd: Add explicit `server/plugin.ts` definitions for Providers, API routes, root routes, database sources, and queue jobs. Register routes in a dedicated Application phase after Provider boot, add reusable HTTP and runtime composition helpers to their owning packages, and remove the default template's duplicate runtime layer and legacy plugin discovery contract.

### Patch Changes

- 7cdffbd: Add reusable application-scope cancellation and disposer lifecycle primitives, and use them for the default template standalone scope.
- 7cdffbd: Add reusable application-scope path, environment, and routing resolvers, while keeping default-template configuration mappings application-owned.
- 7cdffbd: Move public base-path mounting and mounted origin proxy adapters into `@nocobase/app-server-kit` so standalone applications can reuse the host-neutral runtime boundary.
- ce4eab8: Add a focused ServiceProvider plugin example with a tokenized heartbeat
  service, lifecycle management, and an HTTP status route. Pass the Application
  directly to providers and standardize service access through `app.container`.
- 7cdffbd: Replace separate API and root route arrays with one ordered `routes` contribution array. Route factories now receive the Application, create and return their own Hono router, and are mounted automatically at `/api` or the application root according to their definition.

  Standardize plugin server modules around `providers/index.ts` and `routes/index.ts` collection entries, `services/` domain implementations, and a stable `tokens.ts` public contract.

  Generated plugins now declare conventional database and queue contribution directories by default. Missing optional directories are ignored until executable migrations, seeds, or jobs are added.

  Generated plugins now include an App-facing starter Agent Skill under the package's `skills/` directory. Plugin registration and skill synchronization copy these package-owned Skills into registered applications' `.agents/skills/` directories.

  Unify Client page contributions behind one `routes` loader. Plugins now use `defineAppRoutes()` and `defineSettingsRoutes()` to add child Routes to the application's two built-in Client Routes, mirroring how Server plugins use `defineRootRoutes()` and `defineApiRoutes()` with the built-in Hono routers.

- 7cdffbd: Add reusable Node HTTP, WebSocket, and standalone server definition adapters with graceful shutdown handling, Vite overrides, mounted application lifecycle ownership, standard listen configuration, and startup cleanup. Reduce the default template standalone entry to binding its root directory, Runtime Definition, and shared server factory. Derive the application package name from its root package metadata and keep standard standalone routing defaults in the Node runtime instead of repeating them in each Runtime Definition.
- 12dfb68: Add the template-based `@nocobase/create-plugin` scaffold with complete client and server examples, including shadcn configuration for plugin-owned runtime UI and an application-owned Registry component recipe with build, materialize, and publishing metadata. Reuse the `nb3 app plugin` commands from the monorepo root, and register exported server plugin definitions in the application's explicit `server/plugins.ts` composition root.
- 8438765: Add Resend, Feishu, and DingTalk notification Providers; allow Feishu and DingTalk to be enabled together with logical IM targets and channel-scoped `single` or `all` Provider routing; add provider-aware recipient resolution and structured delivery errors; add an access-controlled Notification logs page to Hub settings; and document secure template configuration and authenticated Provider verification.
- 7cdffbd: Move server plugin manifest resolution, Provider loading, and database or queue contribution discovery into the public `@nocobase/app-server-kit/plugins` entry. The default application template now consumes the shared implementation.
- 7cdffbd: Add declarative application Runtime Definitions, shared application Scope, path, and disposal contracts, reusable Node standalone Scope and environment loading utilities, and focused Runtime Config section resolution. Resolve plugins before config factories and pass the complete resolved Runtime into application assembly, making Runtime plugins the single source for both configuration contributions and provider or route registration. Use the shared Runtime assembly across app-host and the default application template so embedded and standalone modes no longer maintain separate structural copies. Remove the template-local Scope and config-loading infrastructure, require standalone entrypoints to pass their resolved application root explicitly, and remove the legacy `/v2/api` proxy contract in favor of each application's local `/api` router.

## 0.1.0-beta.8

### Patch Changes

- a0cc151: Fix plugin utility classes missing from the stylesheet, which left plugin pages unstyled in a generated application: spacing collapsed, buttons stretched full width, and badge colours disappeared.

  The `@source "../node_modules/@nocobase/app-plugin-*/client"` globs never matched anything. pnpm links every dependency as a symlink into its store, and Tailwind's scanner does not expand a wildcard through one, so no plugin file was ever scanned — in this repository or in a generated application. It only looked correct here because workspace plugins resolve to TypeScript sources that Vite compiles, and the Tailwind Vite plugin scans what Vite transforms. An installed plugin resolves to prebuilt `dist/client` output, which Vite does not transform, so neither mechanism saw it.

  A `tailwind.config.mjs` now resolves each plugin's client directory to its real path before scanning, which gets past the symlink, and covers both `client` and `dist/client` so a workspace plugin and an installed one are scanned the same way. `@nocobase/app-client` is scanned through the same mechanism, replacing a `@source` that pointed outside a generated application's directory and resolved to nothing there.

## 0.1.0-beta.7

### Minor Changes

- 062f5b1: Add `settings` to `defineClientPlugin`, a fourth contribution type alongside `bootstrap`, `routes`, and `providers`. A plugin points it at a module that default-exports an array of setting definitions, or a function of the plugin options returning one, and each entry becomes a page in the application's settings centre.

  An entry is either a page — `id`, `title`, an optional `icon` and `access` rule, and a `pageLoader` — or a group that carries an icon and title once for a set of pages. Ids are single URL segments and nesting comes from the tree, so a page under a group is served at `/settings/<group>/<page>`, and a plugin contributing one page declares it without a group and gets `/settings/<id>`. Groups nest one level. Settings and routes share one path space, so a route and a page that would mount at the same address fail resolution with both identities named.

  The default template renders the settings centre, reusing the application shell's chrome — brand, sidebar collapse, theme, and user menu — with `Back to app` where the workspace label sits and no gear pointing at itself. The left rail collapses by group the way the product sidebar does. A page whose `access` rule is denied is left out of the navigation and cannot be reached by its URL either, and a group whose pages are all denied disappears with them. A setting whose `access` rule is denied is left out of the navigation and cannot be reached by its URL either. Authorization's four administration pages now arrive this way, at the URLs they already had, and no longer appear in the product sidebar.

  `client:inspect` gains `--type settings`, and `pnpm plugin:create` scaffolds a `client/settings.ts` entry.

- c8f38c8: Register client plugins explicitly in the application's `client/plugins.ts` instead of discovering them from `nocobase.plugins` through a Vite virtual module.

  Each plugin now ships a `client/plugin.ts` descriptor, exported as `./client/plugin`, that declares its bootstrap, routes, providers, and route component overrides. An application composes them with `defineClientPlugins([...])`, where array order is bootstrap order and a plugin is enabled by being present. The entry is real, type-checked application source: it can be read, diffed, and edited, and Vite reloads it like any other module.

  Plugins can also accept options. `defineClientPlugin` takes an options type that reaches the bootstrap context, the routes and providers factories, and the route component overrides, so an application can pass a custom login page or a notification label at registration.

  `@nocobase/app-plugin-registry-example` only drops its now-unread `nocobase.plugin.client` manifest field; it contributes no client extensions.

### Patch Changes

- f09425b: Add the File plugin with a minimal route-and-store server API, system-administrator Demo management, default-disk fixture initialization, safe Unicode filenames, bounded multipart uploads, hardened content delivery, same-origin requests, observable setup, and independently installable Registry UI.
- 39bd8ec: Fix `pnpm app:dev` hanging at `Starting app dev server...` when a stale process from another project still listens on the Vite port. Port selection bound the wildcard address `0.0.0.0`, which succeeds even when another process holds `127.0.0.1` on the same port, while the readiness probe requested that loopback address and reached the other process instead. The dev server therefore polled a foreign server for two minutes and failed with a misleading `HTTP 404`.

  Port selection now also probes the loopback addresses behind a wildcard host, so it picks a port that the readiness probe can actually reach. Only a genuine `EADDRINUSE` rules a port out, which keeps hosts without an IPv6 stack from discarding usable ports.

- 1a9732a: Re-export the client registration factory as the default from `client/index.ts`, so an application registers a plugin by importing `<package>/client` instead of `<package>/client/plugin`. `client/plugin.ts` still defines the factory and its `./client/plugin` subpath still resolves; the barrel simply re-exports it.

  Every plugin now declares `sideEffects: false`. An application imports the barrel, which also carries types, helpers, and components, and without that declaration a bundler must assume each of those matters and keeps them in the application entry chunk. With it, importing `<package>/client` costs exactly what importing `<package>/client/plugin` cost: the entry chunk is byte-identical for all eight plugins, where before it grew by 696 bytes for authentication and 88 for file.

  The declaration was checked rather than assumed: every client module's top-level statements are pure declarations, with no global assignment and no bare `import './x.css'`. The CSS imports under `app-plugin-workflow/registry` are copied as source by `registry materialize` and never bundled through `exports`. A plugin that later introduces a module-level side effect must drop the declaration.

  `@nocobase/app-plugin-workflow` additionally points `./client` at `./client/index.ts` rather than `./dist/client/index.js`, matching every other plugin. Consuming the built output made the barrel resolve to a stale artifact, which failed the build outright.

- c8f38c8: Add `nb3 app plugin register` and `nb3 app plugin unregister`, so an application generated from the template can install, wire, and remove a plugin. Both are available as `pnpm plugin:register` and `pnpm plugin:unregister`.

  Registering installs the package, records the dependency and the `nocobase.plugins` entry, imports the plugin in `client/plugins.ts`, and copies the skills it ships into `.agents/skills`. Unregistering reverses all four. The editing logic is shared with this repository's own `plugin:register` scripts; only the plugin lookup and the recorded dependency range differ.

  Only a plugin that ships a `./client/plugin` export is written into `client/plugins.ts`. A server-only plugin is registered without it, because importing an export it does not have leaves the application unable to build.

  An application without TypeScript still gets the install, the manifest entry, and the skills; only the `client/plugins.ts` edit is skipped, and the exact lines to add are printed so they can be applied by hand or by an agent.

- a38f531: Restore the `plugin:register`, `plugin:unregister`, `plugin:update`, `plugin:skills:sync`, and `client:inspect` scripts, along with the `@nocobase/nb3-cli` dependency they invoke. A merge resolution dropped them, which left the workflow documented in `docs/cli/README.md` unrunnable: the scripts these docs tell users to run did not exist in the template.

  Nothing at runtime reads these scripts, so their absence broke no build and failed no test. A new test asserts the documented command surface, so the next time one goes missing it fails loudly instead of silently.

## 0.0.1-beta.6

### Patch Changes

- eb195d0: Roll production log files daily and retain up to seven files by default.

## 0.0.1-beta.5

### Patch Changes

- 8fb9319: Declare the pnpm version this package is developed with, so working on it uses the same pnpm as the rest of the monorepo.

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
