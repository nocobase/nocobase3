# @nocobase/app-plugin-ai-employee

## 0.1.0-beta.20

### Patch Changes

- 709f9ed: Update Better Auth and API keys to 1.7.5 and align fresh authentication databases with provider-based account identity. Existing authentication databases must be recreated; the original account migration has changed and no compatibility migration is provided.
- d696700: Stop the `bubblegum` theme from turning settings pages into competing hues, and fix the token misuse it exposed.

  The preset was carried over from tweakcn verbatim, and upstream spends the generic surface and outline roles on decoration: `--card` was a cream 101 degrees of hue away from the pink `--background`, `--border` was `--primary` itself at chroma 0.18 against a median of 0.02 across the other thirty presets, and `--muted` was a cyan. One demonstration card and a few dividers carry that; a settings page stacking several panels over dozens of hairlines does not, and pages showed pink, cream, cyan and teal at once. Six light values are retuned — `--card`, `--border`, `--muted`, `--input`, `--sidebar-border` and `--sidebar-primary` — keeping those roles in the background's hue family and leaving the preset's colour in `--primary`, `--secondary` and `--accent`. The dark values, the radius, and every other preset are unchanged, and `THIRD-PARTY-NOTICES.md` records the deviation.

  The same pages also used tokens for something other than their role, which no neutral preset makes visible. Authorization's two page shells and four Hub pages painted the whole page with `bg-muted/20`, which is the page surface and belongs to `bg-background`; under a preset whose `--muted` is a real colour that was a film over the entire viewport. The AI employee page's read-only fields hand-rolled `bg-muted/40` instead of using the shared `Input` and `Textarea` with `disabled`, three information callouts were fixed `bg-blue-50`, and the MCP transport labels were fixed `bg-blue-100`/`bg-green-100`/`bg-amber-100`; the transports now take their three tones from the theme's chart series, which is what a preset defines to be told apart.

  Three fixed colours on settings pages are corrected while they are in hand. The AI employee page's missing-knowledge-base warning and the schedule detail page's target-issue icon named a light-mode ink with no dark counterpart, so both were close to unreadable on a dark card; they now carry one. The routes example reported a load failure in a fixed red, which is what `--destructive` is for.

  The theme authoring reference and the token reference now state the rule, so a preset converted tomorrow is checked against it.

- d696700: Give every settings surface the token that matches what it is, so panels stop disagreeing with one another.

  The permission set editor is where this shows: its two tabs sit in one panel, and the permission configuration tab painted itself `bg-background` while the assignment tab inherited the panel's `bg-card`, so switching tabs changed the page colour under the same heading. The same mistake is spread across the settings pages, and none of it is visible under a preset whose page and card are near-identical.

  Each token names a layer rather than a shade, and every site now uses the one that describes it. A panel resting on the page is `bg-card`, which is what the AI tools and skills pages already used while the LLM service, MCP service, conversation, API key, user and notification log panels named the page surface instead — two lists in one plugin, one framed and one flat. A dialog or drawer is `bg-popover`, which is what the shared `Sheet`, `Dialog` and `Popover` primitives use and what six hand-rolled drawers and dialogs did not. An opaque sticky header, footer or table head names the surface it scrolls within rather than the page behind it. A form control names no surface at all and inherits the one it sits on, the way the shared `Input` and `Textarea` do with `bg-transparent`; twenty hand-rolled inputs, selects and text areas were pinned to the page colour and showed through as a differently coloured box inside every card.

  The styling reference now states which token describes which layer, and why picking one because it happens to look right is what puts a page-coloured block inside a panel.

