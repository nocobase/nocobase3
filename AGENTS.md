# AGENTS.md

This is the NocoBase 3 source repository. Ignore globally installed NocoBase 2 Skills here; follow the nearest `AGENTS.md` and repository-local NocoBase 3 Skill instead.

## Before Creating or Updating a Pull Request

Read [.changeset/README.md](.changeset/README.md) before creating or updating a PR. If the PR changes a publishable package and affects its published output, include a changeset in the same PR covering every affected package. Run `node scripts/validate-changesets.mjs` before pushing.

CI enforces this rather than suggesting it: `scripts/require-changesets.mjs` fails the PR when a changed package has no changeset covering it. It asks whether a file reaches the published artifact, not whether the change deserves a release, so what it exempts is narrow — a package's `README`, `CHANGELOG`, `docs/`, its tests, and the development configuration it does not ship. Everything else counts, including `AGENTS.md`, `CLAUDE.md` and `skills/`: those are published with the package and synchronized into an installed application's `.agents/skills/`, so an unreleased change to them leaves every consumer's agent working from the previous rules. A template package is stricter still, because its `files` field ships its own `eslint.config.js`, `vitest.config.ts` and tsconfigs as source a user reads and edits.

Run it locally the way CI does before pushing:

```bash
BASE_SHA=$(git merge-base origin/develop HEAD) HEAD_SHA=$(git rev-parse HEAD) \
  node scripts/require-changesets.mjs
```

When a change genuinely should not be released — a pure refactor, or reverting something that never shipped — add the `release:skip` label to the PR and say why in the description. The label is the only way past the check, which keeps the decision visible in the PR rather than hidden in a changeset nobody meant to write.

A new changeset goes in `.changeset/`, never in `.changeset/pre/`. That subdirectory belongs to the changesets tool: while the branch is in prerelease mode, `changeset version` moves each changeset it has already consumed into it, and reads the whole directory again on later runs to compute the accumulated bump. Writing a new file there directly presents it as already released — the release run never consumes it, so its summary never reaches the CHANGELOG and the version it asked for is never applied. Nothing fails; the changeset is silently ignored. The directory is full of files because the branch has been releasing for a while, which makes it an easy place to add one by imitation.

## Repository Layout

Every published package lives under `packages/`, grouped into six directories by what the package is. The grouping is a convention for readers: pnpm resolves packages by name, so which directory a package sits in changes nothing about how it is depended on or filtered.

