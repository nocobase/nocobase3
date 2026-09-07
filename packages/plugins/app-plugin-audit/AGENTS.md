# AGENTS.md

This is a NocoBase application plugin: a package published to a registry and installed into an application someone else assembled. That makes it a guest, and most of the rules below follow from it.

## Adding a dependency

Where a package goes depends on where the code that imports it runs, not on what the package is for.

| The import is reached from                          | Declare it in                                |
| --------------------------------------------------- | -------------------------------------------- |
| `server/` or `database/`, at runtime                | `dependencies`                               |
| `client/` or `registry/`                            | `devDependencies`                            |
| A package the application must own a single copy of | `peerDependencies` **and** `devDependencies` |
| Tests, build scripts, or `import type` only         | `devDependencies`                            |

`pnpm deps:check` at the repository root enforces the server row and runs in CI.

### Why server and client differ

They are deployed differently, and the split follows from that.

**Server code is deployed unbundled.** An application's `pnpm build` emits `dist/server` with its bare imports intact, generates `dist/package.json` by walking `dependencies`, and installs a `node_modules` beside it. That tree is what the deployed server resolves against, and `devDependencies` are not in it. A server import declared only as a devDependency resolves in every development checkout and is absent exactly once — on the deployed server, as a bare `Cannot find package` naming nothing that points back at this manifest.

**Client code is bundled by the application.** Your `client/` is compiled by the application's Vite build, which resolves those imports at build time and inlines them. Nothing resolves them again at runtime, so a `dependencies` entry buys the bundle nothing — and costs something real, because that same walk over `dependencies` drags every one of them into the server deployment to be installed and never required. Two plugins doing this were 44 MB of exactly that before the rule was written down.

So `hono` in `server/routes/` is a `dependency`, while `react`, `lucide-react`, `@base-ui/react`, `clsx`, and `tailwind-merge` in `client/` are `devDependencies`. A dynamic `import()` counts as a runtime import; `import type` does not, wherever it appears.

`registry/` is even further from a dependency: it is source the application copies into itself and compiles there, against that application's own `react` and `@/` alias. This plugin never resolves those imports at all.

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