- Updated dependencies [709f9ed]
- Updated dependencies [d696700]
- Updated dependencies [fa01814]
- Updated dependencies [ca3188e]
- Updated dependencies [38e5253]
- Updated dependencies [fa01814]
- Updated dependencies [7bde7bd]
- Updated dependencies [5380642]
- Updated dependencies [3187ace]
- Updated dependencies [d4783c2]
- Updated dependencies [d696700]
- Updated dependencies [5380642]
- Updated dependencies [c5f4438]
- Updated dependencies [3187ace]
- Updated dependencies [38e5253]
- Updated dependencies [38e5253]
  - @nocobase/app-plugin-authentication@0.1.0-beta.20
  - @nocobase/app-plugin-authorization@0.2.0-beta.17
  - @nocobase/db@1.0.0-beta.13
  - @nocobase/app-server@1.0.0-beta.23
  - @nocobase/app-client@1.0.0-beta.19
  - @nocobase/ai-employee@0.2.0-beta.7
  - @nocobase/caching@0.1.0-beta.2
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.19

### Minor Changes

- ff158aa: Group Settings navigation under AI with separate AI Employees, Conversations, LLM services, and MCP services pages while preserving legacy links. Add a read-only conversation center for searching and inspecting application-wide conversation history, protected by the application's AI settings Permission Set access. Reuse Registry conversation lists, message rendering, and history conversion, with safe read-only tool and sub-agent presentation.

  Make the AI Employees list collapsible and hidden by default, with a localized, accessible icon-only toggle centered on the left divider and no employee count or extra detail toolbar. Preserve the original bordered employee cards, 19rem expanded list, detail header, selection, and unsaved edits, with a reserved control gutter and touch-friendly sizing.

  Keep conversation search, pagination, and selection in the URL; improve responsive metadata, accessible search controls, localized timestamps, independent retries, and scroll anchoring when loading earlier messages. Align the Conversations page with the shared AI settings header, background, spacing, and content container while preserving its read-only controls and independently scrollable list and transcript.

- ff158aa: Add a standalone, read-only Skills catalog immediately after AI Employees with permission-protected management list and detail endpoints. Display associated tool names in a searchable table and show skill titles, descriptions, safe Markdown, and tool metadata in a detail dialog. Include English and Chinese translations, cancellation-safe loading, and retryable errors without executing tools or changing runtime skills endpoints.
- ff158aa: Add a read-only Tools catalog immediately after Skills in AI settings, with searchable cards and an accessible right-side details drawer. Show tool documentation safely and input schemas as inert JSON without execution controls. Add independently authorized management endpoints while preserving the existing runtime tools response contract.

### Patch Changes

- ff158aa: Add human-readable display titles to the built-in data metadata, data query, and business analysis report skills and their data tools. Replace legacy translation markers in all built-in tool titles and about text with plain English metadata so management views display readable text instead of internal resource names or unresolved templates.
- ff158aa: Constrain the AI employee editor to a viewport-responsive height and scroll overflowing tab content, including skills and tools, independently of the employee header, tabs, and save controls.
- ff158aa: Keep system and custom role editors at the same height, avoid marking an unchanged empty custom editor as modified, and align employee save actions with the editor's right edge.
- ff158aa: Expand the employee list by default when multiple AI employees are available, while preserving manual toggling. Let system and custom role editors fill the available detail area above the action bar.
- ff158aa: Sort the Skills and Tools management pages and AI employee skill and tool lists alphabetically by display title, falling back to the name when the title is empty, using a consistent case-insensitive order.
- ff158aa: Add matching icons to AI employee, skill, tool, LLM service, and MCP service settings navigation entries.
- ff158aa: Align AI settings route authorization contracts with the current application runtime and remove a duplicate conversation type import after integrating develop.
- ff158aa: Align LLM and MCP service settings tables with the standard administration table layout and page gutters, removing redundant card headings and nested padding. Clarify English and Chinese AI administration page descriptions and consolidate service configuration guidance into the LLM and MCP page introductions.
- ff158aa: Keep the employee list toggle visible and usable when only one AI employee is available, while leaving the list collapsed by default.
- ff158aa: Remove cross-feature tabs from AI Employee settings and its exported shell wrappers while preserving internal employee detail/editor tabs. Redirect legacy knowledge-base and vector-database tab URLs to their independent settings paths, preserving unrelated query parameters and hashes. Keep the tab registry and shell props as deprecated compatibility APIs without rendering contributed tabs; migrate custom tab contributions to Settings routes with parent `aiGroup`. Knowledge-base list/vector path helpers now target the standalone pages and require the owning Knowledge Base plugin's corresponding route update.
- ff158aa: Add employee skill enable switches backed by an optional `skillSettings.enabledSkills` allowlist. Omitted or null selections retain inherited GENERAL and registered skills, while an empty list disables every skill. Preserve explicit selections across built-in registration and repository reloads, intersect session restrictions, and reject unavailable skill content and persisted tool activations. Existing skill and tool settings remain compatible without a database migration.
- ff158aa: Add persistent employee tool selection with legacy inheritance for omitted or null selections and explicit disabling with an empty selection. Apply selections to discovered, injected, and skill-activated tools without allowing session settings to broaden access, preserve saved custom tool approval settings across registration and restart independently of explicit tool selections, and retain unknown saved names for future registrations. Selected optional tools still require their runtime capabilities, including current-user knowledge-base access.
- ff158aa: Hide Conversations from the AI settings sidebar while preserving its guarded route and legacy direct links.
- ff158aa: Remove the built-in data-modeling skill, which references unavailable tools. Keep the data-metadata, data-query, and business-analysis-report skills available.
- ff158aa: Keep Atlas as the only registered built-in AI employee, removing the Dex, Ellis, Lexi, Vera, and Viz definitions while retaining reusable skills and tools.

  Existing employee records and conversation history are unchanged; this release does not migrate or delete previously registered employees.