| Directory             | What belongs here                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/libs/`      | Runtime libraries that solve one problem and know nothing about NocoBase applications, such as `caching`, `drive`, and `i18n`   |
| `packages/app/`       | The application runtime itself — what an application is built out of, such as `app-server`, `app-client`, and `app-portal-sdk`  |
| `packages/plugins/`   | Application plugins that ship as product features, such as `app-plugin-authentication`                                          |
| `packages/examples/`  | Application plugins that exist to demonstrate a capability, such as `app-plugin-routes-example`                                 |
| `packages/templates/` | Complete applications that `create-app` scaffolds from: `app-template-default`, `app-template-examples`, and `app-template-hub` |
| `packages/tools/`     | Development and build tooling that never ships inside an application, such as `dev-config`, `cli`, and `create-app`             |

`packages/README.md` describes each directory in more detail and is the place to look when a new package does not obviously belong to one of them. `pnpm plugin:create` scaffolds into `packages/plugins/`.

`docs/` is the seventh workspace member and the one exception to the table above. It is the documentation site rather than something an application depends on, so it sits at the repository root rather than under `packages/`, and it is the only workspace package that sets `private: true`. That placement is what keeps it out of `pnpm pack:check`, which discovers publishable packages by descending into `packages/<category>/` and would otherwise reject it for being private. See the "Documentation Site" section below before changing anything under it.

## Selecting and Using Shared Development Configuration

All new packages must use `@nocobase/dev-config` by default. Do not copy a complete tsconfig, ESLint, Prettier, Vitest, or Vite configuration from an existing package. See `packages/tools/dev-config/README.md` for the full English documentation; each configuration directory also has its own README.

### Selecting a TypeScript Preset

First determine the runtime environment, then whether the package emits declaration files:

| Scenario                                                          | `extends`                                           |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| Minimal shared strict rules only                                  | `@nocobase/dev-config/tsconfig/base.json`           |
| Browser or React application with no emit                         | `@nocobase/dev-config/tsconfig/client.json`         |
| Browser or React library that emits `.d.ts`                       | `@nocobase/dev-config/tsconfig/client-library.json` |
| Node server application                                           | `@nocobase/dev-config/tsconfig/server.json`         |
| Node library that emits `.d.ts`                                   | `@nocobase/dev-config/tsconfig/server-library.json` |
| Node tooling such as Vite, Vitest, or build scripts, with no emit | `@nocobase/dev-config/tsconfig/node-tooling.json`   |

A hybrid Node/DOM package such as `app-host` should use `server-library` and add the DOM library locally. Keep the package-specific `include`, `exclude`, `paths`, `rootDir`, `outDir`, `tsBuildInfoFile`, and special `types` settings in the consuming package because they depend on its directory layout.

### ESLint, Prettier, Vitest, and Vite

- Use a thin `eslint.config.js`. Node libraries call `createNodeLibraryConfig`, browser libraries call `createClientLibraryConfig`, and Portals call `createPortalConfig`.
- A package may add precise `ignores` or documented, narrowly scoped rule exceptions. Do not disable type-aware linting across an entire package merely to complete a migration.
- Inherit Prettier through `"prettier": "@nocobase/dev-config/prettier"` in `package.json`.
- Prefer `pnpm fix` after editing code. It always runs ESLint `--fix` before Prettier `--write`. `pnpm format:check` is a read-only incremental check.
- Node tests use `createNodeVitestConfig`. React/jsdom tests use `createReactVitestConfig`. The React preset already installs jest-dom matchers and Testing Library cleanup.
- Portal Vite configurations use `createPortalViteConfig`. Keep `base`, API/proxy settings, `envPrefix`, and aliases local.
- Keep Playwright configuration package-local for now; there is no shared Playwright preset.

### Dependencies and Runtime

- Use `catalog:` entries from `pnpm-workspace.yaml` for shared critical dependencies such as TypeScript, ESLint, Prettier, Vitest, Vite, React, Tailwind, and Testing Library.
- Continue to use `workspace:` for internal NocoBase packages. A peer dependency may retain an explicit version range when it intentionally supports a wider range than the workspace version.
- After changing dependencies, run `CI=true pnpm install --no-frozen-lockfile` and commit the synchronized lockfile. CI uses a frozen lockfile.
- Node runtime, server, and tooling packages declare Node `>=24.0.0`. A browser-only runtime must not declare a Node runtime requirement merely because its development tooling uses Node.

### Package Publishing

Every package under `packages/` is published to npm, so none of them set `private: true`. Root `pnpm pack:check` automatically discovers every package in that directory and rejects private packages, incomplete publish metadata, missing or stale changelogs, invalid tarballs, unresolved workspace protocols, and broken export or declaration metadata.

A new package therefore starts at version `0.0.1`, sets `publishConfig.access` to `"public"` — scoped packages default to restricted and would otherwise fail to publish — and declares `files`. Without `files` the package ships its sources, tests, and configs; libraries ship `dist` alone, while template packages that users are meant to read and edit ship their sources instead.

Check npm before settling on a package name. A name the v2 line still publishes under is off limits — `@nocobase/database` is releasing `3.0.0-alpha` versions as this is written, so `@nocobase/db` is the v3 database package.

A name whose v2 releases have stopped may be reused, provided every version v3 publishes sorts above the last one published under the old name. `@nocobase/app-server` is the case to reason from: the abandoned package ends at `0.11.1-alpha.5`, so the v3 package starts at `1.0.0-beta.0` rather than continuing the `0.1.0-beta` line it had while it was called `@nocobase/app-server-kit`. Note that `0.1.0` sorts below `0.11.1`, which is exactly the mistake this rule exists to catch. Confirm the old package is genuinely dormant before taking its name; a name still in use cannot be claimed this way at any version.

### Test Layout

Tests live in a `tests/` directory at the package root, never beside the source files they cover. A package with nested source roots puts `tests/` at the root of that source tree, as `packages/plugins/app-plugin-authentication/server/tests` does. Subdirectories inside `tests/` are free to reflect whatever the package needs, such as `tests/unit` and `tests/integration` in `packages/libs/db`, or `tests/logic` and `tests/components` in the Portal packages.

Name test files `*.test.ts` or `*.test.tsx`. Vitest discovers them by filename rather than by directory, so a test placed outside `tests/` still runs and will not fail loudly; keeping the layout consistent is a convention the tooling does not enforce for you.

Test files stay out of the build. Keep `include` in the package `tsconfig.json` pointed at `src` so `tests/` is excluded from the emitted output, unless the package deliberately typechecks its tests the way `packages/libs/db` does.

### Never Assert a Package's Own Version as a Literal

A test must not spell out the version of a package in this repository. Read it from the manifest instead:

```ts
import packageMetadata from '../package.json' with { type: 'json' };

