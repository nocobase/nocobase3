# AGENTS.md

This is a NocoBase application plugin: a package published to a registry and installed into an application someone else assembled. That makes it a guest, and most of the rules below follow from it.

## Adding a dependency

Code that ships goes in `dependencies`, whether it runs on the server or in the browser.

| The import is reached from                          | Declare it in                                |
| --------------------------------------------------- | -------------------------------------------- |
| `server/` or `database/`, at runtime                | `dependencies`                               |
| `client/`, as a value import                        | `dependencies`                               |
| A package the application must own a single copy of | `peerDependencies` **and** `devDependencies` |
| `registry/`                                         | nothing — the application compiles it        |
| Tests, build scripts, or `import type` only         | `devDependencies`                            |

`pnpm deps:check` at the repository root enforces the server row and runs in CI.

### Why a client import is a real dependency

Ask one question: **does someone outside this repository have to resolve this import?** If yes, declare it where npm publishes it. `devDependencies` are not published at all.

**A deployed server resolves its imports at runtime.** An application's `pnpm build` emits `dist/server` with its bare imports intact and generates `dist/package.json` from `dependencies`. A server import declared only as a devDependency resolves in every development checkout and is absent exactly once — on the deployed server, as a bare `Cannot find package` naming nothing that points back at this manifest.

**An installing application resolves your client imports at build time.** Your `client/` is not bundled by this plugin: `build` is `tsc`, so `dist/client/*.js` keeps its bare imports and the application's Vite build resolves them. That application installed this plugin from a registry, so it has only what the published manifest declares. A client import left in `devDependencies` fails there with `Could not resolve "…"` — and it will not fail here, because a workspace install links every devDependency into this plugin's own `node_modules`.

Do not rely on the application happening to declare the same package. It might, and then the plugin works by coincidence until someone installs it into an application that does not.

So `hono` in `server/routes/` and `sonner` in `client/` are both `dependencies`. A dynamic `import()` counts as a value import; `import type` does not, wherever it appears. When a `catalog:` version pins the development copy, keep the `devDependency` alongside the published range.

`registry/` is the exception: it is source the application copies into itself and compiles there, against that application's own `react` and `@/` alias. This plugin never resolves those imports at all, so declaring them would claim dependencies it does not have.

### Prefer what the application already has

Before adding a client package, check whether `packages/templates/app-template-default` already declares it. Reusing that version means the application bundles one copy instead of resolving two, and it keeps this plugin from pinning a range the application then has to work around. Use `catalog:` for anything the repository catalog already names.

### Runtime packages are peers, never dependencies

`@nocobase/app-server`, `@nocobase/app-client`, `@nocobase/db`, `@nocobase/i18n`, `@nocobase/service-provider`, `@nocobase/queue`, and every other `@nocobase/app-plugin-*` carry process-wide state — service tokens compared by object identity, React contexts, a job registry. A second copy splits that state, and nothing warns: the install succeeds, the build succeeds, and at runtime a demonstrably registered service reports `Service "..." is not registered`.

Declare each as a `peerDependency` (the published contract: "provide this, and provide exactly one") paired with a `devDependency` (which pins this repository's copy for development, where the wide peer range should not float). `pnpm peers:check` enforces this. The generator already emits this shape for the capabilities you selected.

## Before you finish

```bash
pnpm --filter <this-package> lint
pnpm --filter <this-package> typecheck
pnpm --filter <this-package> test
pnpm --filter <this-package> build
```

Every server route owns and tests its own authentication and authorization boundary; mounting under `/api` authenticates nothing. Keep declarations, exports, dependencies, tests, README, and Plugin Skills aligned when capabilities change.

The repository root `AGENTS.md` covers the rest — package publishing, test layout, migrations, and the reasoning behind the rules summarized here.