- ff158aa: Unify tool rows across employee configuration, skill details, and the tool catalog with fixed heights, truncated titles and identifiers, and two-line plain-text introductions with full hover text. Read employee tool introductions from introduction.about rather than model-facing descriptions, while preserving permission controls and tool-detail navigation.
- ff158aa: Keep skill cards at a fixed height, truncate long metadata, and collapse overflowing tool badges into a responsive +N indicator.
- ff158aa: Replace the Skills settings table with responsive cards showing skill metadata above a tools footer with a Wrench icon and wrapping badges. Preserve metadata and tool search, accessible drawer opening and focus return, safe detail rendering, and loading, empty, and retry states.
- ff158aa: Show localized skill counts alongside search and display tool introductions instead of model-facing descriptions in skill details. Include tool about fields in skill management responses.
- ff158aa: Align tool cards with skill cards using fixed heights, truncated text, and title links without hover underlines. Remove scope and source from tool cards and details.
- ff158aa: Organize tool details into labeled About, Description, and Input schema sections, and remove the redundant read-only schema hint.
- ff158aa: Present tools as a compact single-column directory with whole-row detail triggers, responsive identifiers, localized result counts, and two-line plain-text introductions. Preserve keyboard focus and existing detail drawers.
- ff158aa: Include tool introductions in management summaries and display and search the about field instead of the model-facing description in tool cards.
- ff158aa: Support package-owned i18n metadata for Tools and Skills, preserving English source text for model execution while translating display titles, Tool introductions, and Skill descriptions. Localize built-in resources in English and Chinese, sort catalogs by localized titles in the current locale with stable name tie-breakers, and document Client locale ownership and exact source-text keys.
- Updated dependencies [ff158aa]
- Updated dependencies [ff158aa]
- Updated dependencies [ff158aa]
- Updated dependencies [ff158aa]
  - @nocobase/ai-employee@0.2.0-beta.7

## 0.1.0-beta.18

### Patch Changes