expect(service.getInfo()).toMatchObject({ version: packageMetadata.version });
```

The release workflow runs `changeset version` and then runs the tests, so every published package is on a version different from the one committed by the time the suite executes. A literal that matches today fails during the next release, and it fails after the version bump — the point where the branch has already been rewritten and the run has to be repaired before anything can ship. `@nocobase/app-plugin-system-info` broke a release exactly this way, asserting `'0.0.1'` against a package `changeset version` had just moved to `0.1.0-beta.0`. Use the manifest import shown above, or resolve the dependency’s `package.json` through `createRequire`, rather than repeating its version.

This applies to the version of any workspace package, whether the test owns it or depends on it. It does not apply to a version a test makes up for a fixture it writes itself — `version: '1.0.0'` in a synthetic `package.json` describes nothing real and never drifts.

The same reasoning covers anything else a release rewrites. Assert against the manifest, not against a copy of what it currently says.

### Validation

Run `lint`, `typecheck`, `test`, and `build` for the packages you modified, and for the packages that consume what you changed. Scope the run to those with `pnpm --filter <package>`; a workspace-wide `pnpm -r test` takes minutes and is CI's job, not a routine step after an edit.

Widening the scope is worth it when a change reaches further than the package it lives in: an exported type or signature, a shared configuration preset, or anything a generated application depends on. Judge that from the change itself rather than running everything by reflex.

Root `pnpm check` also performs incremental formatting and publish-ready tarball checks. The Husky + lint-staged pre-commit hook fixes staged files automatically, but it does not replace CI.

The executable source of `@nocobase/dev-config` is TypeScript, while its npm
exports resolve to compiled ESM JavaScript and declarations in `dist`. When
changing `packages/tools/dev-config`, run
`pnpm --filter @nocobase/dev-config check`; do not hand-edit generated output.

## Keeping the Application Templates in Sync

`packages/templates/app-template-default`, `packages/templates/app-template-examples`, and `packages/templates/app-template-hub` are three applications built on the same framework. A change to the framework layer of one belongs in all applicable templates by default: the runtime composition roots, the client shell, routing, layouts and theme, the server entry points, the `cli/` command entry, build and dev scripts, tsconfigs, and the agent-facing documentation — `AGENTS.md`, `CLAUDE.md`, `README.MD`, the nested `client/AGENTS.md` and `server/AGENTS.md`, and `skills/`.

They drift otherwise, and the drift is invisible until someone hits it. Both templates carried a `tsconfig.migrations.base.json` that nothing referenced, and both omitted `database/**/*.ts` from `tsconfig.server.json`, so an application-owned migration ran under `pnpm migrate` but was silently dropped by `pnpm build` — the same defect, twice, because a fix to one was never carried across.

Not everything transfers. Examples owns its demonstration homepage, article module, and example plugin composition. Each template keeps its own identity and the parts that follow from what it is: `package.json` name, `displayName`, and version; `nocobase.templateKind` and its plugin list; the pages, locales, and branding that make it that product. When a documentation change mentions the other template by name, reword it rather than copying the sentence — the Hub's own `server/embedded.ts` is not "the entry point when a Hub hosts the application".

Apply all applicable sides in one change and run each affected template's `check`. A framework change that lands in only one template is incomplete, and a reviewer cannot tell whether the omission was a decision or an oversight; if it genuinely does not apply, say so in the pull request.

## Application Themes and UI Styling

For creating or editing theme presets, read `packages/templates/app-template-default/skills/nocobase-app-development/references/themes.md` (from the repository root). When working on Hub, use the corresponding reference under `packages/templates/app-template-hub/`.

For application UI styling, including plugin UI rendered in an App, use the shared color, font, size, spacing, radius and shadow contract in `packages/templates/app-template-default/skills/nocobase-app-development/references/theme-tokens.md` (from the repository root), or the corresponding Hub reference. Prefer its Tailwind utilities so components respond to theme changes; keep deliberate fixed-size exceptions explicit.

## Database Migration Development

Database migrations are immutable historical records and must be self-contained. Write the exact, deterministic table, field, index, constraint, and metadata synchronization operations directly in each migration. Schema changes must likewise spell out the exact add, alter, rename, or drop operations that the migration performs.

Do not import or iterate over live collection schemas, field definitions, model definitions, registration lists, or other runtime application definitions from a migration. Those definitions continue to evolve, so referencing them can silently change the behavior and checksum of an already published migration. Reuse of such definitions is appropriate for runtime initialization and tests, but not for migration implementation.

When a migration needs to create a collection, call `builder.createCollection` with its fixed name and declare every field, relation, index, and constraint in the migration itself. Write `down` with the corresponding explicit reverse operations in a safe dependency order. For an existing schema, use explicit `builder.alterCollection`, field, index, constraint, or metadata operations rather than synchronizing from the current collection definition.

Add a migration-level test that executes `up` and, when reversible, `down` against a real test database and verifies the resulting physical schema and metadata.

Before editing an existing migration, check its Git history and the status of the branch that introduced it. An existing migration may be corrected directly only while its introducing feature branch has not yet been merged. Once that branch has been merged into its target branch, never modify the migration again; implement every correction or subsequent schema change in a new migration. Do not use hard-coded previous checksum hashes to make an edited migration appear compatible.

## Native Dependencies in Generated Applications

pnpm 11 does not run a dependency's install script unless the package is listed under `allowBuilds` in `pnpm-workspace.yaml`. That file is the only place the setting is read from: the `pnpm` field in `package.json` was removed in pnpm 11, and `.npmrc` has never carried build settings. A dependency that compiles a native addon and is missing from the list installs without building, `pnpm install` still reports success, and the failure surfaces much later as a runtime error that names nothing actionable — `better-sqlite3` reports `Could not locate the bindings file`.

`@nocobase/create-app` writes this file into each application it generates, listing only the driver that application actually needs. `DRIVERS_NEEDING_BUILD` in `packages/tools/create-app/src/lib/database.ts` is the list of drivers that require an entry; a pure-JavaScript driver such as `pg` or `mysql2` must not be added, because an entry it does not need is noise in every generated project.

Do not put `pnpm-workspace.yaml` in `packages/templates/app-template-default`, and do not generate it there at pack time either. pnpm treats any directory holding that file as a workspace root, so a copy inside the package severs it from the monorepo: `pnpm list` stops resolving `workspace:` dependencies, and `pnpm pack` fails outright with `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC` because the package's `catalog:` ranges resolve against the nested file rather than the repository root. Copying the root catalog into the generated file does make `pack` succeed, but it duplicates the catalog into a second source of truth that silently goes stale.

When another native dependency needs the same treatment, add it to `DRIVERS_NEEDING_BUILD` and cover it in `packages/tools/create-app/tests/pnpm-workspace.test.ts`. If it belongs to the template rather than to a database choice, add it to the root `pnpm-workspace.yaml` so the monorepo builds it, and extend the generated file in `packages/tools/create-app/src/lib/pnpm-workspace.ts` so applications built from the template get it too.

A separate failure mode is worth knowing: `ignore-scripts=true` in a developer's npm configuration suppresses install scripts globally and outranks `allowBuilds`, so a correct `allowBuilds` still yields an uncompiled addon. `pnpm install` cannot repair this — the package is already in the store, so pnpm skips it and reports success without building. `pnpm rebuild <package>` does, and works without changing the developer's configuration. `create-app` verifies the driver by loading it and runs that rebuild automatically.

### Declaring dependencies so they reach the right side

`pnpm build` emits a `dist/` that a server installs from its own `package.json`. What reaches that server is decided entirely by declarations — the build scans no code and prunes nothing.

A plugin has three answers:

| The import is reached from                  | Declare it in      |
| ------------------------------------------- | ------------------ |
| `server/` or `database/`, at runtime        | `dependencies`     |
| `client/`, as a value import                | `peerDependencies` |
| Tests, build scripts, or `import type` only | `devDependencies`  |

The client row is the one worth understanding. A plugin's `client/` is not bundled by the plugin — `build` is `tsc`, so `dist/client/*.js` keeps its bare imports and the installing application's Vite build resolves them. The package therefore has to appear in the published manifest, and `devDependencies` are not published. But a server has no client build and never requires it, so `dependencies` would install tens of megabytes into every deployment that nothing loads. A peer satisfies both: the application installs one shared copy, and `dist/pnpm-workspace.yaml` sets `autoInstallPeers: false` so a deployment installs none. One declaration is enough — pnpm installs and links a peer here, so the plugin's own lint, tests, and build resolve it without a second entry.

`optional` on a peer means the consumer may legitimately not need it, not "skip this at deploy time". An optional peer is not auto-installed anywhere, including in the application that needs it — which is the failure this arrangement exists to prevent. `@nocobase/i18n`'s `hono` is the legitimate case: a browser-only consumer has no use for it.

An application has two, and the question is which half imports it: `server/`, `database/`, and `cli/` imports go in `dependencies`, because `dist/package.json` is generated from there; `client/` imports and build tooling stay in `devDependencies`, because Vite inlines them at build time and nothing resolves them again.

`build-server-dist-package.mjs` used to walk the built output for bare imports and expand every transitive dependency by hand. It had to, because applications declared their server packages in `devDependencies` and nothing else could tell which of them a deployment needed. Once those moved to `dependencies` the walk had nothing left to discover, and it was removed: `pnpm install` applies the same rules, and a scan that resolves specifiers is a scan that can miss one. Workspace packages remain the exception, vendored into `dist/vendor` under a `file:` path because a `workspace:` range means nothing to a deployment.

The shared UI packages — `@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`, `shadcn`, `tailwind-merge`, `tw-animate-css` — resolve through `catalog:` wherever they are declared, peers included; `pnpm pack` expands the reference before publishing.

An earlier version of this pruned `dist/node_modules` with a `@vercel/nft` file trace. It produced a far smaller tree, but what it could not see it deleted — the pino transports named in a `target:` string, each plugin's `dist/database` read by directory scan, `@nocobase/nb3-cli`'s registry module handed to oclif as a path. Every one surfaced only by running the built `dist/`, and every one would have shipped as a successful build. Declarations cannot fail that way.

### Building for another platform

`retarget-native.mjs` is unrelated to the above and stays: a `.node` binary is compiled for one platform, architecture, C library, and Node ABI at once, so a build for another target obtains different binaries. It classifies packages by manifest signal rather than by name — `cpu`/`os` fields, an install script invoking a native build helper, bundled `.node` files — so a native dependency an application adds later is handled without extending a list. Keep that.

The build targets the machine it runs on so `pnpm build && pnpm start` works, and `--target` plus `--node-version` select another. A forgotten `--target` produces a `dist/` that fails only on the server, so every build states the platform it produced and records it in `dist/package.json` under `nocobase.buildTarget`.

`verify-server-deps.mjs` runs last and fails the build when a package the application's own `server/`, `database/`, or `cli/` code imports is not in `dist/package.json`. It reads literal specifiers, so `await import(`${name}/index.js`)` is invisible to it — that case has to be declared deliberately, and no static check can cover it.

The `parseTarget` mapping from Node major to ABI is written out rather than taken from `node-abi`, which given a bare major returns the major itself: `getAbi('24')` is 24, not 137. A wrong ABI downloads a binary that will not load.

## Depending on Identity-Sensitive Packages

A plugin declares the runtime it plugs into as a `peerDependency`, never as a `dependency`. `pnpm peers:check` enforces this and runs in CI.

### Deciding whether a package belongs to the rule

The list in `IDENTITY_SENSITIVE_PACKAGES` in `scripts/check-peer-deps.mjs` is what the check reads, but it is a record of past decisions rather than the rule itself. It will be incomplete: every new package, and every new export added to an existing one, has to be judged. Ask one question:

> Does this package hold state that is only correct while exactly one copy of the module exists in the process?

If yes, it belongs to the rule. In practice that means the package exports at least one of:

- **A value used as a key by identity.** `createServiceToken` returns a frozen object and `ServiceContainer` keys its `Map` by that object, so two tokens with the same `name` are two different keys. Anything compared with `===`, or used as a `Map`/`Set`/`WeakMap` key across a module boundary, has this property.
- **A React context.** `createContext` returns a new object each call, and `useContext` only matches the provider created from the same one.
- **A module-level singleton.** A `const` holding a `new` instance or accumulated state, such as `nocobaseClient`, gives each copy its own session, cache, or connection.
- **A registration into a process-wide registry.** `@nocobase/queue` registers job classes into the `Locator` of `@boringnode/queue`; the second copy registers into a table the first one never reads.

A package that exports only classes, functions, and types holds nothing a second copy could split. Constructing two instances of a class is what callers already do, and a duplicated pure function behaves identically. `@nocobase/drive`, `@nocobase/caching`, `@nocobase/logging`, `@nocobase/session`, and `@nocobase/snowflake` are in this group today and stay ordinary dependencies. They move only if they gain one of the exports above — adding a token or a context to any of them is the moment to revisit the entry, not a later release.

Two cases need no judgement. Every `@nocobase/app-plugin-*` is covered unconditionally, because plugins export tokens for one another and `isIdentitySensitive` matches them by prefix, so a new plugin is included the day it is created. And a package that only ever appears in `import type` needs no runtime declaration at all.

When you do add an entry, record what breaks without it rather than only the package name. The reason is what lets the next person apply this rule to a package nobody has seen yet; a bare list decays into something people copy without understanding.

The current entries:

| Package                      | What breaks when a second copy exists                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nocobase/service-provider` | `ServiceContainer` keys its `Map` by the token object itself, so two `createServiceToken` calls with the same name produce two keys that never match |
| `@nocobase/app-server`       | Exports the tokens every server plugin resolves against, such as `queueManagerToken` and `driveManagerToken`                                         |
| `@nocobase/db`               | Exports `databaseManagerToken` and migration identity                                                                                                |
| `@nocobase/app-client`       | Exports React contexts plus the identity-keyed `apiClientToken` and `realtimeClientToken`                                                            |
| `@nocobase/app-portal-sdk`   | Exports `nocobaseClient`, a module-level singleton holding session state                                                                             |
| `@nocobase/i18n`             | Exports the React contexts backing the i18n runtime                                                                                                  |
| `@nocobase/queue`            | Registers job classes into the global `Locator` of `@boringnode/queue`                                                                               |
| any `@nocobase/app-plugin-*` | Plugins export tokens for one another, such as `authenticationToken` and `notificationServiceToken`                                                  |

### Why a second copy is worth this much trouble

Nothing warns at install time, the build succeeds, and the application starts. The symptom appears at runtime as `Service "..." is not registered` for a service that is demonstrably registered, or as a React context reading `undefined` under a provider that is demonstrably mounted — the error points at correct code, and the actual fault is a duplicated module that appears nowhere in the source.

It cannot be reproduced here. The monorepo links every consumer to one directory through the `workspace:` protocol, so a second copy is impossible; it becomes possible only once a plugin is installed from a registry, where a `dependencies` range lets a package manager satisfy it with its own copy. That is why the declaration has to be right before publishing, not after the first report.

### Declaring both, and why

```json
{
  "peerDependencies": { "@nocobase/app-server": "workspace:^" }
}
```

**`peerDependencies` is the published contract.** It is what npm ships in the package metadata, and it tells the installing application "provide this, and provide exactly one". `devDependencies` are not published at all, so without the peer entry an installed plugin declares no requirement and a package manager is free to give it a second copy.

One declaration is enough. pnpm installs a peer and links it into the plugin's own `node_modules`, `workspace:^` resolving to the copy in this repository exactly as `workspace:*` would — a plugin with its devDependency removed still links, typechecks, builds, and tests against it. A paired `devDependency` used to be required on the grounds that development would otherwise float across the wide peer range; it does not, so the second entry only added a line to keep in step.

### Scope

The rule applies to plugins, which are guests in an application someone else assembled: `packages/plugins` and `packages/examples`, which is what `CHECKED_GROUPS` in the check script covers.

It does not apply to `packages/app` and `packages/libs`. They compose the runtime and are what puts the single copy in place — `app-server` depending on `@nocobase/db` is precisely how the one copy comes to exist. Nor does it apply to `packages/templates`, which are applications, and therefore the side that satisfies a peer range rather than declaring one. A new group under `packages/` needs a deliberate decision about which side of this line it sits on before it is added to `CHECKED_GROUPS`.

A plugin that contributes CLI commands declares `@oclif/core` as a peer for a related but distinct reason: not module identity, but one shared version, so help rendering and flag parsing behave the same in the plugin and in the application that assembles its commands. See [internal-docs/cli/plugin-cli.md](internal-docs/cli/plugin-cli.md).

`pnpm plugin:create` emits this shape, so a generated plugin satisfies the rule without further edits. When the list changes, update `packages/tools/create-plugin/src/lib/template.ts` and its tests in the same change — a generator that emits the old shape reintroduces the problem in every plugin created afterwards.

## Declaring Dependencies by How They Are Used

Server code that ships goes in `dependencies`. Browser code a consumer has to resolve goes in `peerDependencies`. Build tooling, tests, and type-only imports go in `devDependencies`. `pnpm deps:check` enforces the server half and runs in CI.

The rule is one question: **does someone outside this repository have to resolve this import?** If yes, the package has to be declared where npm publishes it, and `devDependencies` are not published at all.

**A deployed server resolves its imports at runtime.** `pnpm build` emits `dist/server` with its bare imports intact and generates `dist/package.json` by walking `dependencies`. A server module importing something declared only as a devDependency resolves in every development checkout and is absent exactly once — on the deployed server. `@nocobase/app-plugin-workflow` shipped this: `server/loader/source-parser.ts` imports `typescript`, and `typescript` sat in `devDependencies`. The application crashed on start with `Cannot find package 'typescript'`, an error naming nothing that points back at the manifest.

**An installing application resolves a plugin's client imports at build time.** A plugin's `client/` is not bundled by the plugin — `build` is `tsc`, so `dist/client/*.js` keeps its bare imports, and the consuming application's Vite build is what resolves them. That application installed the plugin from a registry, so it has only what the published manifest declares. `@nocobase/app-plugin-notification-provider` shipped `sonner` in `devDependencies`; a generated application failed on `pnpm dev` with `Could not resolve "sonner"`, and `@nocobase/app-plugin-workflow` failed the same way on `@xyflow/react`.

That failure cannot be reproduced here, which is why it reached npm twice. The monorepo installs every devDependency and links it into the plugin's own `node_modules`, so the import resolves in development and fails only once the plugin is installed from a registry.

A plugin's client dependency is also easy to believe is fine when it is not. Ten of the twelve affected plugins appeared to work because `app-template-default` happened to declare the same package for its own use; `@nocobase/app-plugin-hub`'s CodeMirror packages had no such coincidence and were simply broken. Relying on a template to satisfy a plugin's dependency is not a design, and an application the template did not generate has no reason to declare any of it.

So the question is who resolves the import, and then what the import actually is:

- **A server value import belongs in `dependencies`.** `import ts from 'typescript'` in `server/` needs it even though TypeScript sounds like build tooling.
- **A client value import belongs in `peerDependencies`.** `sonner`, `lucide-react`, `@base-ui/react`, `clsx` — the installing application resolves them from the published manifest and provides one shared copy, while a server deployment installs none.
- **A type-only import belongs in `devDependencies` wherever it lives.** `import type { Config } from 'x'` and `import { type A, type B } from 'x'` are erased before anything runs.
- **A dynamic `import()` counts as a value import.** Deferring the load changes when a package is needed, not whether.
- **The `files` field decides whether code ships at all.** A test, an eval harness, or a build script excluded from `files` never reaches a consumer, so its imports are correctly devDependencies.

`registry/` is excluded for a stronger reason than the rest: it is shadcn-style source copied into an application and compiled there against that application's own `react` and `@/` alias. The plugin cannot resolve those imports at all, so declaring them would claim dependencies it does not have.

`peerDependencies` is the third answer, for a package the application must supply exactly one copy of. `react`, `react-dom`, `react-router`, and everything in `IDENTITY_SENSITIVE_PACKAGES` belong here rather than in `dependencies`: a second copy of a router or a React context does not merely waste space, it silently breaks. `@nocobase/i18n` is the shape to copy: it exports a server entry and a client entry from one package, so `i18next` is an ordinary dependency while `react`, `hono`, and `react-i18next` are optional peers. Mark such a peer `optional` in `peerDependenciesMeta` so the consumer that legitimately does not need it gets no warning.

This rule changed once, and the reason is worth recording. Client imports used to belong in `devDependencies`, because `dist/package.json` was built by walking `dependencies` transitively and dragged every client package into the server deployment — `lucide-react` and `@xyflow/react` alone were 44 MB installed and never required. They are peers now, which keeps them out of a deployment without keeping them out of the application that has to resolve them.

When the check reports something, there are two correct fixes and picking the wrong one is worse than the original: declare it in `dependencies` if server code genuinely imports it, or stop importing it from server code if it is client or build-time code that leaked across. Adding a declaration to silence the check trades a startup crash for a dependency every deployment carries forever.

`pnpm plugin:create` emits a generated plugin's `AGENTS.md` carrying this rule, so a plugin created tomorrow is told where a dependency goes before anyone adds one. When the rule changes here, change `packages/tools/create-plugin/template/AGENTS.md` in the same commit — the two are kept in step by a test, but only for the files' existence, not their content.

## Documentation Site

`docs/` is a Rspress site copied from the v2 repository so that its custom theme, plugins, and checking scripts stay comparable with what they were ported from. It is a workspace member (`pnpm --filter @nocobase/docs <script>`), but it deliberately does not follow the shared-configuration rules the packages under `packages/` follow.

### Vendored theme components are excluded from both tools

`theme/components/{Nav,NavHamburger,NavScreen,Search,HomeHero}` are copied from Rspress's ejectable theme and kept byte-for-byte. Diffing them against the new upstream copy is the whole of a Rspress upgrade, which only works while they are unmodified.

Both tools skip them: for ESLint through `VENDORED_FROM_RSPRESS` in `docs/eslint.config.mjs`, which feeds the config's `ignores`, and for Prettier through **two** ignore files. The same five paths appear in `docs/.prettierignore`, which applies when Prettier runs inside the directory, and in the root `.prettierignore`, which applies when it runs from the repository root — the pre-commit hook and `pnpm format:all` both do. Miss either one and the files get reformatted by whichever entry point was left uncovered.

Formatting them would rewrite every one on the first run; linting them reports on code this repository does not own, where the only actionable response is the edit that destroys the diff. Fix a real problem in one of these files by fixing it upstream and re-copying, not by patching the copy. Everything outside those five directories is this repository's own code, is formatted and linted normally, and is held to zero errors.

When a copied file needs a deliberate local change, keep it and give it a header naming exactly what was changed and why — `Search/SearchPanel.tsx` and `Search/SuggestItem.tsx` are the two that carry one today. The directory stays excluded either way; the header is what tells the next person which differences are intentional.

### Formatting and linting for everything else

Prettier is the repository baseline, `@nocobase/dev-config/prettier`, referenced from `package.json` the same way every other package references it. Nothing about this directory is special to Prettier beyond the five vendored paths described above.

ESLint is this package's own flat config rather than a `dev-config` factory, because what it lints is a Rspress theme and a set of Node build scripts, neither of which the factories are shaped for. The root `eslint.config.js` enumerates the package roots it applies to and matches nothing here, so running ESLint over a file in this directory _from the repository root_ exits zero without evaluating a single rule — it looks like a pass and checks nothing. Two things follow. `pnpm lint` at the repository root is fine, because it runs each package's own `lint` script rather than one ESLint over everything. And `lint-staged.config.mjs` lists this directory in `SELF_LINTING_DIRECTORIES`, which is what makes the pre-commit hook run its ESLint from inside it; a new self-linting directory has to be added there or its rules silently stop running at commit time. The directory also pins ESLint 9 while the root is on 10, so the binary has to come from its own `node_modules` regardless.

The upstream copy of this site also carried Biome. It was dropped: its formatter duplicated Prettier over the same files with different settings, and the lint rules that were earning their place — hook dependency lists, conditionally called hooks, missing keys in rendered lists — are now covered by `eslint-plugin-react-hooks`. Removing it was a simplification only because that plugin came in with it.

### Dependencies

pnpm resolves strictly, so a dependency has to be declared even when the upstream copy relied on the flat `node_modules` a Yarn install produced. `clsx`, `body-scroll-lock`, and `js-yaml` are all imported by code that never declared them and are listed in this package as a result. When a copied file fails to resolve an import that works upstream, the cause is usually this and the fix is a declaration, not a change to the file.

React is the other divergence. The upstream copy pins React 18 through a `resolutions` field, which pnpm does not read at all, and Rspress 2.x depends on React 19 itself. This package uses React 19 and does not carry the pin; translating it would mean a root `pnpm.overrides` entry, which applies repository-wide and would drag every other package down to 18.

### Content and languages

Only the framework was copied — `docs/docs/` holds the pages this repository writes for itself. The framework carries translations for ten languages (`cn en ja es pt de fr ru id vi`) in `rspress.config.ts` and `theme/locales.ts`, but a language is only built if it has a directory under `docs/docs/`. Today that is `cn` and `en`. Adding a language means creating the directory; the translations are already there.

`cn` is the baseline the structural checks in `check.sh` compare every other language against, so a page added to another language without its `cn` counterpart fails the tree and meta alignment checks.

Dead-link checking runs during build, but only over links in Markdown bodies. The home page's hero actions and feature cards live in frontmatter, so a route named there can be missing without failing the build — those need checking by hand.

## Language

Anything a person outside the team can read is written in English. Anything only the team reads may be written in Chinese.

Write in English:

- Commit messages and pull request titles
- Code comments, including comments in workflow files
- Identifiers, log output, and error messages
- Changeset summaries — they are copied verbatim into the published CHANGELOG
- Everything a GitHub Actions run produces that a contributor sees: `workflow_dispatch` input descriptions, job and step names, job summaries, `::error` and `::warning` annotations, and the body of any pull request the workflow opens

Chinese is fine for:

- Documents under `internal-docs/`
- Feishu notification titles and bodies, which only reach an internal group

The distinction is the audience, not the file type. A comment inside a workflow is read by maintainers and stays English along with the rest of the code; the Feishu message that same workflow sends never leaves the team, so it stays Chinese.

The workflow files under `.github/workflows/` still carry Chinese comments written before this rule existed. Translate the ones you touch; there is no need to convert the rest in a single pass.

`internal-docs/` is also excluded from Prettier in the root `.prettierignore`. It is prose written for the team to read and argue with, not an artefact, and reflowing a hand-written Chinese paragraph or realigning a table it wrote by hand buys nothing while filling a review with diff unrelated to the change. Write it however reads best.

## TypeScript Requirements for Library Development

Every package that emits `.d.ts` files (`declaration: true`) enables both `isolatedDeclarations: true` and `isolatedModules: true`. This currently covers:

| Configuration                                                  | Purpose                    |
| -------------------------------------------------------------- | -------------------------- |
| `packages/app/app-portal-sdk/tsconfig.json`                    | Portal SDK                 |
| `packages/plugins/app-plugin-authentication/tsconfig.json`     | Authentication library     |
| `packages/libs/authorization/tsconfig.json`                    | Authorization library      |
| `packages/libs/db/tsconfig.json`                               | Database package           |
| `packages/app/app-host/tsconfig.json`                          | Application host           |
| `packages/app/app-server/tsconfig.json`                        | Application server library |
| `packages/libs/caching/tsconfig.json`                          | Caching library            |
| `packages/libs/drive/tsconfig.json`                            | File storage library       |
| `packages/libs/snowflake/tsconfig.json`                        | Snowflake ID library       |
| `packages/libs/logging/tsconfig.json`                          | Logging library            |
| `packages/libs/queue/tsconfig.json`                            | Queue library              |
| `packages/libs/session/tsconfig.json`                          | Session library            |
| `packages/templates/app-template-default/tsconfig.server.json` | Default template server    |
| `packages/templates/app-template-hub/tsconfig.server.json`     | Hub server                 |

Within these scopes, every exported API must be declarable from the current file alone, without relying on cross-file type inference.

### Add Explicit Types to Every Export

- Exported functions, methods, getters, and arrow functions must declare their return types.
- Parameters with defaults must still declare their types. Write `name: string = getDefault()`, not `name = getDefault()`.
- Exported constants must declare their types, especially values inferred from calls such as `createContext(...)` or `new SomeClass()`. For example: `export const client: NocoBaseClient = new NocoBaseClient();`.
- When a function returns an anonymous object, extract the structure into a named exported type and use it as the return type. Existing examples include `RouteSurfaceState`, `AppExtensionContributions`, and `UseGetRolesResult`.

### Do Not Bypass Declaration Errors

Do not use `as any`, `@ts-ignore`, or `@ts-expect-error` to suppress `isolatedDeclarations` errors. Do not widen a type to `any` or `unknown` merely to make compilation pass. These errors indicate that the exported contract needs a precise annotation.

Annotations must match runtime behavior. For example, `resolveAclDataSourceKey` can return `undefined`, so its return type is `string | undefined` rather than `string`. `NocoBaseClient.stream()` throws when `response.body` is absent, so its return type is `Promise<ReadableStream<Uint8Array>>` rather than a nullable stream. Incorrect annotations propagate directly into downstream package failures.

### Validation After Changes

Run `pnpm typecheck` and `pnpm build` for the affected package. When changing `portal-sdk`, also run the `app-template-default` and `app-template-hub` typechecks because their exports point directly to SDK source and immediately consume its annotations.

## Other Notes

- Client code in `app-template-default` and `app-template-hub` (`tsconfig.json` and `tsconfig.node.json`) uses `noEmit` and only requires `isolatedModules`; it is not subject to the `isolatedDeclarations` rules above.
