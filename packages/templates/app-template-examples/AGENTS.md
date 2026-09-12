# Examples Application Development Guidelines

This is a NocoBase 3 application. Do not apply globally installed NocoBase 2 Skills. You are building the application itself — its pages, its API, its database tables. Everything under this directory is application-owned source code that you may edit directly.

Do not create a plugin to add a feature. Plugins are separately published packages for capabilities shared across several applications; building one for this application's own feature adds a package boundary, a version, and a release process to work that belongs in `client/` and `server/`. Create one only when the user explicitly asks for a reusable published package.

## Examples template scope

This application is based on `@nocobase/app-template-default` and provides runnable learning examples. Its homepage catalogs the registered demonstrations; article management is application-owned. Reusable plugin examples stay in `packages/examples/` in the source workspace. Keep framework changes aligned with Default and Hub; keep demonstration content and branding local. Use a separate configuration and database, never copy Default's runtime state.

## Load the development skills

`skills/nocobase-app-development/` holds the detailed guidance behind this file. Read its `SKILL.md` first — it routes to the reference that matches your task instead of making you read everything:

| Task                                             | Reference                               |
| ------------------------------------------------ | --------------------------------------- |
| Add a page, route, or navigation entry           | `references/client-pages-and-routes.md` |
| Build or style UI                                | `references/components-and-styling.md`  |
| Add an HTTP endpoint                             | `references/server-routes.md`           |
| Read or write data                               | `references/database-and-data.md`       |
| Change the schema                                | `references/migrations.md`              |
| Add translatable text                            | `references/i18n.md`                    |
| Add a service, background job, or scheduled task | `references/services-and-jobs.md`       |
| Write tests and verify                           | `references/testing.md`                 |

Read the one page your task needs, not the whole directory.

`skills/nocobase-app-upgrade/` is a separate Skill for a separate job: merging a newer release of the template this application was generated from. Read it when the task is upgrading the template rather than building a feature, and read it before touching anything — an upgrade done by copying the newest template over this application destroys the work that made it this application.

## Where things go

Business code goes in these places. This is where you work, and where you should stay unless the task genuinely requires otherwise:

```text
client/routes.ts          Declare a page route
client/pages/             The page component
client/components/        Your components
client/components/ui/     shadcn/ui primitives; add with the CLI, do not hand-write
client/locales/           Every user-visible string
client/service-provider.ts Client startup and CRUD resource integration
server/routes/            HTTP endpoints
server/providers/         Services and their lifecycle
database/main/migrations/      Schema changes
database/main/seeds/           Required initial data
cli/commands/             Commands this application owns
tests/                    Tests; never beside the source
```

A feature with a page and an API touches five places: a migration for the table, a route in `server/routes/`, a page in `client/pages/` declared in `client/routes.ts`, navigation on the page route, and strings in `client/locales/`.

### The rest is framework structure

`client/routing/`, `client/shell/`, `client/layouts/`, `client/theme/`, the server entry points, the build scripts, and the tsconfigs are the scaffolding the template provides. It is still this application's own source — it shipped to the user and they may change it — but it is the part the template evolves, so an edit there is what a future upgrade has to reconcile.

Prefer the mechanism the system already provides. Declare a page in `client/routes.ts` and add `navigation` when it needs a menu entry. Refine resources are only needed for CRUD integration. A settings page uses `access` to restrict access; a plugin page is customized through an option or an override. Before editing the shell to add a menu, check the route and its `navigation` declaration.

When the built-in mechanism genuinely cannot express what is being asked, changing this structure is a legitimate answer — not a last resort to apologize for. Do it deliberately, and leave the next agent enough to work with:

- Comment what you changed and why the built-in path did not fit. On upgrade, an agent reconciling the template's version needs to know whether your change is still needed.
- Update this file and `skills/nocobase-app-development/` in the same change, so the guidance describes the application as it actually is. Documentation describing a layout the application no longer has is worse than none.

## Building a feature

### Pages and routes

Declare the route in `client/routes.ts` and keep the page component behind a lazy `componentLoader`. The loaded module must default-export the component.

```ts
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    auth: 'required',
    componentLoader: () => import('./pages/orders.js'),
  },
]);
```

Route paths are application-internal. Never write the deployment base path such as `/main` into one — the runtime restores it.

`auth` controls browser navigation only: `required` for signed-in pages, `guest` for sign-in and registration, `optional` for pages that work either way. It is not server security. An endpoint the page calls enforces its own authentication independently.