- 8f5eacf: Document a configuration readiness gate for embedded AI chat so the first message can be sent after initial navigation or refresh without switching employees or models. Include complete integration examples, actionable loading and unavailable states, and first-send verification steps.
- 8f5eacf: Document conversation history response fields, stable message identifiers, pagination, nullability, and authenticated HTTP examples. Clarify the current SSE response limitation for non-streaming execution and distinguish history rows from message inputs and server agent results.
- 8f5eacf: Fix AI conversation keyword searches failing with a SQL binding error. Use native repository substring filters with literal wildcard escaping while preserving user and scope isolation and conversation ordering.
- 8f5eacf: Fix missing knowledge base options in the AI employee editor by using the knowledge base plugin's AI API route. Exclude disabled knowledge bases from the available options.
- 8f5eacf: Use the shared Dialog and Button components for the LLM model editor so backdrop clicks and Escape dismiss it, focus is managed and restored, and modal styling matches the application's component library.

  Use a searchable multi-select Combobox for provider models, with selected chips and the search input inside the same field. Filter by model label or ID, preserve selections while searching, and portal the options outside the editor's scroll container with viewport-aware list scrolling. Escape closes the picker before the editor.

  Show localized loading and empty states while discovering LLM services instead of leaving the settings table blank.

## 0.1.0-beta.17

### Patch Changes

- 64b3fdb: Integrate source-qualified database authorization and native relation policies with AI data services. Preserve explicit route group extensions, translated resource search, Hub ownership checks, API key cleanup, and protected permission-set assignments across user deletion. Update shared application guidance for the split authorization plugins.
- 64b3fdb: Remove Refine from client authorization checks. Use `AuthorizationClient.can({ resource, action })` instead of the removed two-argument signature, and import `useCan` from `@nocobase/app-plugin-authorization/client`. Migrate page guards, navigation, and notification visibility while preserving session isolation and realtime permission invalidation.

  Remove the Refine access-control configuration and legacy global authorization client accessors. Resolve the application-owned client through `useAuthorizationClient()` or `authorizationClientToken`. Settings actions now revoke stale access immediately; route checks no longer bypass the authorization page or translate Refine CRUD action names.

  Unify route authorization under `authz: 'skip' | { resource: { type, id }, action }`. Normalize default rules during registration and share them across page guards, navigation, permission discovery, and inspection. Remove the legacy `access` field and string resource adapter.

  Limit settings action checks to the actions each page uses, keep the permission-set action helper internal, and avoid rebuilding navigation twice when selecting a route.

- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [fe564d9]
- Updated dependencies [fe564d9]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
  - @nocobase/app-client@1.0.0-beta.19
  - @nocobase/app-plugin-authorization@0.2.0-beta.15
  - @nocobase/app-server@1.0.0-beta.21
  - @nocobase/app-plugin-authentication@0.1.0-beta.18
  - @nocobase/ai-employee@0.2.0-beta.6
  - @nocobase/caching@0.1.0-beta.2
  - @nocobase/db@1.0.0-beta.11
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.16

### Patch Changes

- e13ed84: Make development logs concise and application-scoped while retaining structured file diagnostics. Route configuration and authentication diagnostics through application logging, reduce routine startup and request noise, distinguish optional AI Skill directories from missing configured paths, and align development console settings across templates. Document that deployed applications need rebuilding to adopt the current logging protocol.
- Updated dependencies [e0c4b3d]
- Updated dependencies [e13ed84]
- Updated dependencies [e13ed84]
- Updated dependencies [e13ed84]
- Updated dependencies [00362cf]
- Updated dependencies [e13ed84]
- Updated dependencies [e13ed84]
  - @nocobase/db@1.0.0-beta.10
  - @nocobase/app-server@1.0.0-beta.19
  - @nocobase/logging@0.1.0-beta.5
  - @nocobase/app-plugin-authentication@0.1.0-beta.18
  - @nocobase/app-client@1.0.0-beta.18
  - @nocobase/ai-employee@0.2.0-beta.6
  - @nocobase/caching@0.1.0-beta.2
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1
  - @nocobase/app-plugin-authorization@0.2.0-beta.13

## 0.1.0-beta.15

### Minor Changes

- ec93611: Add discoverable data metadata, permission-scoped queries, and business analysis report skills for AI employees. Validate report charts on the server and render only confirmed report results. Reapply session restrictions to activated tools and include runtime skill assets in compiled deployment output.

### Patch Changes

