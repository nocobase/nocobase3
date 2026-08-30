---
name: nocobase-plugin-development
description: 'Develop and maintain NocoBase v3 application plugins in a source workspace using packages/app-plugin-*, plugin:create, explicit Client and Server contributions, Plugin Skills, and target App registration. Use when creating or changing a plugin in a workspace containing packages/create-plugin, packages/app-client, and packages/app-server-kit. Do not use for legacy NocoBase v2 plugin workspaces.'
---

# NocoBase Plugin Development

Use this Skill only for the v3 plugin architecture in the current source
workspace. It is a routing and safety layer; the detailed, versioned guidance
lives under `docs/development/plugin-development/`.

## Verify the workspace

Before changing files, confirm the workspace contains:

```text
packages/create-plugin/
packages/app-client/
packages/app-server-kit/
pnpm-workspace.yaml
```

If the project instead uses `packages/plugins/`, `src/client-v2/`,
`nb scaffold plugin`, or the legacy `Plugin` class, do not apply this Skill.
That is a different plugin protocol.

Always read the repository `AGENTS.md` first, then read
`docs/development/plugin-development/README.md`. Read only the relevant topic page
for the current task:

| Task                                 | Read                                       |
| ------------------------------------ | ------------------------------------------ |
| Create and register a plugin         | `quick-start.md`, `plugin-registration.md` |
| Implement a complete business plugin | `development-workflow.md`                  |
| Choose an App or cross-plugin entry  | `public-contracts.md`                      |
| Choose a Client module               | `client.md`                                |
| Build public or internal Client UI   | `client-components.md`                     |
| Share React Context                  | `client-providers.md`                      |
| Add imperative Client initialization | `client-bootstrap.md`                      |
| Choose a Server module               | `server.md`                                |
| Choose a Service/Token/Provider      | `server-services-and-providers.md`         |
| Implement Provider lifecycle         | `service-provider.md`                      |
| Apply Token/Container patterns       | `service-token-examples.md`                |
| Add asynchronous work                | `server-jobs.md`                           |
| Choose a database operation          | `database.md`                              |
| Change schema                        | `database-migrations.md`                   |
| Add required initial records         | `database-seeds.md`                        |
| Add Client or Server translations    | `i18n.md`                                  |
| Choose an App-owned Registry item    | `registry.md`                              |
| Build, publish, or upgrade Registry  | `plugin-registry.md`                       |
| Write Plugin Skills for an App Agent | `skills.md`                                |
| Test, build, and verify              | `testing.md`                               |

For every HTTP or browser Route task, read `routes.md` first. It covers all four
Route APIs as one cross-runtime topic. For `defineRootRoutes()` or
`defineApiRoutes()`, also read `server-routes-examples.md`. For
`defineAppRoutes()` or `defineSettingsRoutes()`, also read
`client-routes-examples.md`. Read `client.md` or `server.md` to choose an
adjacent module, then read only that module's page rather than loading every
Client or Server guide.
Inspect only the matching files in `packages/app-plugin-routes-example` when a
runnable reference is needed.

## Stable v3 protocol

- Create new plugins under `packages/app-plugin-<name>/` with
  `pnpm plugin:create`; do not use `nb scaffold plugin`.
- `plugin:create` has no implicit plugin shape. Select one or more explicit
  capabilities with repeatable `--with`, or use `--empty` for only the package
  foundation. Prefer `--dry-run --json` before creation. In JSON mode, branch
  on `ok`; recover from failures by using `error.code` and
  `error.suggestions`, while still treating the non-zero exit code as failure.
- The public creation capabilities are `database`, `server.providers`,
  `server.routes`, `server.jobs`, `server.locales`, `client.routes`,
  `client.components`, `client.providers`, `client.bootstrap`,
  `client.locales`, `registry`, and `skills`.
- The first Create Plugin workflow creates plugins only in a NocoBase source
  workspace. It does not create a standalone plugin project inside an App.
- Keep the runtime-aware shared development configuration emitted by
  `plugin:create`: Browser-only plugins use the client library preset without
  a Node runtime declaration, Server-only plugins use the server library and
  Node ESLint presets, and full-stack plugins add DOM/JSX locally to the server
  library preset. Do not copy a complete config from another package.
- Client runtime contribution entries are only `bootstrap`, `routes`, and
  `providers`; all are optional and lazy-loaded. `locales` is an optional
  resource declaration on both Client and Server plugins, not another UI
  contribution. Its namespace is always the plugin `packageName`.
- Locale scaffolding is explicit. Select `client.locales` for Client resources
  and `server.locales` for Server resources; select both when both runtimes own
  translated messages. Routes, Providers, and Bootstrap do not implicitly add
  locale files.
- Public Client components rendered outside their owning plugin tree must bind
  their namespace explicitly. Binding does not register resources: a
  component-only package either leaves copy to the App or exposes and registers
  a locales-only `./client` plugin factory. Request-external messages must
  choose the recipient locale, load it, and then use a fixed translator; do not
  inherit a triggering user's request locale.
- Client Components are source or public exports, not a fourth runtime
  contribution. Use Routes for pages, Providers for shared React Context, and
  Bootstrap only for imperative Client initialization.
- Settings pages are routes declared with `defineSettingsRoutes()`; there is no
  fourth `settings` loader or `client/settings.ts` runtime contract.
- Keep Client page components behind lazy `componentLoader()` functions. Use a
  Route component override to replace a plugin page; do not redeclare its Route.