Use `defineSettingsRoutes()` for administrative pages, which mount under `/settings`, and `defineDevRoutes()` for development-only pages, which mount under `/dev` and are absent from a production build. Do not repeat `/settings` or `/dev` in the path. `defineDevRoutes()` is a build boundary, not a permission boundary: a page that must be restricted in production is a settings route with `access`, enforced by the server.

**Declare navigation on the route.** App, Settings and Dev menus read `navigation: { title: 'navigation.orders' }`; titles resolve in the owning locale namespace. Add the translation in `client/locales/`. Refine resources remain for CRUD and do not add menu entries.

Use recursive groups to organize menus; their path is optional. Pages may also have children, but must manually render `Outlet`. For examples and the exact file list, read `skills/nocobase-app-development/references/client-child-routes.md`.

### Components and styling

Use shadcn/ui for UI. Check `client/components/ui/` first; if the primitive is not there, add it from the shadcn registry rather than writing your own:

```bash
pnpm exec shadcn add card
```

Build your own components by composing these primitives, and put them in `client/components/`.

Style with the semantic Tailwind tokens — `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary` — so pages follow the light and dark themes. Do not hard-code colors like `bg-white` or `text-gray-900`; they break the moment someone switches theme.

**Visual consistency is a whole-application property.** Match the surrounding code's spacing, typography, and component choices. If a change genuinely calls for a different look, change the application's design tokens in `client/theme/themes/*.css` so every page moves together. Never restyle only the part you are working on — a page that looks different from the rest is a defect, not a customization.

### Server routes

`defineApiRoutes()` mounts under `/api`, and `defineRootRoutes()` mounts at the root for callbacks and webhooks. Do not repeat `/api` in the path. Each route factory creates and returns its own Hono router.

```ts
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);

    router.use('/orders', auth.required());
    router.get('/orders', async (context) =>
      context.json({ data: await listOrders() }),
    );

    return router;
  },
);
```

**Every route owns its own security.** Mounting under `/api` does not authenticate anything. Install `auth.required()` on the paths the route owns, and add `authorization.middleware()` with an explicit `resource`/`action` check when the operation needs permission rather than just identity. Never rely on middleware from another route or on the order routes happen to be registered in.

Scope middleware to the exact paths you own, or to an isolated sub-router mounted at your prefix. A `router.use('*', ...)` leaks into contributions mounted later.

A webhook that a third party calls cannot use a login session, so it is deliberately public — but public still means verifying a signature, timestamp, or one-time state, and testing that anonymous requests without a valid signature are rejected.

Keep HTTP concerns in the route and domain logic in a service under `server/providers/`.

### Database

Schema changes are migrations under `database/main/migrations/`. Data the application requires to run is a seed under `database/main/seeds/`. Seeds never create structure.

```ts
const migration: MigrationDefinition = defineMigration({
  name: '202609020001_create_orders',
  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.string('reference', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('orders');
  },
});
```

**A migration is immutable history and must be self-contained.** Spell out every field, index, and constraint in the migration itself. Never import a collection definition, model, or registry that keeps evolving — doing so silently changes what an already-applied migration means. Write `down` as the explicit reverse in a safe dependency order.

Edit an existing migration only while the branch that introduced it is unmerged. Once merged, every correction is a new migration.

The exported `name` must match the filename. Apply with `pnpm migrate` and verify against a real database.

At runtime, resolve `databaseManagerToken` from the container and use `database.query()` to read and write the default connection. Use `database.query('analytics')` for another connection. Application tasks use `database/<connectionName>/{migrations,seeds}` and bind to that connection explicitly; plugin tasks and default runtime access stay on `database.default`. Only managed connections run migrations or seeds. See the migrations reference for execution and upgrade rules.

### User-facing text

Every string a user reads goes through a translation key. `client/locales/en-US.ts` states the wording and derives the shape that other locales are checked against, so a missing key in `zh-CN.ts` is a compile error.

```tsx
const { t } = useTranslation();
t('orders.title');
```

To reword a plugin's string, add an `overrides` block keyed by that plugin's package name in your locale file. Do not edit the plugin.

The languages the application offers are its own locale files, not a configured list, and the two sides are read separately: `client/locales/` decides what the picker shows, `server/locales/` what the server will answer in. Adding a language means adding its file to both. `pnpm nocobase app i18n:check` reports one declared on a single side.

The account menu language control in `client/shell/language-switcher.tsx` uses a shadcn submenu with radio items. Render it inside `DropdownMenuContent` to preserve menu keyboard navigation and selection semantics.

## The command line

`pnpm nocobase` runs this application's CLI. It holds three kinds of command: `plugin *` manages the plugins this application uses, `app *` is what this application writes for itself in `cli/commands/`, and each registered plugin contributes its own commands under a topic it declares — a workflow plugin's commands appear under `workflow`.