- 365a9fe: Complete English and Chinese translations for authentication, route feedback, authorization, shared controls, File and Notification Registry components, and development examples. Use concise semantic keys consistently for the new translations. Resolve AI Registry copy from the active language and localize development navigation and section headings. Translate MCP configuration guidance, tool drawer labels, and transport descriptions.
- d4ca00e: Use useApiClient() for React API client access across application pages, plugins and shared examples, preserving application-scoped client resolution.
- Updated dependencies [d4ca00e]
- Updated dependencies [365a9fe]
- Updated dependencies [365a9fe]
- Updated dependencies [60fa139]
- Updated dependencies [24e771f]
- Updated dependencies [60fa139]
- Updated dependencies [26ac480]
  - @nocobase/app-client@1.0.0-beta.18
  - @nocobase/app-plugin-authorization@0.2.0-beta.13
  - @nocobase/app-plugin-authentication@0.1.0-beta.17
  - @nocobase/db@1.0.0-beta.9
  - @nocobase/app-server@1.0.0-beta.18
  - @nocobase/ai-employee@0.2.0-beta.6
  - @nocobase/caching@0.1.0-beta.2
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.14

### Patch Changes

- 028dd7c: Use host-provided peers for shared database types, authorization errors, service tokens, cache registries, and repository filter metadata. Declare their production providers in all application templates so deployments with automatic peer installation disabled retain the required runtime packages. Document the provider contract for generated plugins.

  Existing applications upgrading these packages must add compatible versions of their required shared peers to production dependencies: @nocobase/db, @nocobase/service-provider, @nocobase/repository-input, @nocobase/authorization, @nocobase/caching, @nocobase/i18n, and @nocobase/queue for the standard server stack, plus @nocobase/ai-employee when using its plugin. Update the lockfile and verify the production install; peer declarations do not remove incompatible historical versions automatically.

- Updated dependencies [028dd7c]
  - @nocobase/ai-employee@0.2.0-beta.6
  - @nocobase/app-client@1.0.0-beta.17
  - @nocobase/app-plugin-authentication@0.1.0-beta.16
  - @nocobase/app-server@1.0.0-beta.17
  - @nocobase/db@1.0.0-beta.8

## 0.1.0-beta.13

### Patch Changes

- 9131230: Use plugin-owned PageContainer and PageHeader components to unify AI component demo and in-app inbox page layouts.

## 0.1.0-beta.12

### Patch Changes

- 6acf3bc: Use plugin-owned PageContainer and PageHeader components to standardize AI settings page spacing and headings.
- d927494: Fix development startup of generated Hub applications by selecting the App Host launcher from the loaded package format, preserving source development in the workspace and using compiled JavaScript in installed packages. Keep the optional application configuration commented out so an empty YAML section cannot override application identity defaults during production startup. Correct the AI Employee plugin Skill namespace so generated applications can synchronize their registered plugins' Skills.
- 89955c5: Upgrade better-sqlite3 to ^13.0.3 and keep its dependency declaration in @nocobase/db-sqlite only. Remove redundant test dependencies from consumers so they use the same SQLite driver as applications.

  Preserve the bundled musl binary when building applications for Alpine Linux.

- Updated dependencies [89955c5]
  - @nocobase/app-plugin-authentication@0.1.0-beta.15
  - @nocobase/app-server@1.0.0-beta.15
  - @nocobase/db@1.0.0-beta.7

## 0.1.0-beta.11

### Patch Changes

- 11c276a: 将 AI Employee Plugin Skill 移至插件标准的 `skills/` 源目录，确保发布包可以包含并同步该 Skill。

  Move the AI Employee Plugin Skill into the plugin-standard `skills/` source directory so it can be included in the published package and synchronized correctly.

## 0.1.0-beta.10

### Patch Changes