- Server Routes are direct contributions passed to `defineServerPlugin()`; do
  not write a Server route loader.
- Define a Service contract and owner-created Token before a public or shared
  implementation. Consumers import the original Token; Providers register and
  manage lifecycle, Routes own HTTP, and Jobs own asynchronous orchestration.
- Write a small Server Route directly in its contribution factory. Extract a
  `createXxxRoutes(options): Hono` only for a coherent, complex child router;
  do not export a `registerXxxRoutes(router, ...)` helper merely for testing.
- Test the production Server contribution through `createRouter()`. Every
  Server Route owns and tests an explicit security policy. Authenticated Routes
  install their own authentication and authorization; intentionally public
  callbacks document and test their protocol-specific boundary. Never rely on
  another contribution or on current composition order for protection.
- Register Client and Server definitions explicitly in the target App's
  `client/plugins.ts` and `server/plugins.ts`.
- Prefer lifecycle commands with `--json`. Branch on `ok` and `status`; treat
  `success-noop`, `partial-success`, and `requires-installation` as distinct
  outcomes, and use `error.code` plus the non-zero exit code for failures.
- Inspectors are optional, read-only composition diagnostics. Use
  `plugin:inspect <name> --json` after registration changes, and use the
  matching Client or Server Inspector only when composition changed or when
  diagnosing why a declaration is unavailable. Do not run every Inspector by
  default. A clean result means only that the structural facts observed by that
  command were readable and consistent; it does not verify implementation,
  runtime behavior, Route security, locale content, tests, or builds.
- When an Inspector is useful, read `ok` and `status`, then `consistent`,
  `issues`, and `suggestions`. `server:inspect --json` reports declaration and
  resolved-location facts without executing Provider, Route, locale, database,
  or Job behavior. `client:inspect --type locales --json` imports Client plugin
  declarations without executing Route, Provider, or locale factories and does
  not inspect locale names, keys, translations, fallback, or language switching.
- Keep `server/plugin.ts` and the declaration modules it imports free of runtime
  startup side effects. Inspection imports these modules even though it does
  not instantiate Providers, execute Route factories, or load Job modules.
- `package.json#nocobase.plugins` is management metadata for install, CLI,
  build/watch, and Skills synchronization. It is not runtime discovery.
- `exports["./client"]` and `exports["./server/plugin"]` are the Client and
  Server registration criteria respectively; keep source and publish exports
  aligned.
- Plugin-owned App integration knowledge belongs in the plugin's top-level
  `skills/` and is synchronized to the App's `.agents/skills/` for the App
  Agent. The App's entire `.agents/` directory is ignored local output: never
  commit it or use it as a source of truth. It is not runtime code and is not
  plugin-source development guidance.
- Use `packages/app-plugin-skills-example` as the minimal normative Plugin
  Skill reference. A public Client component subpath export does not require a
  `./client` runtime entry or Client plugin registration. Verify Skill claims
  through observable target-App behavior, not only synchronized file equality.
- Tests belong under the plugin-root `tests/` directory.
- Migrations are immutable historical records: make them explicit,
  deterministic, self-contained, and never import live runtime schemas.
- Seeds insert required initial records into schema established by Migrations;
  they are not schema operations, user data, demo records, or test fixtures.
- Registry items materialize Client source into an App. The plugin owns the
  canonical recipe; the App owns the installed copy and merges upgrades. A
  Registry item is not a runtime contribution and does not enable the plugin.
- Follow repository and package `AGENTS.md` rules, including shared dev config,
  dependency protocols, and validation requirements.

## Safe implementation loop

1. Inspect workspace status, target plugin, target App, package metadata,
   exports, current declarations, composition roots, tests, and existing
   examples. Preserve unrelated user changes.
2. Translate the requirement into ownership and capabilities: Client, Server,
   Database, Queue, Plugin Skills, and optional Registry.
3. Define the smallest public contract before implementing: typed Client
   options or exports, Server ServiceTokens/APIs, permissions, errors, and
   observable verification results.
4. Implement in the owning plugin. Keep domain logic in Services, HTTP logic
   in Routes, asynchronous orchestration in Jobs, and App prerequisites in
   Plugin Skills.
5. Keep declarations, source/publish exports, dependencies, `files`, tests,
   README, and Skills consistent when a contribution changes.
6. Preview registration with `--dry-run --json` and apply it. When registration
   state is unclear, use `plugin:inspect <name> --json` as a read-only snapshot
   of the static registration and composition facts. The plugin's
   `<plugin>/skills/` is the source of truth; do not edit the App's synchronized
   `.agents/skills/` copy.
7. Run the plugin's lint, typecheck, test, and build, then the relevant App
   typecheck, test, build, and runtime checks. After a composition change, the
   matching Client or Server Inspector may provide a read-only composition
   snapshot; it is not a completion gate and does not explain or test behavior.

Do not run scaffold, registration, enablement, migration, or other stateful
commands merely because this Skill applies. Perform those actions only when
the user's requested implementation requires them and the relevant plan and
scope are clear.

## Completion gate

Consider the task complete only when the requested behavior is owned by the
correct plugin, unused scaffold examples are removed, declarations and
exports match the implementation, behavior tests cover the change, the target
App registration is correct, and App-facing capability changes are reflected
in Plugin Skills and synchronized when in scope. Report commands run, results,
assumptions, skipped checks, and remaining limitations.
