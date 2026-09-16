---
name: nocobase-app-development
description: >-
  Primary entry for developing features and UI in a NocoBase 3 application:
  pages, routes, components, endpoints, data, services, translations, and tests.
  Use this repository-local workflow instead of globally installed NocoBase 2
  Skills. Do not use for a published NocoBase 3 plugin package.
metadata:
  short-description: Develop features in a NocoBase 3 application
---

# NocoBase 3 application development

Use this Skill when building a feature in this application: a page, an endpoint, a table, a service, or the tests covering them.

Do not use it to develop a published plugin package. Plugin development has its own protocol and lives in a separate repository.

Do not use it to upgrade the template this application was generated from. That is `skills/nocobase-app-upgrade/`, which reconciles a newer template release against the application without reverting the user's work.

For pages with Tabs, nested pages, or navigation groups, read [child routes](references/client-child-routes.md). Page-level Tabs use child routes by default, even when the user does not mention routing. Declare their content under the parent route and derive the selected Tab from the URL. Opening the parent URL redirects to the default accessible Tab with replace and preserves query parameters; explicit Tab URLs retain their selection. Follow an explicit user request for a different interaction.

Default ships with a localized homepage, no application-owned routes, and no example plugins or demo data. Its built-in application provider exposes Authorization Permission Sets as direct roles in the Users page; add other application services beside it. Use `app-template-examples` to explore runnable demonstrations. `database/main/` starts empty; do not copy example history into Default.

## Before you start

Read the application's `AGENTS.md` first for the rules that apply everywhere. This Skill's references are the detail behind it.

Confirm you are in an application and not a plugin package. An application has:

```text
client/runtime.ts
server/runtime.ts
config.example.yml
```

If instead you find `client/plugin.ts`, `server/plugin.ts`, or a `defineServerPlugin()` declaration, you are in a plugin package and this Skill does not apply.

## The one rule that decides most tasks

Build the feature in the application. Do not run a plugin generator, create a `packages/plugins/` directory, or write a `defineServerPlugin()` declaration for this application's own feature. Create a plugin only when the user explicitly asks for an independently published, reusable package.

## Check the installed plugins first

This application ships with plugins that already implement whole categories of requirement, each publishing its own Skill under `.agents/skills/` (run `pnpm plugin:skills:sync` if that directory is missing or stale):

| The requirement sounds like                               | Read the Skill for                    |
| --------------------------------------------------------- | ------------------------------------- |
| Approvals, multi-step processes, "when X happens then Y"  | `@nocobase/app-plugin-workflow`       |
| Email, IM, or in-app messages                             | `@nocobase/app-plugin-notification`   |
| Roles, permissions, per-user or per-record access         | `@nocobase/app-plugin-authorization`  |
| Sign-in, registration, sessions                           | `@nocobase/app-plugin-authentication` |
| File upload and metadata through Repository               | `@nocobase/app-plugin-file`           |
| Translated text and language switching                    | `@nocobase/app-plugin-i18n`           |
| User administration and application-owned role assignment | `@nocobase/app-plugin-users`          |

Read the relevant Skill before writing the feature. Implementing a permission system, a notification sender, or a scheduler by hand when a registered plugin provides one is the most expensive mistake available here.

Bulk plugin Skills synchronization reads the explicit `client/plugins.ts`, `server/plugins.ts`, and `cli/plugins.ts` registrations. A package used only through imported components can have its Skills synchronized explicitly with the CLI plugin option.