- 1c70f60: Persist AI employee collection field metadata so Oracle returns booleans and integers with their logical types. Let the database query layer encode and decode JSON once, and use a round-trippable name for the default LLM service field. This changes initialization definitions and requires recreating development databases initialized with the previous definitions.
- a60decd: Require an explicit absolute baseDir for Server plugins and resolve migrations, seeds, jobs, and package metadata from the loaded plugin copy. Generate and validate database task manifests during builds so TypeScript and JavaScript share source checksums, with verified legacy JavaScript history conversion and synchronized plugin scaffolding and application templates.
- 1a85a86: Add breadcrumb labels to plugin routes so nested pages show their navigation path.
- e067113: Depend on one zod major, so a deployment can resolve better-auth

  An application that installed both the AI employee plugin and the API keys plugin failed to start with `z.ipv4 is not a function`, thrown while loading `@better-auth/core`. Nothing in better-auth was wrong: the AI employee packages asked for `zod: ^3` while better-auth asks for `^4`, and a deployment installs `dist/` with `nodeLinker: hoisted`, where one version of a package takes the root slot and the rest are nested underneath whoever depends on them. zod 3 won the root, which forced better-auth's whole subtree to be nested, and a `@better-auth/core` that ended up next to the root zod bound to the wrong major.

  The same collision has a second failure mode that is harder to read. `@better-auth/api-key` declares `@better-auth/core`, `better-call`, `jose`, `kysely` and `nanostores` as peer dependencies, and a deployment sets `autoInstallPeers: false` so it installs none of them. It works anyway when better-auth's dependencies hoist to the root, because the peers are then sitting where the resolver looks; it stops working the moment the zod conflict pushes them down into `node_modules/better-auth/node_modules`, and the application fails with `Cannot find package '@better-auth/core'`.

  So the fix is not to declare better-auth's internals somewhere. `@nocobase/ai-employee` never imported zod at all and no longer declares it, `@nocobase/app-plugin-ai-employee` moves to zod 4, and all three templates and the plugin now take it from the `zod` catalog entry, so one version is what an application gets. Its schemas use `z.object`, `z.string`, `z.number`, `z.array`, `z.record`, `z.coerce`, `z.any` and `z.unknown`, all of which carry over unchanged; `buildStandardAgentMiddleware` gained an explicit `AgentMiddleware[]` return type, which the new resolution made necessary.

  A deployment tree now holds a single `zod` and a single `@better-auth/core`, hoisted to the root where `@better-auth/api-key` resolves them.

- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [a60decd]
- Updated dependencies [1a85a86]
- Updated dependencies [1c70f60]
- Updated dependencies [63db898]
- Updated dependencies [e067113]
  - @nocobase/app-server@1.0.0-beta.15
  - @nocobase/db@1.0.0-beta.7
  - @nocobase/app-plugin-authentication@0.1.0-beta.14
  - @nocobase/app-client@1.0.0-beta.16
  - @nocobase/ai-employee@0.2.0-beta.5
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.9

### Patch Changes

- 154e09e: Treat a credential Better Auth refuses — an expired or revoked API key — as not signed in when resolving the caller, instead of failing the request.
- Updated dependencies [154e09e]
- Updated dependencies [154e09e]
- Updated dependencies [c01baf6]
  - @nocobase/app-plugin-authentication@0.1.0-beta.12
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/app-client@1.0.0-beta.15
  - @nocobase/app-server@1.0.0-beta.13

## 0.1.0-beta.8

### Patch Changes

- a2dbe54: Publish only the compiled `dist/database`, no longer the TypeScript sources beside it. The runtime resolves a plugin's declared `database/migrations` and `database/seeds` against the package directory first and its `dist` second, so an installed plugin that shipped both served the sources, and Node refuses to strip types from a file under `node_modules`: `@nocobase/app-plugin-ai-employee` failed every application start with `Stripping types is currently unsupported for files under node_modules` while every development checkout, which resolves the same sources outside `node_modules`, kept working.

## 0.1.0-beta.7

### Minor Changes

