# AGENTS.md

## Selecting and Using Shared Development Configuration

All new packages must use `@nocobase/dev-config` by default. Do not copy a complete tsconfig, ESLint, Prettier, Vitest, or Vite configuration from an existing package. See `packages/dev-config/README.md` for the full English documentation; each configuration directory also has its own README.

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

Every package in `packages/` is published to npm, so none of them set `private: true`. A new package that declares it is excluded from the release and from `pack:check`, which means nothing catches a broken publish setup until someone tries to release it.

A new package therefore starts at version `0.0.1`, sets `publishConfig.access` to `"public"` — scoped packages default to restricted and would otherwise fail to publish — and declares `files`. Without `files` the package ships its sources, tests, and configs; libraries ship `dist` alone, while template packages that users are meant to read and edit ship their sources instead.

Package names must not collide with what the v2 line already publishes. `@nocobase/app-database`, `@nocobase/app-server-kit`, and `@nocobase/app-portal-sdk` are taken, which is why the v3 packages are `@nocobase/app-database`, `@nocobase/app-server-kit`, and `@nocobase/app-portal-sdk`. Check npm before settling on a name.

### Test Layout

Tests live in a `tests/` directory at the package root, never beside the source files they cover. A package with nested source roots puts `tests/` at the root of that source tree, as `packages/app-plugin-authentication/server/tests` does. Subdirectories inside `tests/` are free to reflect whatever the package needs, such as `tests/unit` and `tests/integration` in `packages/app-database`, or `tests/logic` and `tests/components` in the Portal packages.

Name test files `*.test.ts` or `*.test.tsx`. Vitest discovers them by filename rather than by directory, so a test placed outside `tests/` still runs and will not fail loudly; keeping the layout consistent is a convention the tooling does not enforce for you.

Test files stay out of the build. Keep `include` in the package `tsconfig.json` pointed at `src` so `tests/` is excluded from the emitted output, unless the package deliberately typechecks its tests the way `packages/app-database` does.

### Validation

At minimum, run `lint`, `typecheck`, `test`, and `build` for every package you modify. Root `pnpm check` also performs incremental formatting and publish-ready tarball checks. The Husky + lint-staged pre-commit hook fixes staged files automatically, but it does not replace CI.

The executable source of `@nocobase/dev-config` is TypeScript, while its npm
exports resolve to compiled ESM JavaScript and declarations in `dist`. When
changing `packages/dev-config`, run
`pnpm --filter @nocobase/dev-config check`; do not hand-edit generated output.

## TypeScript Requirements for Library Development

Every package that emits `.d.ts` files (`declaration: true`) enables both `isolatedDeclarations: true` and `isolatedModules: true`. This currently covers:

| Configuration                                        | Purpose                    |
| ---------------------------------------------------- | -------------------------- |
| `packages/app-portal-sdk/tsconfig.json`              | Portal SDK                 |
| `packages/app-sdk/tsconfig.json`                     | Browser app SDK            |
| `packages/app-plugin-authentication/tsconfig.json`   | Authentication library     |
| `packages/authorization/tsconfig.json`               | Authorization library      |
| `packages/app-database/tsconfig.json`                | Database package           |
| `packages/app-host/tsconfig.json`                    | Application host           |
| `packages/app-server-kit/tsconfig.json`              | Application server library |
| `packages/caching/tsconfig.json`                     | Caching library            |
| `packages/id-generator/tsconfig.json`                | ID generator library       |
| `packages/logging/tsconfig.json`                     | Logging library            |
| `packages/queue/tsconfig.json`                       | Queue library              |
| `packages/session/tsconfig.json`                     | Session library            |
| `packages/app-template-default/tsconfig.server.json` | Default template server    |
| `packages/hub/tsconfig.server.json`                  | Hub server                 |

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

Run `pnpm typecheck` and `pnpm build` for the affected package. When changing `portal-sdk`, also run the `app-template-default` and `hub` typechecks because their exports point directly to SDK source and immediately consume its annotations.

## Other Notes

- Client code in `app-template-default` and `hub` (`tsconfig.json` and `tsconfig.node.json`) uses `noEmit` and only requires `isolatedModules`; it is not subject to the `isolatedDeclarations` rules above.