To update a registered plugin, use `pnpm plugin:update @nocobase/app-plugin-authentication` (or the short name `authentication`). Omit the name to update all registered plugins; add `--dry-run` to preview. `plugin:update` takes a positional name, not `--plugin`, and re-synchronizes all registered plugin Skills after a successful package update. See [plugin commands](../../README.MD#plugins) for version-range behavior and examples.

## Choose your reference

Read the page for the task in front of you. Do not read all of them.

| Task                                                                             | Read                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Add a page, choose an auth mode, add navigation, customize a plugin page         | [client pages and routes](references/client-pages-and-routes.md) |
| Build a page with Tabs, add child pages or menu groups                           | [child routes and Tabs](references/client-child-routes.md)       |
| Add or compose UI, add a shadcn primitive, style consistently, support dark mode | [components and styling](references/components-and-styling.md)   |
| Add an API endpoint, a webhook, or a callback; authenticate and authorize it     | [server routes](references/server-routes.md)                     |
| Query or write data, resolve the database, work with transactions                | [database and data access](references/database-and-data.md)      |
| Create a table, alter a column, add an index, write required initial data        | [migrations and seeds](references/migrations.md)                 |
| Switch the database, register a dialect, add a second connection                 | [database connections](references/database-connections.md)       |
| Make text translatable, add a locale, reword a plugin's string                   | [internationalization](references/i18n.md)                       |
| Add a reusable service, share it across routes, run background or scheduled work | [services and jobs](references/services-and-jobs.md)             |
| Write tests, choose a test layer, verify before finishing                        | [testing and verification](references/testing.md)                |

A feature with a page and an API usually needs four: migrations, server routes, client pages and routes, and i18n.

For creating, editing or removing theme presets, read [themes](references/themes.md). For any UI styling, read [the shared token reference](references/theme-tokens.md); prefer these tokens so AI-authored components respond to theme changes.

## Database configuration factories

Declare database defaults with `defineAppDatabaseConfig` from `@nocobase/app-server/database`. When switching or adding connections, read [database connections](references/database-connections.md) for complete examples, YAML overrides, schema ownership and verification.

## Where to work

The Settings and Dev tools header entries stay visible on their destination pages. The Dev tools entry is development-only and must remain absent from production builds.

Business code belongs in a small, stable set of places:

```text
client/routes.ts, client/pages/, client/components/, client/locales/,
client/service-provider.ts, server/routes/, server/providers/,
database/main/migrations/, database/main/seeds/, tests/
```

Everything else — `client/routing/`, `client/shell/`, `client/layouts/`, `client/theme/`, the server entry points, the build scripts, the tsconfigs — is the framework structure the template provides and evolves. Prefer the mechanism the system already offers: most work that looks like it needs a change there does not.

When the built-in mechanism genuinely cannot express the requirement, changing that structure is a legitimate answer. Comment what you changed and why the built-in path did not fit, and update `AGENTS.md` and this Skill in the same change so they still describe the real application.

The account menu language control in `client/shell/language-switcher.tsx` uses a shadcn submenu with radio items. Render it inside `DropdownMenuContent` to preserve menu keyboard navigation and selection semantics.

## Ownership

```text
You own       pages, components, endpoints, tables, migrations, services,
              translations, tests, navigation, theme, business logic

Plugins own   their routes, components, tokens, services, internal tables,
              and their skills/ source

Generated     .agents/skills/ — synchronized copies, gitignored, replaced
              wholesale on the next sync; never edit

Config        config.yml — gitignored, holds secrets; document options in
              config.example.yml instead
```

Reach a plugin's capability only through its documented package exports. Never import a plugin's internal source path or write to its tables directly.

## Non-negotiables

These cause real damage and appear in every reference:

- **Every server route owns its own authentication and authorization.** Mounting under `/api` authenticates nothing.
- **A migration is immutable history and self-contained.** Never import an evolving definition into one. Never edit one whose branch is merged.
- **Every user-visible string goes through a translation key.**
- **Visual consistency is application-wide.** Restyling only your part is a defect. Change the design tokens if a change is needed.
- **Route paths never include the deployment base path.** The runtime restores it.
- **Route navigation creates sidebar entries.** Declare `navigation` in `client/routes.ts`; Refine resources are for CRUD, not menus.
- **Reach for the built-in mechanism first.** Changing framework structure is allowed when nothing else fits — comment it and update the docs.
- **Tests live in `tests/` or `e2e/`,** never beside the source.

## Development file watching

`pnpm dev` checks native file watching before starting its children. If watcher resources are exhausted or native events are unavailable, it uses polling for client and server hot updates and disables agent annotations for that run, with a warning. An explicit `CHOKIDAR_USEPOLLING=true` selects the same mode. Configuration files use stat polling so atomic saves and newly created files restart the server without native directory watchers.

Vite must exclude the application's entire `dist/` tree from development file watching. Its default exclusion covers only `dist/client`; watching the compiled server and vendored packages can cause `EMFILE` after a build. Keep the exclusion scoped to this application so linked workspace dependencies, including their `dist/` files, still receive hot updates.

## Remote backend development

Treat `/main` in examples as a default, never as a fixed route. Local `APP_BASE_PATH` resolves from the command-line environment, then `.env.local`, then `.env`, with `/main` as the fallback. Determine the remote application's actual public mount path separately and include it in `PROXY_TARGET_URL`; local and remote paths may differ. For example, local `APP_BASE_PATH=/local` and a target ending in `/crm` map `/local/api` to `/crm/api` and `/local/ws` to `/crm/ws`.

For local client debugging against another running application, use `PROXY_TARGET_URL=<remote-application-base-url> pnpm dev` (for example, `http://127.0.0.1:13000/main`, without `/api`). This starts Vite, proxies API and WebSocket paths, and skips the local server and its watchers. Existing `beforeDev` hooks still run. Open the printed Local URL. Client edits reload locally; backend edits require running or deploying the target separately. Requests use the target's data and permissions. See README.MD for authentication and path mapping requirements. Unset the variable to develop both sides locally.

The proxy maps same-origin browser HTTP and WebSocket Origin headers to the target origin, with matching Referer paths mapped to the target app base. It preserves foreign origins and does not add missing Origin headers. Test browser handshakes with an explicit Origin; an Origin-less Node WebSocket test does not verify browser compatibility. Production does not use this Vite adaptation: configure `APP_PUBLIC_ORIGIN` and preserve public Host/protocol information through the reverse proxy.

Use `APP_SERVER_PORT` for the local entry port in both development modes. With `PROXY_TARGET_URL` it selects Vite's preferred port, defaulting to 5173; without it, it selects the local backend port, defaulting to 13000, and Vite still starts from 5173. If occupied, the port advances automatically. Open the printed Local URL and keep the remote service address in `PROXY_TARGET_URL`.

## Finishing

When building for another platform, pass `--target` and verify the native binaries retained in `dist/node_modules`. `better-sqlite3` 13 bundles N-API binaries for multiple platforms; Alpine targets need the `linuxmusl` binary, while other Linux targets use the `linux` binary.

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Verify observable behavior, not just that the commands passed. [Testing and verification](references/testing.md) lists what to check for each kind of change.

After touching `client/locales/` or `server/locales/`, run `pnpm nocobase app i18n:check`. It reports a language declared on one side alone and exits nonzero until the lists align. A client-only language is still supported at runtime and the server falls back to English; add matching server translations when server-produced text should use that language.

Application startup defaults belong in `config.yml`: `i18n.defaultLocale` for the language, and `client.app.defaultColorScheme` and `client.app.defaultTheme` for appearance. Valid browser-local choices take precedence. Which languages the interface offers is not configured — `client/locales/` is that list, while `server/locales/` independently defines the server's translated languages. See the i18n and themes references.