- 6d43421: Identify `ai.aiKnowledgeBase.vectorDatabases` entries by `key` instead of `name`. This is a breaking change to the application configuration contract: `key` is now required and must be unique within one configuration, and `name` is now optional.

  `key` is the stable identifier of a record — the knowledge-base plugin matches existing records by it when synchronizing declarative configuration, and its settings page lists it as the UID. `name` is only a display title, shown as the Title, and falls back to `key` when omitted, so two entries may share the same name.

  A configuration written against the previous contract fails to typecheck until each entry's `name` is renamed to `key`. Keep `name` alongside it only when a separate display title is wanted.

### Patch Changes

- be92e2b: Use the NocoBase AI chat mark for the floating AI employee chat entry instead of the generic `lucide-react` `Bot` glyph on a solid primary square. The trigger now shows the same brand artwork the Portal template uses for this entry.

  The mark ships as an inlined `NocoBaseAIChatIcon` React component under `shared/icons/` rather than an `.svg` asset import. Registry source is copied into an application and typechecked with plain `tsc`, so an asset import would require shipping a `declare module '*.svg'` declaration into every consuming application alongside it.

- 6d43421: Add a `#` row-number column to the LLM service table, matching the MCP table. Both settings tables now open with the same fixed-width centered index column before the UID.
- 6d43421: Fix the LLM service model dialog overlay leaving the page header uncovered. Its backdrop had no `z-index`, so the surface layout's `sticky z-40` header painted over it and stayed interactive while the dialog was open. It now sits at `z-50`, matching every other dialog in the plugin.
- Updated dependencies [1d5ee9a]
- Updated dependencies [1d5ee9a]
- Updated dependencies [1d5ee9a]
- Updated dependencies [211538b]
- Updated dependencies [1d5ee9a]
- Updated dependencies [1d5ee9a]
  - @nocobase/app-server@1.0.0-beta.12
  - @nocobase/db@1.0.0-beta.6
  - @nocobase/app-plugin-authentication@0.1.0-beta.11
  - @nocobase/app-client@1.0.0-beta.14
  - @nocobase/i18n@1.0.0-beta.3
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.6

### Minor Changes

- f17f3a6: Provide editable TypeScript defaults for application modules, assembled by the runtime before services start. Module factories receive the runtime with application paths and plugin metadata; deployment files and environment variables override defaults, and configuration reload preserves code defaults.

  Keep deployment settings in YAML examples and reserve explicit environment overrides for secrets and startup integration. Simplify application configuration loading, merging and reload subscriptions.

  Align client configuration assembly with the server: runtime merges application TypeScript defaults beneath public configuration before services start. Client inspection reports the application configuration entry.

### Patch Changes

