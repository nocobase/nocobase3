# AGENTS.md

## Repository Layout

Every published package lives under `packages/`, grouped into six directories by what the package is. The grouping is a convention for readers: pnpm resolves packages by name, so which directory a package sits in changes nothing about how it is depended on or filtered.

| Directory             | What belongs here                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/libs/`      | Runtime libraries that solve one problem and know nothing about NocoBase applications, such as `caching`, `drive`, and `app-i18n`  |
| `packages/app/`       | The application runtime itself — what an application is built out of, such as `app-server-kit`, `app-client`, and `app-portal-sdk` |
| `packages/plugins/`   | Application plugins that ship as product features, such as `app-plugin-authentication`                                             |
| `packages/examples/`  | Application plugins that exist to demonstrate a capability, such as `app-plugin-routes-example`                                    |
| `packages/templates/` | Complete applications that `create-app` scaffolds from: `app-template-default` and `app-template-hub`                              |
| `packages/tools/`     | Development and build tooling that never ships inside an application, such as `dev-config`, `cli`, and `create-app`                |

`packages/README.md` describes each directory in more detail and is the place to look when a new package does not obviously belong to one of them. `pnpm plugin:create` scaffolds into `packages/plugins/`.

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
- Portal Vite configurations use `createPortalViteConfig` and inject the compatibility plugin from `@nocobase/app-portal-sdk/vite`. Keep `base`, API/proxy settings, `envPrefix`, and aliases local.
- Keep Playwright configuration package-local for now; there is no shared Playwright preset.

### Dependencies and Runtime

- Use `catalog:` entries from `pnpm-workspace.yaml` for shared critical dependencies such as TypeScript, ESLint, Prettier, Vitest, Vite, React, Tailwind, and Testing Library.
- Continue to use `workspace:` for internal NocoBase packages. A peer dependency may retain an explicit version range when it intentionally supports a wider range than the workspace version.
- After changing dependencies, run `CI=true pnpm install --no-frozen-lockfile` and commit the synchronized lockfile. CI uses a frozen lockfile.
- Node runtime, server, and tooling packages declare Node `>=24.0.0`. A browser-only runtime must not declare a Node runtime requirement merely because its development tooling uses Node.

### Package Publishing

Every package under `packages/` is published to npm, so none of them set `private: true`. Root `pnpm pack:check` automatically discovers every package in that directory and rejects private packages, incomplete publish metadata, missing or stale changelogs, invalid tarballs, unresolved workspace protocols, and broken export or declaration metadata.

A new package therefore starts at version `0.0.1`, sets `publishConfig.access` to `"public"` — scoped packages default to restricted and would otherwise fail to publish — and declares `files`. Without `files` the package ships its sources, tests, and configs; libraries ship `dist` alone, while template packages that users are meant to read and edit ship their sources instead.

Package names must not collide with what the v2 line already publishes. `@nocobase/database`, `@nocobase/app-server`, and `@nocobase/portal-sdk` are taken, which is why the v3 packages are `@nocobase/app-database`, `@nocobase/app-server-kit`, and `@nocobase/app-portal-sdk`. Check npm before settling on a name.

### Test Layout

Tests live in a `tests/` directory at the package root, never beside the source files they cover. A package with nested source roots puts `tests/` at the root of that source tree, as `packages/plugins/app-plugin-authentication/server/tests` does. Subdirectories inside `tests/` are free to reflect whatever the package needs, such as `tests/unit` and `tests/integration` in `packages/libs/app-database`, or `tests/logic` and `tests/components` in the Portal packages.

Name test files `*.test.ts` or `*.test.tsx`. Vitest discovers them by filename rather than by directory, so a test placed outside `tests/` still runs and will not fail loudly; keeping the layout consistent is a convention the tooling does not enforce for you.

Test files stay out of the build. Keep `include` in the package `tsconfig.json` pointed at `src` so `tests/` is excluded from the emitted output, unless the package deliberately typechecks its tests the way `packages/libs/app-database` does.

### Never Assert a Package's Own Version as a Literal

A test must not spell out the version of a package in this repository. Read it from the manifest instead:

```ts
import packageMetadata from '../package.json' with { type: 'json' };

expect(service.getInfo()).toMatchObject({ version: packageMetadata.version });
```

The release workflow runs `changeset version` and then runs the tests, so every published package is on a version different from the one committed by the time the suite executes. A literal that matches today fails during the next release, and it fails after the version bump — the point where the branch has already been rewritten and the run has to be repaired before anything can ship. `@nocobase/app-plugin-system-info` broke a release exactly this way, asserting `'0.0.1'` against a package `changeset version` had just moved to `0.1.0-beta.0`. `packages/templates/app-template-default` shows the shape to copy: its `declaredPluginVersion` helper resolves the version through `require` rather than repeating it.

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

## Language

Anything a person outside the team can read is written in English. Anything only the team reads may be written in Chinese.

Write in English:

- Commit messages and pull request titles
- Code comments, including comments in workflow files
- Identifiers, log output, and error messages
- Changeset summaries — they are copied verbatim into the published CHANGELOG
- Everything a GitHub Actions run produces that a contributor sees: `workflow_dispatch` input descriptions, job and step names, job summaries, `::error` and `::warning` annotations, and the body of any pull request the workflow opens

Chinese is fine for:

- Documents under `docs/`
- Feishu notification titles and bodies, which only reach an internal group

The distinction is the audience, not the file type. A comment inside a workflow is read by maintainers and stays English along with the rest of the code; the Feishu message that same workflow sends never leaves the team, so it stays Chinese.

The workflow files under `.github/workflows/` still carry Chinese comments written before this rule existed. Translate the ones you touch; there is no need to convert the rest in a single pass.

## TypeScript Requirements for Library Development

Every package that emits `.d.ts` files (`declaration: true`) enables both `isolatedDeclarations: true` and `isolatedModules: true`. This currently covers:

| Configuration                                                  | Purpose                    |
| -------------------------------------------------------------- | -------------------------- |
| `packages/app/app-portal-sdk/tsconfig.json`                    | Portal SDK                 |
| `packages/app/app-sdk/tsconfig.json`                           | Browser app SDK            |
| `packages/plugins/app-plugin-authentication/tsconfig.json`     | Authentication library     |
| `packages/libs/authorization/tsconfig.json`                    | Authorization library      |
| `packages/libs/app-database/tsconfig.json`                     | Database package           |
| `packages/app/app-host/tsconfig.json`                          | Application host           |
| `packages/app/app-server-kit/tsconfig.json`                    | Application server library |
| `packages/libs/caching/tsconfig.json`                          | Caching library            |
| `packages/libs/drive/tsconfig.json`                            | File storage library       |
| `packages/libs/id-generator/tsconfig.json`                     | ID generator library       |
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