```bash
pnpm nocobase --help          # every topic and command
pnpm nocobase app info        # a command this application owns
pnpm nocobase app i18n:check  # languages declared on only one side
```

Add a command of your own as an oclif `Command` subclass in `cli/commands/`, then list it in `cli/commands/index.ts`; the key becomes its name under `app`. These commands are static tooling — they read and write files and packages. They do not start the application, so nothing in them may resolve a service or query the database. Anything needing the running application is a server route or a job, not a command.

`cli/` is compiled into `dist` alongside the server, so a deployed application runs the same commands with `node ./cli/index.js`. `pnpm migrate` and `pnpm seed` are these commands rather than separate scripts.

A command that cannot work in a deployment belongs in `cli/dev-commands/` instead, which the build excludes — client inspection is there because it needs Vite and the browser client, and neither exists in `dist`. Put a command there rather than shipping one that fails the moment someone runs it.

## Plugins

Plugins are registered in `client/plugins.ts`, `server/plugins.ts`, and `cli/plugins.ts`. Presence in the array enables a plugin and array order is contribution order. A plugin appears in the roots matching what it ships, so a plugin with only commands is listed in `cli/plugins.ts` alone. Bulk Skills synchronization and plugin updates discover plugins from these composition roots.

Let `pnpm plugin:register` and `pnpm plugin:unregister` add and remove entries. Edit these files by hand only to reorder entries or to pass a plugin its options.

To customize a page a plugin owns, pass an option on its registration, add a source extension under `client/extensions/*/extension.ts`, or add an entry to `client/route-overrides.ts`. Do not redeclare the plugin's route — a duplicate `/install` is a conflict, not a customization. An override replaces only `componentLoader`; route identity, path, and auth mode stay with the plugin. One route takes one override across all three mechanisms. Authentication pages are not plugin-owned: `/login`, `/register`, `/forgot-password`, and `/reset-password` are application routes declared in `client/routes.ts`.

### Read a plugin's Skill before building what it already does

**You are not starting from scratch.** This application ships with plugins that already solve whole categories of requirement, and each one publishes a Skill explaining how to use it. Registration copies those Skills into `.agents/skills/`. Before implementing a feature, check whether a plugin already covers it:

| The requirement sounds like                                                                       | Read the Skill for                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Approvals, multi-step processes, "when X happens then Y", business rules that outlive one request | `@nocobase/app-plugin-workflow`       |
| Email, IM, or in-app messages; notifying someone that something happened                          | `@nocobase/app-plugin-notification`   |
| Roles, permissions, "user A may only see their own records", field-level or row-level access      | `@nocobase/app-plugin-authorization`  |
| Sign-in, registration, sessions, password reset                                                   | `@nocobase/app-plugin-authentication` |
| File upload and metadata through Repository                                                       | `@nocobase/app-plugin-file`           |
| Translated text and language switching                                                            | `@nocobase/app-plugin-i18n`           |

Run `pnpm plugin:skills:sync` if `.agents/skills/` is missing or looks out of date, then read the Skill for the plugin you need. It documents that plugin's public entries, the ownership boundary, and how to verify the result — which is faster and more correct than inferring an API from its source.

Building a permission system, a notification sender, or a job scheduler by hand when a registered plugin already provides one is the most expensive mistake available here. Prefer the plugin; write your own only when you have read its Skill and confirmed it genuinely does not fit.

`.agents/skills/` itself is generated output: gitignored, and every synchronized directory is replaced wholesale on the next sync, so never edit a file there. This application's own `skills/` directory is the opposite — committed source you should keep current.

## Adding a dependency

Put a package your **server** code imports in `dependencies`. Put everything your **client** code imports — along with build tooling, tests, and type-only imports — in `devDependencies`.

That split looks backwards until you see how the two halves are deployed. `pnpm build` bundles the client: Vite resolves every client import and inlines it into `dist/client`, so nothing has to resolve it again later. The server is not bundled. `dist/server` keeps its bare imports, and `pnpm build` generates `dist/package.json` from your `dependencies` and installs a `node_modules` next to it — that tree is what the deployed server resolves against, and `devDependencies` are not in it.

So the two mistakes fail in opposite ways. A server import left in `devDependencies` works all through development and fails only on the server, with a bare `Cannot find package` naming nothing that points back here. A client package put in `dependencies` never breaks anything — it is just installed into every deployment, where the server never requires it. That one is invisible, so it accumulates: `lucide-react` and `@xyflow/react` were 44 MB of it before this rule was written down.

