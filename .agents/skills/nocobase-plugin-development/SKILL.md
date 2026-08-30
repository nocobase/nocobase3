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
`docs/development/plugin-development.md`. Read only the relevant topic page
for the current task:

| Task                                     | Read                                       |
| ---------------------------------------- | ------------------------------------------ |
| Create and register a plugin             | `quick-start.md`, `plugin-registration.md` |
| Implement a complete business plugin     | `development-workflow.md`                  |
| Choose an App or cross-plugin entry      | `public-contracts.md`                      |
| Client UI, routes, providers, options    | `client.md`                                |
| Server services, routes, providers, jobs | `server.md`                                |
| Migrations and seeds                     | `database.md`                              |
| Write Plugin Skills for an App Agent     | `skills.md`                                |
| Test, build, and verify                  | `testing.md`                               |

For every HTTP or browser Route task, read `routes.md` first. It covers all four
Route APIs as one cross-runtime topic. For `defineRootRoutes()` or
`defineApiRoutes()`, also read `server-routes-examples.md`. For
`defineAppRoutes()` or `defineSettingsRoutes()`, also read
`client-routes-examples.md`. Read `client.md` or `server.md` only when the task
also changes bootstrap, Providers, options, Services, Jobs, or composition.
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
  `server.routes`, `server.jobs`, `client.routes`, `client.components`,
  `client.providers`, `client.bootstrap`, `registry`, and `skills`.
- The first Create Plugin workflow creates plugins only in a NocoBase source
  workspace. It does not create a standalone plugin project inside an App.
- Keep the runtime-aware shared development configuration emitted by
  `plugin:create`: Browser-only plugins use the client library preset without
  a Node runtime declaration, Server-only plugins use the server library and
  Node ESLint presets, and full-stack plugins add DOM/JSX locally to the server
  library preset. Do not copy a complete config from another package.
- Client entries are only `bootstrap`, `routes`, and `providers`; all are
  optional and lazy-loaded.
- Settings pages are routes declared with `defineSettingsRoutes()`; there is no
  fourth `settings` loader or `client/settings.ts` runtime contract.
- Keep Client page components behind lazy `componentLoader()` functions. Use a
  Route component override to replace a plugin page; do not redeclare its Route.
- Server Routes are direct contributions passed to `defineServerPlugin()`; do
  not write a Server route loader.
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
- Run `plugin:inspect <name> --json` after registration changes. It is
  read-only and checks only static package, metadata, composition, and Skill
  state; it does not prove Route security, runtime behavior, tests, or builds.
- Run the target App's `server:inspect --json` when Server contributions are
  involved. Check `issues`: the command imports declaration modules and reports
  plugin order, best-effort Provider constructor names, Route scopes, Database
  sources, and Job locations. It does not inspect runtime Provider, Route,
  database, or Job behavior.
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
6. Preview registration with `--dry-run --json`, apply it, then run the
   read-only `plugin:inspect <name> --json`. The plugin's
   `<plugin>/skills/` is the source of truth; do not edit the App's synchronized
   `.agents/skills/` copy.
7. Run the plugin's lint, typecheck, test, and build. Run target-App
   `client:inspect --json` when Client contributions are involved and
   `server:inspect --json` when Server contributions are involved, then the
   relevant App typecheck, test, build, and runtime checks.

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