- d566dde: Add a read-only MCP settings page backed by declarative `config.yml` configuration, with connection testing and tool inspection.
- c8f8a93: Keep assistant messages, tool messages, and tool-call persistence atomic behind encapsulated conversation provider implementations.
- d566dde: Register AI Employees and Tools explicitly from server-side resource aggregators, and load plugin and configured Skills from `SKILL.md` directories.
- c8f8a93: Expose `AIConversationsManager` through the server service container and allow conversation creation without an AI employee for AgentServiceFactory integrations.
- ceb356b: Fix published package metadata and database test driver registration.
- c8f8a93: Simplify AI employee chat message converters and expose the renamed conversion contract.
- c8f8a93: Resolve and authorize message attachments once at the provider formatting boundary, and remove the obsolete message normalization contract.
- c8f8a93: Keep conversation thread updates private to the conversation message store implementation.
- c8f8a93: Consolidate AI employee tool policy behavior into the chat context provider.
- c8f8a93: Avoid redundant message conversions when resuming an interrupted sub-agent conversation.
- c8f8a93: Consolidate AI employee tool-call persistence behind the conversation tool-call handler.
- 28132fd: Forward web search selections, complete execution context for AI employee tools, and recognize DeepSeek's `deepseek-flash` model as web-search capable.
- d566dde: Fix the AI employee custom Skill menu and include App-root custom Skills for verification.
- 28132fd: Fix AI employee tool-call resume by loading persisted human decisions correctly and forwarding frontend tool results through the request execution context.
- c8f8a93: Declare AI employee chat context dependencies explicitly and inject direct repository contracts.
- c8f8a93: Consolidate conversation thread operations into the message store contract and use explicit method names.
- c8f8a93: Simplify agent provider boundaries by calculating request-derived details at their use sites and moving conversation persistence ownership out of the employee runtime.
- c8f8a93: Merge tool-call persistence into the conversation message store and clarify its operation names.
- c8f8a93: Refine AI employee conversation dependencies around concrete repositories, checkpoint savers, and default message and tool-call handlers.
- c8f8a93: Persist normalized LLM usage events with AI conversation messages in the same transaction.
- c8f8a93: Use the concrete LLM stream cache contract and inject logging directly into agent providers and middleware.
- c8f8a93: Refactor agent execution around request-local LLM resolution, dedicated chat context and message converter providers, dynamically activated skill tools, and a unified tool-call policy.
- c8f8a93: Consolidate AI employee server types and colocate the AI employee runtime under the agent module.
- c8f8a93: Remove the unused agent provider override layer and require explicit provider composition.
- c8f8a93: Remove the empty recommended-model mechanism and use explicit provider or custom model configuration.
- c8f8a93: Simplify the AI employee agent service API and preserve cancelled tool-call continuation messages.
- c8f8a93: Refactor AI employee execution around an execution-scoped `DiscoveredTools` result, request-selected LLM models, and a simplified system prompt contract.
- c8f8a93: Move response metadata collection and cleanup into each AgentService stream execution and narrow the chat context and resolved LLM contracts.
- c8f8a93: Encapsulate conversation thread reads and updates in AIChatConversation while preserving transactional message persistence.
- Updated dependencies [d566dde]
- Updated dependencies [d566dde]
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
- Updated dependencies [28132fd]
- Updated dependencies [e11b855]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
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
- Updated dependencies [c8f8a93]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c8f8a93]
- Updated dependencies [ceb356b]
- Updated dependencies [c8f8a93]
  - @nocobase/ai-employee@0.2.0-beta.4
  - @nocobase/app-server@1.0.0-beta.11
  - @nocobase/app-client@1.0.0-beta.14
  - @nocobase/app-plugin-authentication@0.1.0-beta.11
  - @nocobase/db@1.0.0-beta.5
  - @nocobase/logging@0.1.0-beta.4

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
  - @nocobase/app-plugin-authentication@0.1.0-beta.9

## 0.1.0-beta.4

### Minor Changes

- dc517b1: Add typed application configuration schemas for declarative AI knowledge-base vector databases and manifest sources.

### Patch Changes

- 0811f18: Localize the LLM service table, model editor, model search, controls, and accessibility labels in English and Chinese.
- 7057ee0: Remove the internal aggregate runtime context, pass explicit route and service inputs, and remove legacy task conversations.
- Updated dependencies [d29d1fe]
- Updated dependencies [dc517b1]
- Updated dependencies [5281fd1]
  - @nocobase/app-server@1.0.0-beta.8
  - @nocobase/ai-employee@0.2.0-beta.3
  - @nocobase/drive@0.1.0-beta.4
  - @nocobase/app-plugin-authentication@0.1.0-beta.8
  - @nocobase/app-client@1.0.0-beta.11
  - @nocobase/db@1.0.0-beta.3
  - @nocobase/i18n@1.0.0-beta.2
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.3

### Patch Changes

- 90a4903: Replace the composite application transport with application-owned `ApiClient` and `RealtimeClient` services. Client plugins, examples, and application templates now use object-style HTTP request options through the shared API client, while realtime subscriptions resolve their dedicated WebSocket client.
- 90a4903: Preserve configured API and realtime endpoints after splitting the client services. Integrate file inventory and the plugin-owned inbox with the shared API and realtime clients, including reconnection refresh and isolated event listeners.

  Allow the Oracle driver install script in both templates’ standalone deployment workspace settings.

  Resolve SQLite auto-incrementing bigint metadata correctly, narrow Oracle LOB values before reading their type, preserve legacy file timestamps, and rebuild the AI registry against the current API client.

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