What decides it is where the importing file lives and what the import is, not what the package is for. `import ts from 'typescript'` in `server/` is a runtime dependency even though TypeScript sounds like tooling. `import type { Config } from 'x'` is erased before anything runs, so it stays a devDependency wherever it appears. A dynamic `import()` counts — deferring the load changes when a package is needed, not whether.

### Adding a dependency

Which half of the application imports it decides where it goes.

| The import is reached from              | Declare it in     |
| --------------------------------------- | ----------------- |
| `server/`, `database/`, or `cli/`       | `dependencies`    |
| `client/`, build tooling, tests         | `devDependencies` |
| `import type` only, wherever it appears | `devDependencies` |

`dist/package.json` is generated from `dependencies` and is what a deployment installs from, so a server import declared as a devDependency resolves in every development checkout and is absent exactly once — on the deployed server. A client import needs nothing at runtime: Vite resolves and inlines it into `dist/client` at build time.

A plugin's browser packages arrive by a third route and need nothing from you. Plugins declare those as peer dependencies, so installing a plugin brings one shared copy into this application, while `dist/` sets `autoInstallPeers: false` and installs none of them.

`pnpm build` checks the server half: it reads every value import in `server/`, `database/`, and `cli/` and fails the build if any of those packages is missing from `dist/package.json`. It cannot see an import whose specifier is built at run time:

```ts
await import(`${name}/index.js`); // invisible to the check
```

Declare such a package in `dependencies` when you write the code; nothing will remind you later.

### Packing the build for a deployment

`pnpm build --tar` writes `storage/dist.tar.gz` after the build. The archive holds `dist/` as a directory next to `config.example.yml`, so extracting it produces exactly those two paths rather than scattering `server/` and `node_modules/` into whatever directory you unpacked in.

`config.example.yml` travels with it because a deployment has to write a `config.yml` before it can start, and the example is the only statement of what may go in it. Directories of executable shims are left out: a `.bin` entry points at a path on the machine that installed it, and a dangling one makes `pnpm install` in the extracted tree report a corrupt store rather than repair it.

Without `--tar` no archive is produced, which is what you want when the build is only going to be run locally.

### Building for another platform

`pnpm build` targets the machine it runs on, so `pnpm build && pnpm start` works. A deployment build says where it is going: `--target linux-x64`, `--target linux-arm64`, `--target linux-x64-musl`, plus `--node-version` when the server's Node major differs. Every build prints the platform it produced and records it in `dist/package.json` under `nocobase.buildTarget`.

A `.node` binary is compiled for one platform, architecture, C library, and Node ABI at once. `pg`, `mysql2`, and `tedious` are plain JavaScript, so an application using only those is portable as built.

### When a build or a deployment fails

| Symptom                                                                                 | Cause                                                                        | Fix                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Cannot find module 'x'` on the server, works locally                                   | `x` is in `devDependencies`, which `dist/package.json` is not generated from | Move it to `dependencies`                                                                                                                                                            |
| A browser package will not resolve while building the application                       | A plugin declares it as a peer and nothing provides it                       | Add it to the application's `devDependencies`                                                                                                                                        |
| `Error loading shared library`, `invalid ELF header`, or a bare `.node` path at startup | The binary does not match the server                                         | Compare `require('./dist/package.json').nocobase.buildTarget` with the server's `process.platform`, `process.arch`, and `process.versions.modules`, then rebuild with matching flags |
| `no prebuilt binary for <target>` during the build                                      | The package publishes no build for that combination                          | Check the package supports the target; musl coverage is thinner than glibc                                                                                                           |

Node ABI to major version: 115 is Node 20, 127 is 22, 137 is 24, 147 is 26.

## Before you finish

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Add tests for what you changed: a route's authenticated, unauthenticated, and unauthorized responses; a migration's `up` and `down` against a real database; a page's actual behavior. Tests belong in `tests/`, or in `e2e/` when they need a real server. Never place a test beside the source it covers.

`pnpm client:inspect` and `pnpm server:inspect` show what is wired when a contribution does not appear as expected. They report composition, not correctness — a clean inspection proves nothing about behavior or security.

For creating or editing theme presets, read `skills/nocobase-app-development/references/themes.md` (from the application root).

For UI styling, use the shared color, font, size, spacing, radius and shadow contract in `skills/nocobase-app-development/references/theme-tokens.md` (from the application root). Prefer its Tailwind utilities so components respond to theme changes; keep deliberate fixed-size exceptions explicit.

Application startup defaults belong in `config.yml`: `i18n.defaultLocale` for the language, and `client.app.defaultColorScheme` and `client.app.defaultTheme` for appearance. Valid browser-local choices take precedence. Which languages the application offers is not configured — its own `client/locales/` and `server/locales/` are that list. See the i18n and themes references.
